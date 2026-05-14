import { NextRequest, NextResponse } from "next/server";
import { google } from "googleapis";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { createClient } from "@/lib/supabase-server";

export async function GET(request: NextRequest) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");

  if (!code || !state) {
    return NextResponse.redirect(
      new URL("/settings?calendar=error", request.url)
    );
  }

  let userId: string;
  try {
    const decoded = JSON.parse(
      Buffer.from(state, "base64url").toString("utf-8")
    ) as { userId: string };
    if (!decoded.userId) throw new Error("No userId");
    userId = decoded.userId;
  } catch {
    return NextResponse.redirect(
      new URL("/settings?calendar=error", request.url)
    );
  }

  const supabase = await createClient();
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.user?.id || session.user.id !== userId) {
    return NextResponse.redirect(
      new URL("/settings?calendar=error", request.url)
    );
  }

  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  const appUrl = (process.env.NEXT_PUBLIC_APP_URL || url.origin).replace(/\/$/, "");
  const redirectUri = `${appUrl}/api/auth/google-calendar/callback`;
  if (!clientId || !clientSecret) {
    return NextResponse.redirect(
      new URL("/settings?calendar=config", request.url)
    );
  }

  const oauth2Client = new google.auth.OAuth2(
    clientId,
    clientSecret,
    redirectUri
  );

  try {
    const { tokens } = await oauth2Client.getToken(code);
    const refreshToken = tokens.refresh_token;
    if (!refreshToken) {
      return NextResponse.redirect(
        new URL("/settings?calendar=no_refresh", request.url)
      );
    }

    const supabaseAdmin = getSupabaseAdmin();
    await supabaseAdmin
      .from("user_settings")
      .upsert(
        {
          user_id: userId,
          google_refresh_token: refreshToken,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "user_id" }
      );
  } catch (err) {
    console.error("Google Calendar callback:", err);
    return NextResponse.redirect(
      new URL("/settings?calendar=error", request.url)
    );
  }

  return NextResponse.redirect(new URL("/settings?calendar=ok", request.url));
}
