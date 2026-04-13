import { NextRequest, NextResponse } from "next/server";

const GHL_API_KEY = process.env.GHL_API_KEY || "";
const GHL_LOCATION_ID = process.env.GHL_LOCATION_ID || "";

// --- GHL: look up contact by phone number ---
async function findContactByPhone(phone: string): Promise<string | null> {
  const params = new URLSearchParams({
    locationId: GHL_LOCATION_ID,
    query: phone,
  });
  const res = await fetch(
    `https://services.leadconnectorhq.com/contacts/search/duplicate?${params}`,
    {
      headers: {
        Authorization: `Bearer ${GHL_API_KEY}`,
        Version: "2021-07-28",
      },
    }
  );
  if (!res.ok) {
    console.error(`[retell-wh] GHL search error ${res.status}:`, await res.text());
    return null;
  }
  const data = await res.json();
  // The duplicate search returns { contact: { id, ... } } when found
  return (data?.contact?.id as string) ?? null;
}

// --- GHL: update contact with tags and notes ---
async function updateContact(
  contactId: string,
  tags: string[],
  notes: string
) {
  // Update tags
  const tagRes = await fetch(
    `https://services.leadconnectorhq.com/contacts/${contactId}`,
    {
      method: "PUT",
      headers: {
        Authorization: `Bearer ${GHL_API_KEY}`,
        "Content-Type": "application/json",
        Version: "2021-07-28",
      },
      body: JSON.stringify({ tags }),
    }
  );
  if (!tagRes.ok) {
    console.error(`[retell-wh] GHL tag update error ${tagRes.status}:`, await tagRes.text());
  }

  // Add note with call summary + transcript
  const noteRes = await fetch(
    `https://services.leadconnectorhq.com/contacts/${contactId}/notes`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${GHL_API_KEY}`,
        "Content-Type": "application/json",
        Version: "2021-07-28",
      },
      body: JSON.stringify({ body: notes }),
    }
  );
  if (!noteRes.ok) {
    console.error(`[retell-wh] GHL note error ${noteRes.status}:`, await noteRes.text());
  }
}

// --- Format seconds into "Xm Ys" ---
function formatDuration(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.round(seconds % 60);
  return m > 0 ? `${m}m ${s}s` : `${s}s`;
}

// --- Build a human-readable transcript from Retell's transcript array ---
function formatTranscript(
  transcript: Array<{ role: string; content: string }> | undefined
): string {
  if (!transcript || transcript.length === 0) return "(no transcript available)";
  return transcript
    .map((t) => `${t.role === "agent" ? "AI" : "Lead"}: ${t.content}`)
    .join("\n");
}

// --- Extract post-call analysis fields ---
function extractAnalysis(body: Record<string, unknown>): Record<string, string> {
  const fields: Record<string, string> = {};

  // Retell sends post-call data in call_analysis or custom_analysis_data
  const analysis =
    (body.call_analysis as Record<string, unknown>) ??
    (body.custom_analysis_data as Record<string, unknown>) ??
    (body.analysis as Record<string, unknown>);

  if (analysis) {
    const keys = [
      "credit_score",
      "employment_type",
      "appointment_booked",
      "appointment_date",
      "appointment_time",
      "call_summary",
      "call_successful",
      "customer_sentiment",
      "mortgage_balance",
      "loan_type",
      "timeline",
    ];
    for (const key of keys) {
      const val = analysis[key];
      if (val !== undefined && val !== null && val !== "") {
        fields[key] = String(val);
      }
    }
  }

  // Also check top-level for these (some Retell configs put them here)
  if (!fields.call_summary && body.call_summary) {
    fields.call_summary = String(body.call_summary);
  }

  return fields;
}

// --- POST handler ---
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    console.log("[retell-wh] Received Retell webhook:", JSON.stringify(body));

    // --- Extract call metadata ---
    const event = String(body.event ?? "");
    const callId = String(body.call_id ?? body.id ?? "");
    const callStatus = String(body.call_status ?? body.status ?? body.disconnection_reason ?? "unknown");
    const toNumber = String(body.to_number ?? body.to ?? "");
    const fromNumber = String(body.from_number ?? body.from ?? "");
    const durationMs = Number(body.call_duration_ms ?? body.duration_ms ?? 0);
    const durationSec = durationMs > 0 ? durationMs / 1000 : Number(body.call_duration ?? body.duration ?? 0);
    const transcript = body.transcript as Array<{ role: string; content: string }> | undefined;
    const transcriptText = body.transcript_text ?? body.transcript_string;

    // Only process call-ended / call-analyzed events
    if (event && event !== "call_ended" && event !== "call_analyzed") {
      console.log(`[retell-wh] Ignoring event type: ${event}`);
      return NextResponse.json({ ok: true, skipped: event });
    }

    console.log("[retell-wh] Call details:", JSON.stringify({
      callId, callStatus, toNumber, fromNumber, durationSec,
    }));

    // --- Extract analysis fields ---
    const analysis = extractAnalysis(body);
    const appointmentBooked =
      analysis.appointment_booked === "true" ||
      analysis.appointment_booked === "yes" ||
      analysis.appointment_booked === "1";

    console.log("[retell-wh] Analysis:", JSON.stringify(analysis));
    console.log("[retell-wh] Appointment booked:", appointmentBooked);

    // --- Find the GHL contact by phone ---
    const contactId = await findContactByPhone(toNumber);
    if (!contactId) {
      console.warn(`[retell-wh] No GHL contact found for ${toNumber}`);
      return NextResponse.json({
        ok: false,
        error: `No GHL contact found for ${toNumber}`,
      });
    }
    console.log(`[retell-wh] Found GHL contact: ${contactId}`);

    // --- Build the note ---
    const formattedTranscript =
      typeof transcriptText === "string" && transcriptText
        ? transcriptText
        : formatTranscript(transcript);

    const noteLines = [
      `--- AI Call Summary (${new Date().toISOString()}) ---`,
      `Call ID: ${callId}`,
      `Status: ${callStatus}`,
      `Duration: ${formatDuration(durationSec)}`,
      `From: ${fromNumber} → To: ${toNumber}`,
    ];

    if (analysis.call_summary) {
      noteLines.push(`\nSummary: ${analysis.call_summary}`);
    }

    const analysisEntries = Object.entries(analysis).filter(
      ([k]) => k !== "call_summary"
    );
    if (analysisEntries.length > 0) {
      noteLines.push("\n--- Extracted Data ---");
      for (const [key, val] of analysisEntries) {
        noteLines.push(`${key}: ${val}`);
      }
    }

    noteLines.push(`\n--- Transcript ---\n${formattedTranscript}`);

    const noteBody = noteLines.join("\n");

    // --- Determine tags ---
    const tags = ["Call Completed"];
    if (appointmentBooked) {
      tags.push("Appointment Booked");
    }

    // --- Update the contact in GHL ---
    await updateContact(contactId, tags, noteBody);
    console.log(`[retell-wh] Updated GHL contact ${contactId} with tags: ${tags.join(", ")}`);

    return NextResponse.json({
      ok: true,
      contactId,
      tags,
      appointmentBooked,
    });
  } catch (err) {
    console.error("[retell-wh] Error:", err);
    return NextResponse.json(
      { error: "Failed to process Retell webhook" },
      { status: 500 }
    );
  }
}

// --- GET handler (health check) ---
export async function GET() {
  return NextResponse.json({
    ok: true,
    service: "retell-post-call-webhook",
  });
}
