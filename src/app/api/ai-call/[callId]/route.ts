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

  return NextResponse.json({
    status: data.status,
    endedReason: data.endedReason ?? null,
    summary: data.analysis?.summary ?? null,
    transcript: data.transcript ?? null,
    durationSeconds: data.endedAt && data.startedAt
      ? Math.round((new Date(data.endedAt).getTime() - new Date(data.startedAt).getTime()) / 1000)
      : null,
  });
}
