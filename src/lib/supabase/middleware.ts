import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

type CookieToSet = { name: string; value: string; options: CookieOptions };

export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request });
  const path = request.nextUrl.pathname;
  const isPublic = path === "/login";

  try {
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          getAll() {
            return request.cookies.getAll();
          },
          setAll(cookiesToSet: CookieToSet[]) {
            cookiesToSet.forEach(({ name, value }) =>
              request.cookies.set(name, value)
            );
            supabaseResponse = NextResponse.next({ request });
            cookiesToSet.forEach(({ name, value, options }) =>
              supabaseResponse.cookies.set(name, value, options)
            );
          },
        },
      }
    );

    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user && !isPublic) {
      const url = request.nextUrl.clone();
      url.pathname = "/login";
      return NextResponse.redirect(url);
    }

    return supabaseResponse;
  } catch {
    // Supabase側の一時的な不調・回線の瞬断などでgetUser()(認証サーバーへの
    // 疎通確認)が例外を投げても、cookie自体は有効な場合がほとんど。
    // ここで/loginへ飛ばす(フェイルクローズ)と、プールサイドなど電波が
    // 不安定な環境で毎回ログインを求められる原因になる。
    // 本当に未ログイン/セッション切れの場合は、各ページのrequireMembership()
    // (getSession()でcookieのJWTをネットワーク往復なしで検証)が最終的に
    // /loginへ導くので、ここではフェイルオープンして処理を先に進める。
    return NextResponse.next({ request });
  }
}
