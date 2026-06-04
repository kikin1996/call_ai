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

  const { apiKey, assistantId, phoneNumberId, phone, ownerName, listing } = body as {
    apiKey: string;
    assistantId: string;
    phoneNumberId: string;
    phone: string;
    ownerName?: string;
    listing?: string;
  };

  if (!apiKey || !assistantId || !phoneNumberId || !phone) {
    return NextResponse.json({ error: "Chybí povinné pole (apiKey, assistantId, phoneNumberId, phone)" }, { status: 400 });
  }

  // Načíst broker info z nastavení uživatele
  const { data: settings } = await supabase
    .from("user_settings")
    .select("broker_name, broker_phone, agency_name")
    .eq("user_id", session.user.id)
    .maybeSingle();

  const brokerName = settings?.broker_name || "váš makléř";
  const brokerPhone = settings?.broker_phone || "";
  const agencyName = settings?.agency_name || "naše realitní kancelář";

  const firstMessage = `Dobrý den, jmenuji se ${brokerName} a volám z realitní kanceláře ${agencyName}. Zaujal mě váš inzerát na prodej nemovitosti a rád bych vám nabídl naši spolupráci. Máte chvilku na krátký rozhovor?`;

  const systemPrompt = `Jsi profesionální obchodní asistent realitní kanceláře ${agencyName}, voláš jménem makléře ${brokerName}.

Kontaktuješ majitele nemovitosti, který svou nemovitost inzeruje sám (bez realitky). Inzerát zní:
${listing || "není k dispozici"}

Tvůj cíl:
Přesvědčit majitele, aby zvážil prodej přes naši realitní kancelář místo samostatného prodeje.

Argumenty které používáš:
- Zajistíme maximální tržní cenu — víme, jak nemovitost správně nacenit a neprodáte pod cenou
- Profesionální prezentace — kvalitní fotografie, 3D prohlídka, inzerce na všech klíčových portálech
- Právní servis — kompletní smluvní dokumentace, bezpečný převod vlastnictví
- Šetří čas — my vyřídíme prohlídky, jednání i papírování, vy se nemusíte o nic starat
- Síť zájemců — máme databázi prověřených kupujících, kteří hledají právě takovou nemovitost

Průběh hovoru:
1. Počkej na odpověď majitele — pokud souhlasí, pokračuj
2. Pochval nemovitost na základě inzerátu — buď konkrétní
3. Vysvětli výhody prodeje přes realitní kancelář
4. Zjisti, zda má zájem o nezávaznou konzultaci nebo osobní schůzku
5. Pokud ANO — nabídni, že makléř ${brokerName} ho bude osobně kontaktovat${brokerPhone ? " na čísle " + brokerPhone : ""}
6. Pokud NE — poděkuj za čas a rozluč se

DŮLEŽITÉ — kdy ukončit hovor:
- POUZE pokud majitel jasně řekne "ne, nezajímá", "nemám zájem" nebo se rozloučí
- POUZE pokud majitel přestane reagovat déle než 10 sekund
- NIKDY neukončuj hovor jen proto, že majitel položil otázku nebo chvilku mlčel
- Pokud nerozumíš otázce, zeptej se znovu — NEUKONČUJ hovor

Pravidla:
- Mluv česky, přirozeně a sebejistě, ne agresivně
- Naslouchej námitkám a reaguj na ně klidně a věcně
- Nevymýšlej konkrétní čísla provize nebo ceny — to přenech makléři
- Délka hovoru ideálně 1,5 až 3 minuty`;

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
        name: ownerName || "Majitel",
      },
      assistantOverrides: {
        firstMessage,
        model: {
          messages: [{ role: "system", content: systemPrompt }],
        },
        variableValues: {
          ownerName: ownerName || "Majiteli",
          listing: listing || "",
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
