import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase-server";

const CALENDAR_SCOPE = "https://www.googleapis.com/auth/calendar.events";

export async function GET(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (!session?.user?.id) {
    return NextResponse.redirect(new URL("/login", request.url));
  }

  const clientId = process.env.GOOGLE_CLIENT_ID;
  const appUrl = (process.env.NEXT_PUBLIC_APP_URL || request.nextUrl.origin).replace(/\/$/, "");
  const redirectUri = `${appUrl}/api/auth/google-calendar/callback`;
  if (!clientId) {
    return NextResponse.json(
      { error: "GOOGLE_CLIENT_ID not set" },
      { status: 500 }
    );
  }

  const state = Buffer.from(
    JSON.stringify({ userId: session.user.id, at: Date.now() })
  ).toString("base64url");

  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: "code",
    scope: CALENDAR_SCOPE,
    access_type: "offline",
    prompt: "consent",
    state,
  });

  return NextResponse.redirect(
    `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`
  );
}
