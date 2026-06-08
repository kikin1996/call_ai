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
      content: `Jsi expert na realitní telemarketing. Vytvoř systémový prompt pro AI asistenta, který zavolá majiteli nemovitosti.

NEMOVITOST: ${listing || "Není k dispozici"}
MAJITEL: ${ownerName || "Majitel"}
MAKLÉŘ: ${BROKER_NAME} (${BROKER_PHONE})
KANCELÁŘ: ${AGENCY_NAME}
${notes ? `EXTRA POKYNY: ${notes}` : ""}

FILOZOFIE ${AGENCY_NAME} — musí být jasně ve volání:
V ${AGENCY_NAME} fandíme každému, kdo se rozhodne prodat nemovitost sám na vlastní pěst. Každý den se snažíme udělat alespoň jeden dobrý skutek. Proto nabízíme bezplatnou pomoc — pokud by měl majitel otázky ohledně prodeje nebo potřeboval kontakt na profesionálního fotografa, my mu tyto informace rádi bezplatně poskytneme. NIKDY nenabízíme spolupráci ani provizi.

Odpověz POUZE validním JSON (bez markdown):
{
  "systemPrompt": "Kompletní systémový prompt v češtině. Jasně vysvětlí filozofii Dobro Reality, průběh hovoru a jak reagovat na různé odpovědi majitele. Přátelský, nenátlakový tón. Ich forma (Vy, Vám).",
  "firstMessage": "Dobrý den, zdravím Vás — jsem AI asistent ${AGENCY_NAME}. Mluvím správně s ${ownerName || "Vámi"}?"
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

function buildFirstMessage(ownerName: string, street?: string, city?: string): string {
  const about = street ? `ohledně nemovitosti na ${street}` : city ? `ohledně nemovitosti v ${city}` : "ohledně Vaší nemovitosti";
  return `Dobrý den, zdravím Vás — jsem AI asistent ${AGENCY_NAME}. Volám ${about}. Mluvím správně s ${ownerName || "Vámi"}?`;
}

function buildFallbackPrompt(p: { listing: string; ownerName: string; notes: string }): string {
  return `Jsi AI asistent realitní kanceláře ${AGENCY_NAME}. Voláš majiteli, který prodává nemovitost sám.

Nemovitost: ${p.listing}
Majitel: ${p.ownerName}
${p.notes ? `\nPOKYNY: ${p.notes}` : ""}

FILOZOFIE ${AGENCY_NAME}:
V ${AGENCY_NAME} fandíme každému, kdo se rozhodne prodat nemovitost sám na vlastní pěst. Netvoříme nátlak, nenabízíme spolupráci ani provizi. Každý den se snažíme udělat alespoň jeden dobrý skutek — proto nabízíme bezplatnou pomoc: pokud by měl majitel otázky ohledně prodeje nebo potřeboval kontakt na profesionálního fotografa, my z ${AGENCY_NAME} mu tyto informace rádi bezplatně poskytneme.

PRŮBĚH HOVORU:
1. Pozdrav a ověř, zda mluvíš se správnou osobou
2. Vysvětli proč voláš přirozeně a upřímně:
   "V ${AGENCY_NAME} fandíme lidem, kteří prodávají sami. Voláme, protože kdybyste měl jakékoliv otázky k prodeji nebo třeba potřeboval kontakt na fotografa, rádi Vám bezplatně pomůžeme."
3. Počkej na reakci majitele — nechej ho mluvit
4. Zájem → "Makléř ${BROKER_NAME} (${BROKER_PHONE}) se Vám ozve."
5. Ukonči přirozeně: "Děkuji, hezký den, ať se prodej daří."

STYL: Přátelský, upřímný, nenátlakový — jako kamarád. Mluv v ich formě (Vy, Vám).
ZAKÁZÁNO: spolupráce, provize, urgování, "samozřejmě", "výborně", opakování nabídky po odmítnutí.
UKONČENÍ: Odmítnutí → "Rozumím, žádný problém. Hezký den." Nereaguje 5s → "Děkuji za čas, hezký den."`;
}

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json().catch(() => null);
  if (!body) return NextResponse.json({ error: "Invalid body" }, { status: 400 });

  const { phone, ownerName, listing, street, city, notes, promptTemplate, firstMessageTemplate } = body as {
    phone: string;
    ownerName?: string;
    listing?: string;
    street?: string;
    city?: string;
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
  const streetText = street?.trim() || "";
  const cityText = city?.trim() || "";
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
      : buildFirstMessage(ownerNameFull, streetText, cityText);
  } else if (process.env.ANTHROPIC_API_KEY) {
    try {
      ({ systemPrompt, firstMessage } = await generateCallStrategy({
        listing: listingText, ownerName: ownerNameFull, notes: notesText,
      }));
    } catch {
      systemPrompt = buildFallbackPrompt({ listing: listingText, ownerName: ownerNameFull, notes: notesText });
      firstMessage = buildFirstMessage(ownerNameFull, streetText, cityText);
    }
  } else {
    systemPrompt = buildFallbackPrompt({ listing: listingText, ownerName: ownerNameFull, notes: notesText });
    firstMessage = buildFirstMessage(ownerNameFull, streetText, cityText);
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
