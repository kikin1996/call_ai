import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

export async function updateSession(request: NextRequest) {
  let response = NextResponse.next({ request });

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim();
  const isProtected = request.nextUrl.pathname.startsWith("/ai-call");
  const isAuthPage =
    request.nextUrl.pathname === "/login" ||
    request.nextUrl.pathname === "/register";

  if (!url || !key) {
    const devAdmin = request.cookies.get("dev_admin")?.value === "1";
    if (process.env.NODE_ENV === "development" && devAdmin && isProtected) {
      return NextResponse.next({ request });
    }
    if (process.env.NODE_ENV === "development" && isAuthPage && devAdmin) {
      return NextResponse.redirect(new URL("/ai-call", request.url));
    }
    if (isProtected && !devAdmin) {
      return NextResponse.redirect(new URL("/login", request.url));
    }
    return NextResponse.next({ request });
  }
  const supabase = createServerClient(
    url,
    key,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet: { name: string; value: string; options?: Record<string, unknown> }[]) {
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  const {
    data: { session },
  } = await supabase.auth.getSession();

  if (isAuthPage && session) {
    return NextResponse.redirect(new URL("/ai-call", request.url));
  }
  if (isProtected && !session) {
    return NextResponse.redirect(new URL("/login", request.url));
  }

  return response;
}
