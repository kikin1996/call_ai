import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase-server";
import Anthropic from "@anthropic-ai/sdk";

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json().catch(() => null);
  const { brokerName = "makléř", brokerPhone = "", agencyName = "realitní kancelář" } = body ?? {};

  if (!process.env.ANTHROPIC_API_KEY) {
    return NextResponse.json({ error: "ANTHROPIC_API_KEY není nastaven" }, { status: 500 });
  }

  const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

  const response = await anthropic.messages.create({
    model: "claude-haiku-4-5-20251001",
    max_tokens: 1200,
    messages: [{
      role: "user",
      content: `Vytvoř šablonu systémového promptu pro AI asistenta realitní kanceláře.

Makléř: ${brokerName}${brokerPhone ? ` (${brokerPhone})` : ""}
Kancelář: ${agencyName}

Šablona musí používat tyto proměnné přesně jak jsou:
- {{listing}} — popis nemovitosti z inzerátu
- {{notes}} — extra pokyny pro konkrétní hovor
- {{ownerName}} — jméno majitele
- {{brokerName}} — jméno makléře
- {{brokerPhone}} — telefon makléře
- {{agencyName}} — název kanceláře

Požadavky na prompt:
- Styl: rychlý, přímý, sebejistý, max 15 slov na větu
- Průběh hovoru max 90 sekund
- Personalizovaný pro realitní trh v ČR
- Jasné instrukce kdy ukončit hovor
- Zakázaná slova: samozřejmě, rozumím, určitě, výborně

Odpověz POUZE validním JSON (bez markdown):
{
  "systemPrompt": "celá šablona promptu s {{proměnnými}}",
  "firstMessage": "vzorová první věta — představení + důvod volání, max 20 slov, bez Dobrý den na začátku"
}`,
    }],
  });

  const raw = response.content[0].type === "text" ? response.content[0].text.trim() : "{}";
  const parsed = JSON.parse(raw);
  return NextResponse.json({
    systemPrompt: parsed.systemPrompt ?? "",
    firstMessage: parsed.firstMessage ?? "",
  });
}
