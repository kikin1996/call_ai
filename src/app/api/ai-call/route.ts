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

function buildFirstMessage(ownerName: string, street?: string, city?: string): string {
  const location = [street, city].filter(Boolean).join(" v ");
  const about = location ? `ohledně nemovitosti na ${location}` : "ohledně Vaší nemovitosti";
  return `Dobrý den, zdravím Vás — jsem AI asistent ${AGENCY_NAME}. Volám ${about}. Mluvím správně s ${ownerName || "Vámi"}?`;
}

function buildFallbackPrompt(p: { listing: string; ownerName: string; notes: string }): string {
  return `Jsi AI asistent realitní kanceláře ${AGENCY_NAME}. Voláš majiteli, který prodává nemovitost sám.

Nemovitost: ${p.listing}
Majitel: ${p.ownerName}
${p.notes ? `\nPOKYNY: ${p.notes}` : ""}

PRVNÍ VĚTA — řekni přesně toto, rychle:
"Dobrý den, volám ohledně ${p.listing} — mluvím správně s ${p.ownerName}? Jsem AI asistent ${AGENCY_NAME}, volám se rychlou otázkou."

PRŮBĚH — MAX 60 SEKUND:
1. První věta viz výše
2. Rovnou: "Jak Vám jde prodej? Nepotřebujete pomoc s právem nebo s fotografem?"
3. Nabídni 1 konkrétní věc (právník / fotograf / rada ke smlouvě)
4. Zájem → "Makléř ${BROKER_NAME} (${BROKER_PHONE}) se Vám ozve."
5. Konec: "Děkuji, hezký den."

STYL: Rychlý, přímý, max 12 slov na větu. Mluv v ich formě (Vy, Vám).
ZAKÁZÁNO: zdlouhavé představování, spolupráce, provize, "samozřejmě", "určitě", víc než 2 věty bez pauzy.
UKONČENÍ: Odmítnutí → "Rozumím, hezký den." Nereaguje 5s → ukonči hovor.`;
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
