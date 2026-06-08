import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase-server";
import Anthropic from "@anthropic-ai/sdk";

const BROKER_NAME = "Kristián Karas";
const BROKER_PHONE = "+420 777 726 001";
const AGENCY_NAME = "Dobro Reality";

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
  notes: string;
}): Promise<{ systemPrompt: string; firstMessage: string }> {
  const { listing, ownerName, notes } = params;

  const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

  const response = await anthropic.messages.create({
    model: "claude-haiku-4-5-20251001",
    max_tokens: 1000,
    messages: [{
      role: "user",
      content: `Jsi expert na realitní telemarketing. Na základě inzerátu vytvoř personalizovanou strategii pro AI asistenta, který zavolá majiteli.

INZERÁT: ${listing || "Není k dispozici"}
MAJITEL: ${ownerName || "Majitel"}
MAKLÉŘ: ${BROKER_NAME} (${BROKER_PHONE})
KANCELÁŘ: ${AGENCY_NAME}
${notes ? `EXTRA POKYNY: ${notes}` : ""}

Filozofie: ${AGENCY_NAME} fandí každému, kdo prodává sám. NENABÍZÍME spolupráci ani provizi. Nabízíme bezplatnou pomoc: právní rady, kontakt na právníka/fotografa, poradenství ke smlouvám.

Odpověz POUZE validním JSON (bez markdown):
{
  "systemPrompt": "Kompletní systémový prompt pro AI asistenta v češtině. Personalizovaný pro tento inzerát. Přátelský tón, ich forma (Vy/Vám). Zahrnout: filozofii pomoci bez prodeje, průběh hovoru, co nabídnout, zakázaná slova.",
  "firstMessage": "Dobrý den, zdravím Vás — jsem AI asistent realitní kanceláře Dobro Reality. Dovolal jsem se správně, mluvím s ${ownerName || "Vámi"}? Volám Vám ohledně Vaší nemovitosti a chtěl jsem se zeptat, jak Vám daří s prodejem."
}`,
    }],
  });

  const raw = response.content[0].type === "text" ? response.content[0].text.trim() : "{}";
  const parsed = JSON.parse(raw);
  return {
    systemPrompt: parsed.systemPrompt ?? buildFallbackPrompt({ listing, ownerName, notes }),
    firstMessage: parsed.firstMessage ?? buildFirstMessage(ownerName),
  };
}

function buildFirstMessage(ownerName: string): string {
  return `Dobrý den, zdravím Vás — jsem AI asistent realitní kanceláře ${AGENCY_NAME}. Dovolal jsem se správně, mluvím s ${ownerName || "Vámi"}? Volám Vám ohledně Vaší nemovitosti a chtěl jsem se zeptat, jak Vám daří s prodejem.`;
}

function buildFallbackPrompt(p: { listing: string; ownerName: string; notes: string }): string {
  return `Jsi přátelský AI asistent realitní kanceláře ${AGENCY_NAME}. Voláš majiteli, který prodává nemovitost sám.

Nemovitost: ${p.listing}
Majitel: ${p.ownerName}
${p.notes ? `\nPOKYNY: ${p.notes}` : ""}

PRVNÍ VĚTA (přečti přesně):
"Dobrý den, zdravím Vás — jsem AI asistent realitní kanceláře ${AGENCY_NAME}. Dovolal jsem se správně, mluvím s ${p.ownerName}? Volám Vám ohledně Vaší nemovitosti a chtěl jsem se zeptat, jak Vám daří s prodejem."

FILOZOFIE HOVORU:
V ${AGENCY_NAME} fandíme každému, kdo prodává sám. NENABÍZÍME spolupráci ani provizi. Nabízíme bezplatnou pomoc:
- Odborná rada k právním náležitostem převodu
- Kontakt na prověřeného právníka ve vašem městě
- Kontakt na profesionálního realitního fotografa ve vašem kraji
- Poradenství ke správnému postupu uzavření realitních smluv

PRŮBĚH HOVORU:
1. Přivítání + ověření správné osoby (viz první věta)
2. Zeptej se jak jim jde prodej — vyslechni odpověď
3. Nabídni konkrétní bezplatnou pomoc (max 2 věci)
4. Pokud mají zájem → makléř ${BROKER_NAME} (${BROKER_PHONE}) se ozve
5. Rozluč se: "Děkujeme, ${AGENCY_NAME} — jsme tady, abychom šířili dobré skutky."

STYL: Přátelský, upřímný, pomalý — ne prodejní. Mluv v ich formě (Vy, Vám). Naslouchej.
ZAKÁZÁNO: nabízet spolupráci, provizi, tlačit na schůzku, říkat "samozřejmě", "určitě", "výborně".
UKONČENÍ: Majitel nemá zájem → poděkuj, rozluč se. Nereaguje 8s → ukonči hovor.`;
}

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json().catch(() => null);
  if (!body) return NextResponse.json({ error: "Invalid body" }, { status: 400 });

  const { phone, ownerName, listing, notes, promptTemplate, firstMessageTemplate } = body as {
    phone: string;
    ownerName?: string;
    listing?: string;
    notes?: string;
    promptTemplate?: string;
    firstMessageTemplate?: string;
  };

  const apiKey = process.env.VAPI_API_KEY;
  const assistantId = process.env.VAPI_ASSISTANT_ID;
  const phoneNumberId = process.env.VAPI_PHONE_NUMBER_ID;

  if (!apiKey || !assistantId || !phoneNumberId) {
    return NextResponse.json({ error: "VAPI env proměnné nejsou nastaveny" }, { status: 500 });
  }

  if (!phone) {
    return NextResponse.json({ error: "Chybí telefonní číslo" }, { status: 400 });
  }

  const ownerNameFull = ownerName?.trim() || "Majiteli";
  const listingText = listing?.trim() || "";
  const notesText = notes?.trim() || "";

  const vars: Record<string, string> = {
    listing: listingText,
    notes: notesText ? `POKYNY A POZNÁMKY PRO TENTO HOVOR:\n${notesText}` : "",
    ownerName: ownerNameFull,
    brokerName: BROKER_NAME,
    brokerPhone: BROKER_PHONE,
    agencyName: AGENCY_NAME,
    phone: toE164(phone),
  };

  const substituteVars = (template: string) =>
    template.replace(/\{\{(\w+)\}\}/g, (_, key) => vars[key] ?? "");

  let systemPrompt: string;
  let firstMessage: string;

  if (promptTemplate?.trim()) {
    systemPrompt = substituteVars(promptTemplate);
    firstMessage = firstMessageTemplate?.trim()
      ? substituteVars(firstMessageTemplate)
      : buildFirstMessage(ownerNameFull);
  } else if (process.env.ANTHROPIC_API_KEY) {
    try {
      ({ systemPrompt, firstMessage } = await generateCallStrategy({
        listing: listingText, ownerName: ownerNameFull, notes: notesText,
      }));
    } catch {
      systemPrompt = buildFallbackPrompt({ listing: listingText, ownerName: ownerNameFull, notes: notesText });
      firstMessage = buildFirstMessage(ownerNameFull);
    }
  } else {
    systemPrompt = buildFallbackPrompt({ listing: listingText, ownerName: ownerNameFull, notes: notesText });
    firstMessage = buildFirstMessage(ownerNameFull);
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
          brokerName: BROKER_NAME,
          brokerPhone: BROKER_PHONE,
          agencyName: AGENCY_NAME,
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
