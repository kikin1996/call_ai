import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";

export type CallOutcome = "uspesny" | "neutralni" | "odmitnuti" | "zaveseni";

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null);
  if (!body) return NextResponse.json({ error: "Invalid body" }, { status: 400 });

  const { summary, transcript, endedReason, status } = body as {
    summary?: string; transcript?: string; endedReason?: string; status?: string;
  };
  const text = [summary, transcript].filter(Boolean).join("\n\n---\n\n");

  // Bez přepisu — odvodit výsledek ze statusu
  if (!text) {
    if (status === "no-answer") return NextResponse.json({ outcome: "neutralni" as CallOutcome, shortSummary: "Majitel telefon nezvedl." });
    if (status === "busy")      return NextResponse.json({ outcome: "neutralni" as CallOutcome, shortSummary: "Linka byla obsazená." });
    if (status === "cancelled") return NextResponse.json({ outcome: "neutralni" as CallOutcome, shortSummary: "Hovor byl zrušen před spojením." });
    if (endedReason === "customer-ended-call") return NextResponse.json({ outcome: "zaveseni" as CallOutcome, shortSummary: "Majitel hovor zavěsil." });
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
      max_tokens: 400,
      messages: [{
        role: "user",
        content: `Analyzuj přepis telefonního hovoru. AI asistent z realitní kanceláře Dobro Reality volal majiteli nemovitosti a nabízel bezplatnou pomoc (právník, fotograf, rady ke smlouvám).

Přepis:
${text}

Odpověz POUZE validním JSON, žádný jiný text:
{
  "outcome": "uspesny" nebo "neutralni" nebo "odmitnuti" nebo "zaveseni",
  "shortSummary": "2-3 věty česky: co se stalo v hovoru a jaká byla reakce majitele."
}

Definice:
- "uspesny" = majitel projevil zájem, chce poradit nebo mu zavolá makléř
- "neutralni" = majitel byl nerozhodný, požádal o čas, hovor skončil bez závěru
- "odmitnuti" = majitel jasně odmítl, nemá zájem
- "zaveseni" = majitel zavěsil nebo hovor ukončil předčasně bez vysvětlení

Vždy vrať neprázdný shortSummary.`,
      }],
    });

    const raw = response.content[0].type === "text" ? response.content[0].text.trim() : "";
    const parsed = JSON.parse(raw);
    const validOutcomes: CallOutcome[] = ["uspesny", "neutralni", "odmitnuti", "zaveseni"];
    return NextResponse.json({
      outcome: (validOutcomes.includes(parsed.outcome) ? parsed.outcome : "neutralni") as CallOutcome,
      shortSummary: parsed.shortSummary ?? summary ?? "Shrnutí není k dispozici.",
    });
  } catch {
    return NextResponse.json({ outcome: "neutralni" as CallOutcome, shortSummary: summary ?? "Shrnutí není k dispozici." });
  }
}
