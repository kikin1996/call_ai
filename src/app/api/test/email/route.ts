import { NextRequest, NextResponse } from "next/server";
import { sendEmailNotification } from "@/lib/email";

export async function POST(request: NextRequest) {
  const { to } = await request.json().catch(() => ({}));
  if (!to) return NextResponse.json({ error: "Chybí 'to'" }, { status: 400 });

  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) return NextResponse.json({ error: "RESEND_API_KEY není nastavený" }, { status: 500 });

  try {
    await sendEmailNotification(to, "Test notifikace – Renote", "Toto je testovací email z Renote aplikace.");
    return NextResponse.json({ ok: true });
  } catch (e: unknown) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}
