import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";

export type CallOutcome = "uspesny" | "neutralni" | "odmitnuti" | "zaveseni";

const MODEL = "claude-haiku-4-5-20251001";

// Tolerantní extrakce JSON z odpovědi modelu (zvládne ```json``` obal i text okolo)
function extractJson(raw: string): { outcome?: string; shortSummary?: string } | null {
  if (!raw) return null;
  const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = fenced ? fenced[1] : raw;
  const start = candidate.indexOf("{");
  const end = candidate.lastIndexOf("}");
  if (start === -1 || end === -1 || end < start) return null;
  try {
    return JSON.parse(candidate.slice(start, end + 1));
  } catch {
    return null;
  }
}

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
    if (status === "busy")      return NextResponse.json({ outcome: "neutralni" as CallOutcome, shortSummary: "Linka byla obsazená." });
    if (status === "cancelled") return NextResponse.json({ outcome: "neutralni" as CallOutcome, shortSummary: "Hovor byl zrušen před spojením." });
    if (endedReason === "customer-ended-call") return NextResponse.json({ outcome: "zaveseni" as CallOutcome, shortSummary: "Majitel hovor zavěsil." });
    return NextResponse.json({ outcome: "neutralni" as CallOutcome, shortSummary: "Přepis hovoru není k dispozici." });
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ outcome: "neutralni" as CallOutcome, shortSummary: "Shrnutí nelze vytvořit – na serveru chybí ANTHROPIC_API_KEY." });
  }

  const client = new Anthropic({ apiKey });
  const validOutcomes: CallOutcome[] = ["uspesny", "neutralni", "odmitnuti", "zaveseni"];

  // 1) Strukturovaná analýza: výsledek + jednovětné shrnutí
  try {
    const response = await client.messages.create({
      model: MODEL,
      max_tokens: 400,
      messages: [{
        role: "user",
        content: `Analyzuj přepis telefonního hovoru. AI asistent z realitní kanceláře Dobro Reality volal majiteli nemovitosti a nabízel bezplatnou pomoc (právník, fotograf, rady ke smlouvám).

Přepis:
${text}

Odpověz POUZE validním JSON, žádný jiný text, bez markdown:
{
  "outcome": "uspesny" | "neutralni" | "odmitnuti" | "zaveseni",
  "shortSummary": "Přesně JEDNA stručná informativní věta v češtině, která shrnuje celý hovor – co se dělo a jak majitel reagoval. NENÍ to přepis, neopisuj repliky."
}

Definice:
- "uspesny" = majitel projevil zájem, chce poradit nebo mu zavolá makléř
- "neutralni" = majitel byl nerozhodný, požádal o čas, hovor skončil bez závěru
- "odmitnuti" = majitel jasně odmítl, nemá zájem
- "zaveseni" = majitel zavěsil nebo hovor ukončil předčasně bez vysvětlení`,
      }],
    });

    const raw = response.content[0].type === "text" ? response.content[0].text.trim() : "";
    const parsed = extractJson(raw);
    if (parsed?.shortSummary) {
      return NextResponse.json({
        outcome: (parsed.outcome && validOutcomes.includes(parsed.outcome as CallOutcome) ? parsed.outcome : "neutralni") as CallOutcome,
        shortSummary: String(parsed.shortSummary).trim(),
      });
    }
  } catch {
    /* spadneme do prostého fallbacku níže */
  }

  // 2) Fallback: prostý jednovětný souhrn od AI (bez JSON), aby shrnutí bylo VŽDY od AI a nikdy to nebyl přepis
  try {
    const response = await client.messages.create({
      model: MODEL,
      max_tokens: 150,
      messages: [{
        role: "user",
        content: `Shrň následující telefonní hovor do JEDNÉ stručné informativní věty v češtině. Vrať pouze tu jednu větu, nic jiného – žádný přepis, žádné repliky.

${text}`,
      }],
    });
    const raw = response.content[0].type === "text" ? response.content[0].text.trim() : "";
    if (raw) {
      return NextResponse.json({ outcome: "neutralni" as CallOutcome, shortSummary: raw });
    }
  } catch {
    /* ignore */
  }

  return NextResponse.json({ outcome: "neutralni" as CallOutcome, shortSummary: "Shrnutí se nepodařilo vygenerovat." });
}
