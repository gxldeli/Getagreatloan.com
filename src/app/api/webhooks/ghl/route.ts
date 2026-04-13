import { NextRequest, NextResponse } from "next/server";

// --- Configuration ---
const RETELL_API_KEY = process.env.RETELL_API_KEY || "";
const RETELL_AGENT_ID = process.env.RETELL_AGENT_ID || "";
const RETELL_FROM_NUMBER = process.env.RETELL_FROM_NUMBER || "";
const GHL_API_KEY = process.env.GHL_API_KEY || "";
const GHL_LOCATION_ID = process.env.GHL_LOCATION_ID || "";

// --- Retell AI: create outbound phone call ---
async function createRetellCall(contact: {
  phone: string;
  firstName: string;
  loanType: string;
}) {
  const res = await fetch("https://api.retellai.com/v2/create-phone-call", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${RETELL_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from_number: RETELL_FROM_NUMBER,
      to_number: contact.phone,
      override_agent_id: RETELL_AGENT_ID,
      retell_llm_dynamic_variables: {
        first_name: contact.firstName,
        loan_type: contact.loanType,
      },
    }),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Retell API error ${res.status}: ${body}`);
  }

  return res.json();
}

// --- GHL: add tag to contact ---
async function addTagToContact(contactId: string, tag: string) {
  const res = await fetch(
    `https://services.leadconnectorhq.com/contacts/${contactId}`,
    {
      method: "PUT",
      headers: {
        Authorization: `Bearer ${GHL_API_KEY}`,
        "Content-Type": "application/json",
        Version: "2021-07-28",
      },
      body: JSON.stringify({ tags: [tag] }),
    }
  );

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`GHL API error ${res.status}: ${body}`);
  }

  return res.json();
}

// --- Normalize phone to E.164 ---
function normalizePhone(raw: string): string {
  const digits = raw.replace(/\D/g, "");
  if (digits.startsWith("1") && digits.length === 11) return `+${digits}`;
  if (digits.length === 10) return `+1${digits}`;
  return `+${digits}`;
}

// --- Execute outbound call + tag ---
async function processContact(contact: {
  id: string;
  phone: string;
  firstName: string;
  loanType: string;
}) {
  console.log(
    `[retell] Initiating outbound call to ${contact.phone} for contact ${contact.id}`
  );
  const callResult = await createRetellCall(contact);
  console.log(`[retell] Call created:`, callResult);

  console.log(`[ghl] Adding "AI Called" tag to contact ${contact.id}`);
  await addTagToContact(contact.id, "AI Called");
  console.log(`[ghl] Tag added successfully`);
}

// --- Extract contact fields from GHL webhook payload ---
function extractContact(body: Record<string, unknown>): {
  id: string;
  phone: string;
  firstName: string;
  loanType: string;
} | null {
  // GHL webhook payloads vary by trigger type. Common shapes:
  // 1. Top-level: { id, phone, firstName, ... }
  // 2. Nested under "contact": { contact: { id, phone, ... } }
  // 3. Nested under "data": { data: { id, phone, ... } }
  const data =
    (body.contact as Record<string, unknown>) ??
    (body.data as Record<string, unknown>) ??
    body;

  const id = (data.id ?? data.contactId ?? data.contact_id ?? "") as string;
  const phone = (data.phone ?? data.phoneNumber ?? data.phone_number ?? "") as string;
  const firstName = (data.firstName ?? data.first_name ?? data.name ?? "") as string;

  // Loan type can come from customFields, custom_fields, or the "goal" form field
  let loanType = "";
  if (data.customFields && typeof data.customFields === "object") {
    const cf = data.customFields as Record<string, unknown>;
    loanType = (cf.loan_type ?? cf.goal ?? cf.loanType ?? "") as string;
  }
  if (!loanType && data.custom_fields && typeof data.custom_fields === "object") {
    const cf = data.custom_fields as Record<string, unknown>;
    loanType = (cf.loan_type ?? cf.goal ?? cf.loanType ?? "") as string;
  }
  if (!loanType) {
    loanType = (data.goal ?? data.loan_type ?? data.loanType ?? "") as string;
  }

  if (!id || !phone) return null;

  return { id, phone: normalizePhone(phone), firstName, loanType };
}

// --- POST handler ---
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    console.log("[webhook] Received GHL webhook:", JSON.stringify(body));

    const contact = extractContact(body);
    if (!contact) {
      console.warn("[webhook] Missing contact id or phone, skipping");
      return NextResponse.json(
        { error: "Missing contact id or phone number" },
        { status: 400 }
      );
    }

    // Call Retell immediately and tag the contact
    await processContact(contact);

    return NextResponse.json({
      ok: true,
      message: `Outbound call initiated for ${contact.phone}`,
    });
  } catch (err) {
    console.error("[webhook] Failed to parse request:", err);
    return NextResponse.json(
      { error: "Invalid request body" },
      { status: 400 }
    );
  }
}

// --- GET handler (health check) ---
export async function GET() {
  return NextResponse.json({
    ok: true,
    service: "ghl-retell-webhook",
  });
}
