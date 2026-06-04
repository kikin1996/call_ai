import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase-server";

export async function GET(
  request: NextRequest,
  { params }: { params: { callId: string } }
) {
  const supabase = await createClient();
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const apiKey = request.nextUrl.searchParams.get("apiKey");
  if (!apiKey) return NextResponse.json({ error: "Chybí apiKey" }, { status: 400 });

  const res = await fetch(`https://api.vapi.ai/call/${params.callId}`, {
    headers: { Authorization: `Bearer ${apiKey}` },
  });

  if (!res.ok) {
    const err = await res.text();
    return NextResponse.json({ error: `VAPI: ${err}` }, { status: 500 });
  }

  const data = await res.json();

  // Transcript: zkus různé cesty kde ho VAPI ukládá
  let transcript: string | null =
    data.artifact?.transcript ??
    data.transcript ??
    null;

  // Fallback: sestavit přepis z pole messages
  if (!transcript) {
    const messages: { role?: string; message?: string; content?: string }[] =
      data.artifact?.messages ?? data.messages ?? [];
    if (messages.length > 0) {
      transcript = messages
        .filter((m) => m.role && (m.message || m.content))
        .map((m) => `${m.role === "bot" ? "Asistent" : "Majitel"}: ${m.message ?? m.content}`)
        .join("\n");
    }
  }

  return NextResponse.json({
    status: data.status,
    endedReason: data.endedReason ?? null,
    summary: data.analysis?.summary ?? null,
    transcript: transcript || null,
    durationSeconds: data.endedAt && data.startedAt
      ? Math.round((new Date(data.endedAt).getTime() - new Date(data.startedAt).getTime()) / 1000)
      : null,
  });
}
