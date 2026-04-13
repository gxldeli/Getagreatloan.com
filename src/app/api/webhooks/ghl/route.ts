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

// --- Extract a custom field value from GHL's customFields (array or object) ---
function getCustomField(
  customFields: unknown,
  ...keys: string[]
): string {
  // GHL sends customFields as an array: [{ id, key, value, field_value }]
  if (Array.isArray(customFields)) {
    for (const field of customFields) {
      const fKey = (field.key ?? field.id ?? "") as string;
      const fVal = (field.field_value ?? field.value ?? "") as string;
      if (keys.some((k) => fKey.toLowerCase().includes(k.toLowerCase())) && fVal) {
        return fVal;
      }
    }
    return "";
  }
  // Fallback: plain object
  if (customFields && typeof customFields === "object") {
    const cf = customFields as Record<string, unknown>;
    for (const k of keys) {
      if (cf[k]) return String(cf[k]);
    }
  }
  return "";
}

// --- Extract contact fields from GHL webhook payload ---
function extractContact(body: Record<string, unknown>): {
  id: string;
  phone: string;
  firstName: string;
  loanType: string;
} | null {
  // GHL webhook payloads vary by trigger type. Try nested shapes first,
  // then fall back to top-level fields.
  const nested =
    (body.contact as Record<string, unknown>) ??
    (body.data as Record<string, unknown>);
  const data = nested ?? body;

  // --- Contact ID (GHL sends contact_id at top level) ---
  const id = String(
    body.contact_id ?? body.contactId ?? body.id ??
    data.contact_id ?? data.contactId ?? data.id ?? ""
  );

  // --- Phone (top-level in GHL payload) ---
  const phone = String(
    body.phone ?? body.phoneNumber ?? body.phone_number ??
    data.phone ?? data.phoneNumber ?? data.phone_number ?? ""
  );

  // --- First name (GHL sends first_name at top level) ---
  const firstName = String(
    body.first_name ?? body.firstName ?? body.full_name ?? body.contactName ??
    data.first_name ?? data.firstName ?? data.full_name ?? data.contactName ?? ""
  );

  // --- Loan type: check customFields array/object, then top-level fields ---
  const cfSource = data.customFields ?? data.custom_fields ??
    body.customFields ?? body.custom_fields;
  let loanType = getCustomField(cfSource, "loan_type", "goal", "loanType", "what_are_you_looking_for");
  if (!loanType) {
    loanType = String(data.goal ?? data.loan_type ?? data.loanType ??
      body.goal ?? body.loan_type ?? body.loanType ?? "");
  }

  console.log("[webhook] Extracted fields:", JSON.stringify({ id, phone, firstName, loanType }));
  console.log("[webhook] Top-level keys:", Object.keys(body).join(", "));
  if (nested) {
    console.log("[webhook] Nested keys:", Object.keys(nested).join(", "));
  }

  if (!id || !phone) {
    console.warn("[webhook] Missing id or phone. id =", JSON.stringify(id), "phone =", JSON.stringify(phone));
    return null;
  }

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
