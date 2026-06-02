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
        variableValues: {
          ownerName: ownerName || "Majiteli",
          listing: listing || "",
          phone: toE164(phone),
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
