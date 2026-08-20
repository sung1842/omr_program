import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T | null> {
  return new Promise((resolve) => {
    const timer = setTimeout(() => resolve(null), ms);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      () => {
        clearTimeout(timer);
        resolve(null);
      },
    );
  });
}

function isAuthCookie(name: string) {
  return name.startsWith("sb-") && name.includes("auth-token");
}

function clearAuthCookies(request: NextRequest, base: NextResponse) {
  const path = request.nextUrl.pathname;
  const isLogin = path === "/login" || path.startsWith("/login/");
  const response = isLogin
    ? base
    : NextResponse.redirect(
        (() => {
          const redirectUrl = request.nextUrl.clone();
          redirectUrl.pathname = "/login";
          redirectUrl.searchParams.set("next", path);
          return redirectUrl;
        })(),
      );
  request.cookies.getAll().forEach(({ name }) => {
    if (isAuthCookie(name)) {
      response.cookies.set(name, "", { path: "/", maxAge: 0 });
    }
  });
  return response;
}

export async function updateSession(request: NextRequest) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) {
    return NextResponse.next({ request });
  }

  let response = NextResponse.next({ request });

  const supabase = createServerClient(url, key, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value }) => {
          request.cookies.set(name, value);
        });
        response = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options }) => {
          response.cookies.set(name, value, options);
        });
      },
    },
  });

  const auth = await withTimeout(
    supabase.auth.getUser().then(
      (value) => value,
      (error) => ({ data: { user: null }, error }),
    ),
    2500,
  );
  if (!auth) {
    return response;
  }
  if (auth.error) {
    return clearAuthCookies(request, response);
  }
  const user = auth.data.user;

  const path = request.nextUrl.pathname;
  const isLogin = path === "/login" || path.startsWith("/login/");

  if (!user && !isLogin) {
    const redirectUrl = request.nextUrl.clone();
    redirectUrl.pathname = "/login";
    redirectUrl.searchParams.set("next", path);
    return NextResponse.redirect(redirectUrl);
  }

  if (user && isLogin) {
    const redirectUrl = request.nextUrl.clone();
    redirectUrl.pathname = "/";
    redirectUrl.search = "";
    return NextResponse.redirect(redirectUrl);
  }

  return response;
}
