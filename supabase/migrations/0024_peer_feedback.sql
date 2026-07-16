-- =============================================================
-- 0024: 練習後ピアフィードバック
--   peer_feedbacks: 実施済み練習ごとに、ランダムに決まった相手へ
--   送る一言フィードバック(良かったところ + アドバイス)。
--
--   ペアの決め方はDBでは持たない: アプリ側で practice_id をシードに
--   した決定的シャッフルで「円環」を作る(全員が1回送り、1回受け取る。
--   自分自身には当たらない)。学年・役職に関係なく混ざるため、
--   縦・横のつながり作りに使う。
--
--   可視性: チーム内全員が読める(前向きな称賛をチームの文化に
--   するため。UIにも「チーム内に公開」と明記する)。
--   送信は本人名義のみ(なりすまし不可)。1練習につき1人1件。
--
-- 何度実行しても安全(idempotent)。
-- =============================================================

create table if not exists public.peer_feedbacks (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references public.teams (id) on delete cascade,
  practice_id uuid not null references public.practices (id) on delete cascade,
  from_user_id uuid not null references public.users (id) on delete cascade,
  to_user_id uuid not null references public.users (id) on delete cascade,
  -- 良かったところ(必須)
  good text not null,
  -- 伸びしろ・アドバイス(任意)
  advice text,
  created_at timestamptz not null default now(),
  unique (practice_id, from_user_id),
  check (from_user_id <> to_user_id)
);

create index if not exists idx_peer_feedbacks_practice
  on public.peer_feedbacks (practice_id);
create index if not exists idx_peer_feedbacks_to_user
  on public.peer_feedbacks (team_id, to_user_id, created_at desc);

alter table public.peer_feedbacks enable row level security;

drop policy if exists peer_feedbacks_select on public.peer_feedbacks;
drop policy if exists peer_feedbacks_insert on public.peer_feedbacks;
drop policy if exists peer_feedbacks_update on public.peer_feedbacks;
drop policy if exists peer_feedbacks_delete on public.peer_feedbacks;

-- 閲覧: チーム内全員
create policy peer_feedbacks_select on public.peer_feedbacks for select
  using (public.is_team_member(team_id));

-- 送信: 本人名義のみ
create policy peer_feedbacks_insert on public.peer_feedbacks for insert
  with check (from_user_id = auth.uid() and public.is_team_member(team_id));

-- 書き直し: 本人のみ
create policy peer_feedbacks_update on public.peer_feedbacks for update
  using (from_user_id = auth.uid());

-- 削除: 本人 or 管理者(不適切な内容の対処用)
create policy peer_feedbacks_delete on public.peer_feedbacks for delete
  using (
    from_user_id = auth.uid()
    or public.has_team_role(team_id, array['admin']::public.membership_role[])
  );
