import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase-server";
import Anthropic from "@anthropic-ai/sdk";

function toE164(phone: string): string {
  let n = phone.replace(/[\s\-().]/g, "");
  if (n.startsWith("00")) n = "+" + n.slice(2);
  else if (n.startsWith("0")) n = "+420" + n.slice(1);
  else if (!n.startsWith("+")) n = "+420" + n;
  return n;
}

async function generateCallStrategy(params: {
  listing: string;
  ownerName: string;
  brokerName: string;
  brokerPhone: string;
  agencyName: string;
  notes: string;
}): Promise<{ systemPrompt: string; firstMessage: string }> {
  const { listing, ownerName, brokerName, brokerPhone, agencyName, notes } = params;

  const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

  const response = await anthropic.messages.create({
    model: "claude-haiku-4-5-20251001",
    max_tokens: 1000,
    messages: [{
      role: "user",
      content: `Jsi expert na realitní telemarketing. Na základě inzerátu vytvoř personalizovanou strategii pro AI asistenta, který zavolá majiteli.

INZERÁT: ${listing || "Není k dispozici"}
MAJITEL: ${ownerName || "Majitel"}
MAKLÉŘ: ${brokerName}${brokerPhone ? ` (${brokerPhone})` : ""}
KANCELÁŘ: ${agencyName}
${notes ? `EXTRA POKYNY: ${notes}` : ""}

Odpověz POUZE validním JSON (bez markdown):
{
  "systemPrompt": "Kompletní systémový prompt pro AI asistenta v češtině. Musí obsahovat: roli asistenta, kontext inzerátu, styl komunikace (rychlý, úsečný, sebejistý, max 15 slov na větu), průběh hovoru (max 90s), co nabídnout, co je zakázáno, kdy ukončit. Vše personalizované pro tento konkrétní inzerát.",
  "firstMessage": "První věta kterou asistent řekne — představení + důvod volání v JEDNÉ větě, max 20 slov, přirozené, bez 'Dobrý den' na začátku"
}`,
    }],
  });

  const raw = response.content[0].type === "text" ? response.content[0].text.trim() : "{}";
  const parsed = JSON.parse(raw);
  return {
    systemPrompt: parsed.systemPrompt ?? buildFallbackPrompt(params),
    firstMessage: parsed.firstMessage ?? `Dobrý den, volám z kanceláře ${agencyName} jménem makléře ${brokerName} — zajímáme se o vaši nemovitost a rádi bychom vám nabídli spolupráci.`,
  };
}

function buildFallbackPrompt(p: { listing: string; ownerName: string; brokerName: string; brokerPhone: string; agencyName: string; notes: string }): string {
  return `Jsi rychlý a přímý obchodní asistent realitní kanceláře ${p.agencyName}, voláš jménem makléře ${p.brokerName}.

Voláš majiteli nemovitosti: ${p.listing}${p.notes ? `\n\nPOKYNY: ${p.notes}` : ""}

STYL: Mluv rychle, úsečně, sebejistě. Každá věta musí mít účel. Max 15 slov na větu.

Průběh hovoru (max 90 sekund):
1. Představ se + důvod volání — 1 věta
2. Nabídka — 2 věty max
3. Otázka na zájem o schůzku — 1 otázka
4. Domluv kontakt s ${p.brokerName}${p.brokerPhone ? ` (${p.brokerPhone})` : ""} NEBO se rozluč

ZAKÁZÁNO: vycpávková slova (samozřejmě, rozumím, určitě), chválení inzerátu, opakování.

Majitel odmítl → 1 věta na rozloučení. Nereaguje 8s → ukonči hovor.`;
}

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json().catch(() => null);
  if (!body) return NextResponse.json({ error: "Invalid body" }, { status: 400 });

  const {
    apiKey, assistantId, phoneNumberId, phone,
    ownerName, listing, notes,
    brokerName: bn, brokerPhone: bp, agencyName: an,
  } = body as {
    apiKey: string; assistantId: string; phoneNumberId: string; phone: string;
    ownerName?: string; listing?: string; notes?: string;
    brokerName?: string; brokerPhone?: string; agencyName?: string;
  };

  if (!apiKey || !assistantId || !phoneNumberId || !phone) {
    return NextResponse.json({ error: "Chybí povinné pole (apiKey, assistantId, phoneNumberId, phone)" }, { status: 400 });
  }

  const brokerName = bn?.trim() || "váš makléř";
  const brokerPhone = bp?.trim() || "";
  const agencyName = an?.trim() || "naše realitní kancelář";
  const ownerNameFull = ownerName?.trim() || "Majiteli";
  const listingText = listing?.trim() || "";
  const notesText = notes?.trim() || "";

  // Vygeneruj personalizovaný prompt a první větu pomocí Claude
  let systemPrompt: string;
  let firstMessage: string;

  if (process.env.ANTHROPIC_API_KEY) {
    try {
      ({ systemPrompt, firstMessage } = await generateCallStrategy({
        listing: listingText, ownerName: ownerNameFull,
        brokerName, brokerPhone, agencyName, notes: notesText,
      }));
    } catch {
      systemPrompt = buildFallbackPrompt({ listing: listingText, ownerName: ownerNameFull, brokerName, brokerPhone, agencyName, notes: notesText });
      firstMessage = `Dobrý den, volám z kanceláře ${agencyName} jménem makléře ${brokerName} — zajímáme se o vaši nemovitost.`;
    }
  } else {
    systemPrompt = buildFallbackPrompt({ listing: listingText, ownerName: ownerNameFull, brokerName, brokerPhone, agencyName, notes: notesText });
    firstMessage = `Dobrý den, volám z kanceláře ${agencyName} jménem makléře ${brokerName} — zajímáme se o vaši nemovitost.`;
  }

  const res = await fetch("https://api.vapi.ai/call", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({
      type: "outboundPhoneCall",
      assistantId,
      phoneNumberId,
      customer: { number: toE164(phone), name: ownerNameFull },
      assistantOverrides: {
        firstMessage,
        variableValues: {
          systemPrompt,
          firstMessage,
          ownerName: ownerNameFull,
          listing: listingText,
          notes: notesText,
          phone: toE164(phone),
          brokerName,
          brokerPhone,
          agencyName,
        },
      },
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    return NextResponse.json({ error: `VAPI: ${err}` }, { status: 500 });
  }

  const data = await res.json();
  return NextResponse.json({ callId: data.id });
}
