import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase-server";

function toE164(phone: string): string {
  let n = phone.replace(/[\s\-().]/g, "");
  if (n.startsWith("00")) n = "+" + n.slice(2);
  else if (n.startsWith("0")) n = "+420" + n.slice(1);
  else if (!n.startsWith("+")) n = "+420" + n;
  return n;
}

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json().catch(() => null);
  if (!body) return NextResponse.json({ error: "Invalid body" }, { status: 400 });

  const { apiKey, assistantId, phoneNumberId, phone, ownerName, listing, notes, brokerName: bn, brokerPhone: bp, agencyName: an } = body as {
    apiKey: string;
    assistantId: string;
    phoneNumberId: string;
    phone: string;
    ownerName?: string;
    listing?: string;
    notes?: string;
    brokerName?: string;
    brokerPhone?: string;
    agencyName?: string;
  };

  if (!apiKey || !assistantId || !phoneNumberId || !phone) {
    return NextResponse.json({ error: "Chybí povinné pole (apiKey, assistantId, phoneNumberId, phone)" }, { status: 400 });
  }

  // Broker info z konfigurace volání (localStorage na klientu)
  const brokerName = bn?.trim() || "váš makléř";
  const brokerPhone = bp?.trim() || "";
  const agencyName = an?.trim() || "naše realitní kancelář";
  const ownerNameFull = ownerName?.trim() || "Majiteli";
  const listingText = listing?.trim() || "";
  const notesText = notes?.trim() || "";

  const systemPrompt = `Jsi rychlý a přímý obchodní asistent realitní kanceláře {{agencyName}}, voláš jménem makléře {{brokerName}}.

Voláš majiteli, který prodává nemovitost sám: {{listing}}

{{notes}}

STYL: Mluv rychle, úsečně, sebejistě. Žádné zbytečné věty. Každá věta musí mít účel.

Průběh hovoru (max 90 sekund celkem):
1. Představ se, řekni proč voláš — VŠE V JEDNÉ větě
2. Okamžitě přejdi k nabídce — 2 věty max
3. Zeptej se na zájem o schůzku — 1 otázka
4. Podle odpovědi: domluv kontakt s makléřem NEBO se rozluč

Co nabízíme (vyber max 2 body, nestresuj seznam):
- Vyšší prodejní cena díky správnému ocenění a prezentaci
- Právní servis a kompletní vyřízení — majitel nemusí nic řešit
- Databáze prověřených kupujících

ZAKÁZÁNO:
- Chválit nemovitost nebo komentovat inzerát
- Opakovat věci, které jsi už řekl
- Říkat "samozřejmě", "rozumím", "určitě", "výborně" nebo podobné vycpávky
- Věty delší než 15 slov

Kdy ukončit hovor:
- Majitel jasně odmítl → rozluč se (1 věta)
- Majitel souhlasí → předej kontakt na {{brokerName}}{{brokerPhone}}
- Majitel nereaguje déle než 8 sekund → ukonči hovor
- NIKDY nezavěšuj jen proto, že majitel mlčel 1–2 sekundy nebo se ptal`;

  const res = await fetch("https://api.vapi.ai/call", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      type: "outboundPhoneCall",
      assistantId,
      phoneNumberId,
      customer: {
        number: toE164(phone),
        name: ownerNameFull,
      },
      assistantOverrides: {
        model: {
          messages: [{ role: "system", content: systemPrompt }],
        },
        variableValues: {
          ownerName: ownerNameFull,
          listing: listingText,
          notes: notesText ? `POKYNY A POZNÁMKY PRO TENTO HOVOR:\n${notesText}` : "",
          phone: toE164(phone),
          brokerName,
          brokerPhone: brokerPhone ? ` (${brokerPhone})` : "",
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
