-- =============================================================
-- 0020: コメント既読管理(未読バッジ用)
--   comment_reads: 「このクリップをこの時刻まで読んだ」を1人1クリップ1行で保持。
--   未読判定はアプリ側(src/lib/notifications.ts)の純関数で行う:
--     - 自分宛メンション、または自分が参加したスレッドへの新着返信のうち
--     - comment_reads.last_read_at より新しいもの
--
-- 何度実行しても安全(idempotent)。
-- 新規デプロイ: 0001 → … → 0019 → 0020 の順。
-- =============================================================

create table if not exists public.comment_reads (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references public.teams (id) on delete cascade,
  clip_id uuid not null references public.video_clips (id) on delete cascade,
  user_id uuid not null references public.users (id) on delete cascade default auth.uid(),
  last_read_at timestamptz not null default now(),
  unique (clip_id, user_id)
);

create index if not exists idx_comment_reads_user
  on public.comment_reads (team_id, user_id);

-- team_id は親クリップから強制(0001の関数を再利用)
drop trigger if exists trg_comment_read_team on public.comment_reads;
create trigger trg_comment_read_team before insert or update of clip_id on public.comment_reads
  for each row execute function public.enforce_clip_child_team();

alter table public.comment_reads enable row level security;

drop policy if exists comment_reads_select on public.comment_reads;
drop policy if exists comment_reads_insert on public.comment_reads;
drop policy if exists comment_reads_update on public.comment_reads;

-- 既読状態は本人だけが読み書きする(他人の既読状況は見せない)
create policy comment_reads_select on public.comment_reads for select
  using (user_id = auth.uid());
create policy comment_reads_insert on public.comment_reads for insert
  with check (public.is_team_member(team_id) and user_id = auth.uid());
create policy comment_reads_update on public.comment_reads for update
  using (user_id = auth.uid());
