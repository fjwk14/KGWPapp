"use client";

import { useEffect } from "react";
import { createClient } from "@/lib/supabase/client";

// このクリップのコメントを閲覧済みにする(未読バッジ用)。
// マウント時に comment_reads を最新時刻でupsertするだけ。
export default function MarkCommentsRead({ clipId }: { clipId: string }) {
  useEffect(() => {
    const supabase = createClient();
    supabase
      .from("comment_reads")
      .upsert(
        { clip_id: clipId, last_read_at: new Date().toISOString() },
        { onConflict: "clip_id,user_id" }
      )
      .then(() => {
        // 既読の反映に失敗しても閲覧自体は妨げない(次回訪問時に再試行される)
      });
  }, [clipId]);

  return null;
}
