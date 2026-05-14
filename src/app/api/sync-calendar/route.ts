import { NextResponse } from "next/server";
import { google } from "googleapis";
import { createClient } from "@/lib/supabase-server";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { parseCalendarEvent, eventMatchesTrigger, normalizePhone, isSuspiciousClientName } from "@/lib/calendarParser";
import { geminiParseEvent } from "@/lib/geminiParseEvent";
import { notify } from "@/lib/notify";
import { format } from "date-fns";
import { cs } from "date-fns/locale";

function isMissingPhone(phone: string | null | undefined): boolean {
  if (!phone) return true;
  const p = phone.trim();
  return !p || p === "—" || p === "-";
}

/**
 * POST /api/sync-calendar
 * Pro přihlášeného uživatele načte z Google Kalendáře události s klíčovým slovem
 * a zapíše je do viewings (místo, datum/čas, jméno, tel.).
 */
export async function POST() {
  const supabase = await createClient();
  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Přihlaste se" }, { status: 401 });
  }

  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    return NextResponse.json(
      { error: "Chybí konfigurace Google (GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET)" },
      { status: 500 }
    );
  }

  let supabaseAdmin;
  try {
    supabaseAdmin = getSupabaseAdmin();
  } catch {
    return NextResponse.json(
      { error: "Server není nakonfigurován (SUPABASE_SERVICE_ROLE_KEY)" },
      { status: 500 }
    );
  }

  const { data: settings } = await supabaseAdmin
    .from("user_settings")
    .select("trigger_keyword, google_refresh_token, whatsapp_phone, whatsapp_apikey, notification_channel, notification_email, default_sms2h_enabled, default_sms1h_enabled, default_vapi_enabled, default_extra_notifications")
    .eq("user_id", session.user.id)
    .maybeSingle();

  if (!settings?.google_refresh_token) {
    return NextResponse.json(
      { error: "Nejprve propojte Google Kalendář v Nastavení" },
      { status: 400 }
    );
  }

  const oauth2Client = new google.auth.OAuth2(clientId, clientSecret, "");
  oauth2Client.setCredentials({ refresh_token: settings.google_refresh_token });
  const calendar = google.calendar({ version: "v3", auth: oauth2Client });

  const now = new Date();
  const timeMin = now.toISOString();
  const timeMax = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000).toISOString(); // 1 měsíc dopředu
  const keyword = (settings.trigger_keyword ?? "#prohlidka").trim();

  let synced = 0;
  const missingPhoneItems: { address: string; start: string }[] = [];
  const suspiciousNameItems: { address: string; start: string; name: string; reason: string }[] = [];
  try {
    const { data: events } = await calendar.events.list({
      calendarId: "primary",
      timeMin,
      timeMax,
      singleEvents: true,
      orderBy: "startTime",
    });

    const items = events.items ?? [];

    // Načíst existující prohlídky uživatele (zachováme jejich stav)
    const { data: existingViewings } = await supabaseAdmin
      .from("viewings")
      .select("id, calendar_event_id, status, sms2h_sent, sms1h_sent, vapi_called, sms_sent_at, confirmed_at, sms2h_enabled, sms1h_enabled, vapi_enabled, extra_notifications")
      .eq("user_id", session.user.id);

    const existingMap = new Map((existingViewings ?? []).map((v) => [v.calendar_event_id, v]));
    const calendarEventIds = new Set<string>();

    for (const ev of items) {
      const start = ev.start?.dateTime ?? ev.start?.date;
      const end = ev.end?.dateTime ?? ev.end?.date;
      if (!start || !ev.id) continue;

      const summary = ev.summary ?? "";
      const description = ev.description ?? "";
      const location = ev.location ?? "";
      let parsed = parseCalendarEvent(
        ev.id,
        summary,
        description,
        location,
        start,
        end ?? start,
        keyword
      );

      if (!parsed && eventMatchesTrigger(summary, description, keyword)) {
        const fullText = [summary, description, location].filter(Boolean).join(" ");
        const gemini = await geminiParseEvent(fullText);
        if (gemini && (gemini.address || gemini.clientPhone)) {
          parsed = {
            id: ev.id,
            summary,
            description,
            location,
            start,
            end: end ?? start,
            address: gemini.address || "—",
            clientPhone: normalizePhone(gemini.clientPhone || "—"),
            clientName: gemini.clientName || "Klient",
          };
        }
      }
      if (!parsed) continue;

      calendarEventIds.add(ev.id);
      const nameCheck = isSuspiciousClientName(parsed.clientName);
      const clientName = nameCheck.fixedName ?? parsed.clientName;
      const existing = existingMap.get(ev.id);

      if (existing) {
        // Aktualizovat jen kalendářová data, zachovat stav
        await supabaseAdmin.from("viewings").update({
          address: parsed.address,
          client_phone: parsed.clientPhone,
          client_name: clientName,
          event_start: parsed.start,
          event_end: parsed.end,
          updated_at: new Date().toISOString(),
        }).eq("id", existing.id);
      } else {
        // Nová prohlídka
        await supabaseAdmin.from("viewings").insert({
          user_id: session.user.id,
          calendar_event_id: ev.id,
          address: parsed.address,
          client_phone: parsed.clientPhone,
          client_name: clientName,
          event_start: parsed.start,
          event_end: parsed.end,
          sms2h_enabled: settings?.default_sms2h_enabled ?? true,
          sms1h_enabled: settings?.default_sms1h_enabled ?? true,
          vapi_enabled: settings?.default_vapi_enabled ?? true,
          extra_notifications: ((settings?.default_extra_notifications ?? []) as { id: string; type: string; minutesBefore: number; label: string }[]).map((n) => ({
            ...n,
            id: crypto.randomUUID(),
            sent: false,
            enabled: true,
          })),
          updated_at: new Date().toISOString(),
        });
      }


      if (isMissingPhone(parsed.clientPhone)) {
        missingPhoneItems.push({ address: parsed.address, start: parsed.start });
      }
      if (nameCheck.suspicious && !nameCheck.fixedName) {
        suspiciousNameItems.push({ address: parsed.address, start: parsed.start, name: parsed.clientName, reason: nameCheck.reason ?? "" });
      }
      synced++;
    }
    // Smazat prohlídky které už nejsou v Google Kalendáři
    const toDelete = (existingViewings ?? []).filter((v) => !calendarEventIds.has(v.calendar_event_id)).map((v) => v.id);
    if (toDelete.length > 0) {
      await supabaseAdmin.from("viewings").delete().in("id", toDelete);
    }
  } catch (err) {
    console.error("Sync calendar:", err);
    return NextResponse.json(
      { error: "Nepodařilo se načíst kalendář. Zkontrolujte propojení v Nastavení." },
      { status: 500 }
    );
  }

  // Upozornění na chybějící telefonní čísla
  if (missingPhoneItems.length > 0 && settings) {
    const list = missingPhoneItems
      .map((v) => `• ${v.address} (${format(new Date(v.start), "d.M. HH:mm", { locale: cs })})`)
      .join("\n");
    await notify(
      settings,
      `⚠️ Chybí tel. číslo u ${missingPhoneItems.length} prohlídky`,
      `⚠️ Nové prohlídky bez telefonního čísla:\n${list}\n\nDoplňte číslo klienta v Google Kalendáři nebo prohlídku zrušte.`
    ).catch(() => {});
  }

  // Upozornění na podezřelá jména klientů
  if (suspiciousNameItems.length > 0 && settings) {
    const list = suspiciousNameItems
      .map((v) => `• „${v.name}" – ${v.reason}\n  ${v.address} (${format(new Date(v.start), "d.M. HH:mm", { locale: cs })})`)
      .join("\n");
    await notify(settings, `⚠️ Zkontrolujte jména klientů (${suspiciousNameItems.length})`, `⚠️ U těchto prohlídek vypadá jméno klienta podezřele – zkontrolujte prosím v kalendáři:\n\n${list}`).catch(() => {});
  }

  return NextResponse.json({ ok: true, synced, missingPhone: missingPhoneItems.length, suspiciousNames: suspiciousNameItems.length });
}
