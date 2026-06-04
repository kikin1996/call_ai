import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";

export type CallOutcome = "uspesny" | "neutralni" | "odmitnuti";

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null);
  if (!body) return NextResponse.json({ error: "Invalid body" }, { status: 400 });

  const { summary, transcript, endedReason, status } = body as {
    summary?: string; transcript?: string; endedReason?: string; status?: string;
  };
  const text = [summary, transcript].filter(Boolean).join("\n\n---\n\n");

  // Bez přepisu — odvodit výsledek ze statusu hovoru
  if (!text) {
    if (status === "no-answer") return NextResponse.json({ outcome: "neutralni" as CallOutcome, shortSummary: "Majitel telefon nezvedl." });
    if (status === "busy") return NextResponse.json({ outcome: "neutralni" as CallOutcome, shortSummary: "Linka byla obsazená." });
    if (status === "cancelled") return NextResponse.json({ outcome: "neutralni" as CallOutcome, shortSummary: "Hovor byl zrušen před spojením." });
    if (endedReason === "customer-ended-call") return NextResponse.json({ outcome: "odmitnuti" as CallOutcome, shortSummary: "Majitel hovor předčasně ukončil." });
    return NextResponse.json({ outcome: "neutralni" as CallOutcome, shortSummary: "Přepis hovoru není k dispozici." });
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ outcome: "neutralni" as CallOutcome, shortSummary: summary ?? "Shrnutí není k dispozici." });
  }

  const client = new Anthropic({ apiKey });

  try {
    const response = await client.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 300,
      messages: [{
        role: "user",
        content: `Analyzuj přepis realitního telefonního hovoru. Asistent oslovoval majitele nemovitosti s nabídkou spolupráce realitní kanceláře.

Přepis:
${text}

Odpověz POUZE validním JSON objektem, žádný jiný text:
{
  "outcome": "uspesny" nebo "neutralni" nebo "odmitnuti",
  "shortSummary": "Přesně dvě věty v češtině: 1) co se v hovoru stalo, 2) jaký byl výsledek nebo reakce majitele."
}

Definice výsledků:
- "uspesny" = majitel projevil zájem, souhlasil se schůzkou nebo dalším kontaktem
- "neutralni" = majitel byl nerozhodný, požádal o čas, nebo hovor skončil bez jasného závěru
- "odmitnuti" = majitel jasně odmítl spolupráci

Pokud přepis není ideální, shrň co nejvíce z dostupného textu. Vždy vrať neprázdný shortSummary.`,
      }],
    });

    const raw = response.content[0].type === "text" ? response.content[0].text.trim() : "";
    const parsed = JSON.parse(raw);
    return NextResponse.json({
      outcome: (["uspesny", "neutralni", "odmitnuti"].includes(parsed.outcome) ? parsed.outcome : "neutralni") as CallOutcome,
      shortSummary: parsed.shortSummary ?? summary ?? "Shrnutí není k dispozici.",
    });
  } catch {
    return NextResponse.json({ outcome: "neutralni" as CallOutcome, shortSummary: summary ?? "Shrnutí není k dispozici." });
  }
}
