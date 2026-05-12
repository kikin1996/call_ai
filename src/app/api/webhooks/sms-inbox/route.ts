import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { notify } from "@/lib/notify";
import Anthropic from "@anthropic-ai/sdk";

function normalizePhone(phone: string): string {
  return phone.replace(/\D/g, "").trim();
}

type Intent = "confirmed" | "declined" | "uncertain";

async function classifyIntent(message: string): Promise<{ intent: Intent; confirmedLabel: string; reason: string }> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    // Fallback na keyword matching pokud není API klíč
    const t = message.trim().toUpperCase();
    if (/\b(ANO|YES|OK|POTVRZUJI|POTVRZUJU|DORAZÍM|DORAZIM|PRIJDU|PŘIJDU)\b/.test(t)) {
      return { intent: "confirmed", confirmedLabel: "ANO", reason: "keyword match" };
    }
    if (/\b(NE|NO|CANCEL|NEDORAZÍM|NEDORAZIM|NEPRIJDU|NEPŘIJDU|ZRUŠIT|STORNO)\b/.test(t)) {
      return { intent: "declined", confirmedLabel: "NE", reason: "keyword match" };
    }
    return { intent: "uncertain", confirmedLabel: "MOŽNÁ", reason: "no clear keyword" };
  }

  const client = new Anthropic({ apiKey });
  const response = await client.messages.create({
    model: "claude-haiku-4-5-20251001",
    max_tokens: 200,
    messages: [
      {
        role: "user",
        content: `SMS od českého klienta realitní prohlídky. Urči záměr:
- confirmed: potvrdil účast (ANO, potvrzuji, dorazím, ok, yes, přijdu...)
- declined: odmítl (NE, nedorazím, zrušit, cancel, no, nepřijdu...)
- uncertain: nejasné nebo část informace

Zpráva: "${message}"

Odpověz POUZE JSON bez jakéhokoli dalšího textu:
{"intent":"confirmed|declined|uncertain","confirmed_label":"ANO|NE|MOŽNÁ","reason":"krátké vysvětlení česky"}`,
      },
    ],
  });

  const text = response.content[0].type === "text" ? response.content[0].text : "{}";
  try {
    const parsed = JSON.parse(text.trim());
    return {
      intent: parsed.intent ?? "uncertain",
      confirmedLabel: parsed.confirmed_label ?? "MOŽNÁ",
      reason: parsed.reason ?? "",
    };
  } catch {
    return { intent: "uncertain", confirmedLabel: "MOŽNÁ", reason: "parse error" };
  }
}

// SMSbrána posílá příchozí SMS jako GET nebo POST s query params
export async function GET(request: NextRequest) {
  return handleIncoming(request.nextUrl.searchParams);
}

export async function POST(request: NextRequest) {
  let params: URLSearchParams;
  const contentType = request.headers.get("content-type") ?? "";
  if (contentType.includes("application/x-www-form-urlencoded")) {
    const text = await request.text();
    params = new URLSearchParams(text);
  } else {
    // Zkus JSON
    try {
      const json = await request.json();
      params = new URLSearchParams(json);
    } catch {
      params = request.nextUrl.searchParams;
    }
  }
  return handleIncoming(params);
}

async function handleIncoming(params: URLSearchParams): Promise<NextResponse> {
  const number = params.get("number") ?? params.get("phone") ?? params.get("From") ?? "";
  const message = params.get("message") ?? params.get("text") ?? params.get("Body") ?? "";

  if (!number || !message) {
    return NextResponse.json({ ok: true });
  }

  const fromNormalized = normalizePhone(number);

  let supabaseAdmin;
  try {
    supabaseAdmin = getSupabaseAdmin();
  } catch {
    return NextResponse.json({ error: "Supabase not configured" }, { status: 500 });
  }

  // Najít matching prohlídku podle telefonu (poslední 7 dní, stav sms_sent nebo pending)
  const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
  const { data: viewings } = await supabaseAdmin
    .from("viewings")
    .select("id, user_id, client_phone, client_name, address, event_start, status")
    .in("status", ["sms_sent", "pending"])
    .gte("event_start", since);

  const viewing = (viewings ?? []).find(
    (v) => normalizePhone((v as { client_phone: string }).client_phone) === fromNormalized
  ) as { id: string; user_id: string; client_phone: string; client_name: string; address: string; event_start: string } | undefined;

  if (!viewing) {
    return NextResponse.json({ ok: true, message: "No matching viewing" });
  }

  // AI klasifikace záměru
  const { intent, confirmedLabel, reason } = await classifyIntent(message).catch(() => ({
    intent: "uncertain" as Intent,
    confirmedLabel: "MOŽNÁ",
    reason: "error",
  }));

  const newStatus =
    intent === "confirmed" ? "confirmed" : intent === "declined" ? "cancelled" : null;

  if (newStatus) {
    await supabaseAdmin
      .from("viewings")
      .update({
        status: newStatus,
        confirmed_at: newStatus === "confirmed" ? new Date().toISOString() : null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", viewing.id);
  }

  // Telegram notifikace brokerovi
  const { data: settings } = await supabaseAdmin
    .from("user_settings")
    .select("whatsapp_phone, whatsapp_apikey, notification_channel, notification_email")
    .eq("user_id", viewing.user_id)
    .maybeSingle();

  if (settings) {
    const name = (viewing as { client_name: string }).client_name || number;
    await notify(settings, `Odpověď klienta – ${name}`, `💬 Odpověď klienta: ${name} (${number})\n📍 ${(viewing as { address: string }).address}\n✉️ Zpráva: "${message}"\n→ ${confirmedLabel}${reason ? ` (${reason})` : ""}`);
  }

  return NextResponse.json({ ok: true, intent, status: newStatus ?? "unchanged" });
}
