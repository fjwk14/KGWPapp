"use client";

import { createBrowserClient } from "@supabase/ssr";

// ブラウザ側Supabaseクライアント(リアルタイムスタッツ入力の
// オフラインキュー同期用)。アクセス制御はRLSが担保する。
export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );
}
