import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";

export type CallOutcome = "uspesny" | "neutralni" | "odmitnuti";

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null);
  if (!body) return NextResponse.json({ error: "Invalid body" }, { status: 400 });

  const { summary, transcript } = body as { summary?: string; transcript?: string };
  const text = [summary, transcript].filter(Boolean).join("\n\n---\n\n");

  if (!text) {
    return NextResponse.json({ outcome: "neutralni" as CallOutcome, shortSummary: "Hovor proběhl bez záznamu." });
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
        content: `Analyzuj výsledek realitního telefonního hovoru, kde asistent oslovoval majitele nemovitosti s nabídkou spolupráce realitní kanceláře.

Záznam hovoru:
${text}

Odpověz POUZE validním JSON objektem, žádný jiný text:
{
  "outcome": "uspesny" nebo "neutralni" nebo "odmitnuti",
  "shortSummary": "Shrnutí hovoru ve dvou větách v češtině."
}

Definice výsledků:
- "uspesny" = majitel projevil zájem, souhlasil se schůzkou nebo dalším kontaktem
- "neutralni" = majitel byl nerozhodný, požádal o čas, nebo hovor skončil bez jasného závěru
- "odmitnuti" = majitel jasně a definitivně odmítl spolupráci`,
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
