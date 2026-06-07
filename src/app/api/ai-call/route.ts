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

  const { apiKey, assistantId, phoneNumberId, phone, ownerName, listing, brokerName: bn, brokerPhone: bp, agencyName: an } = body as {
    apiKey: string;
    assistantId: string;
    phoneNumberId: string;
    phone: string;
    ownerName?: string;
    listing?: string;
    brokerName?: string;
    brokerPhone?: string;
    agencyName?: string;
  };

  if (!apiKey || !assistantId || !phoneNumberId || !phone) {
    return NextResponse.json({ error: "Chybí povinné pole (apiKey, assistantId, phoneNumberId, phone)" }, { status: 400 });
  }

  // Broker info z konfigurace volání (localStorage na klientu)
  const brokerName = bn?.trim() || "váš makléř";
  const brokerPhone = bp?.trim() || "";
  const agencyName = an?.trim() || "naše realitní kancelář";

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
