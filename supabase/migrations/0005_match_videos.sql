-- =============================================================
-- 0005: 試合動画の後付け対応
--   スタッツは試合中にリアルタイム記録し、動画は後日共有される
--   運用に合わせて、動画を試合から分離した match_videos テーブルに
--   移す(クオーター単位で複数登録可)。クリップは特定の動画に紐づく。
--
-- 既存デプロイへの適用: このファイルを Supabase SQL Editor に
-- 丸ごと貼り付けて Run するだけ(分割は不要)。
-- 新規デプロイ: 0001 → 0004 → 0005 の順に適用。
-- =============================================================

-- ---------- 試合動画(後日添付・クオーター単位) ----------
create table public.match_videos (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references public.teams (id) on delete cascade,
  match_id uuid not null references public.matches (id) on delete cascade,
  -- 1〜4 = Q1〜Q4, 5 = PSO, null = フル(試合全体)動画
  quarter smallint check (quarter between 1 and 5),
  title text check (char_length(title) <= 120),
  url text not null check (url ~* '^https?://'),
  created_by uuid references public.users (id) on delete set null default auth.uid(),
  created_at timestamptz not null default now()
);

create index idx_match_videos_match on public.match_videos (match_id, quarter);

-- クリップは「どの動画の何分何秒か」を指す(動画削除時はリンクだけ外れる)
alter table public.video_clips
  add column video_id uuid references public.match_videos (id) on delete set null;

-- team_id は親のmatchから強制(0004の関数を再利用)
create trigger trg_match_video_team before insert or update of match_id on public.match_videos
  for each row execute function public.enforce_match_child_team();

-- ---------- RLS ----------
alter table public.match_videos enable row level security;

-- 閲覧は全メンバー。追加・削除はスタッフ(マネージャー含む)。
create policy match_videos_select on public.match_videos for select
  using (public.is_team_member(team_id));
create policy match_videos_insert on public.match_videos for insert
  with check (
    public.has_team_role(team_id, array['manager','tactical_staff','executive','captain','admin']::public.membership_role[])
    and created_by = auth.uid()
  );
create policy match_videos_update on public.match_videos for update
  using (public.has_team_role(team_id, array['manager','tactical_staff','executive','captain','admin']::public.membership_role[]));
create policy match_videos_delete on public.match_videos for delete
  using (public.has_team_role(team_id, array['manager','tactical_staff','executive','captain','admin']::public.membership_role[]));

-- ---------- 既存データの移行 ----------
-- matches.video_url は「フル動画」として match_videos に移し、
-- 既存クリップをその動画に紐づける(video_urlカラム自体は残すが以後未使用)
insert into public.match_videos (team_id, match_id, url, title, created_by)
select team_id, id, video_url, 'フル動画', created_by
from public.matches
where video_url is not null and video_url ~* '^https?://';

update public.video_clips c
set video_id = v.id
from public.match_videos v
where v.match_id = c.match_id and c.video_id is null;
