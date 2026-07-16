-- =============================================================
-- 0023: コンディション記録(個人カルテ)
--   condition_logs: 1人1日1行の体調・メンタル記録
--   (調子・やる気・睡眠時間・体の痛み)。
--
--   プライバシー設計(重要):
--     体調・メンタルは個人的な情報のため、閲覧は
--     「本人 + マネージャー・管理者」のみに制限する。
--     同じチームでも他の選手・スタッフからは一切見えない。
--     記録・修正・削除は本人のみ(スタッフでも代筆はしない)。
--
-- 何度実行しても安全(idempotent)。
-- 新規デプロイ: 0001 → … → 0022 → 0023 の順。
-- =============================================================

create table if not exists public.condition_logs (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references public.teams (id) on delete cascade,
  user_id uuid not null references public.users (id) on delete cascade,
  log_date date not null default current_date,
  -- 調子(1=絶不調 〜 5=絶好調)
  condition int not null check (condition between 1 and 5),
  -- やる気(1=かなり低い 〜 5=MAX)
  motivation int not null check (motivation between 1 and 5),
  -- 睡眠時間(時間。0.5刻み想定・未入力可)
  sleep_hours numeric(3, 1) check (sleep_hours >= 0 and sleep_hours <= 24),
  -- 体の痛み(0=なし 1=少し気になる 2=痛い 3=かなり痛い)
  pain_level int not null default 0 check (pain_level between 0 and 3),
  -- 痛みの部位・様子(任意)
  pain_note text,
  -- ひとことメモ(任意)
  note text,
  created_at timestamptz not null default now(),
  unique (user_id, log_date)
);

create index if not exists idx_condition_logs_user_date
  on public.condition_logs (team_id, user_id, log_date desc);

alter table public.condition_logs enable row level security;

drop policy if exists condition_logs_select on public.condition_logs;
drop policy if exists condition_logs_insert on public.condition_logs;
drop policy if exists condition_logs_update on public.condition_logs;
drop policy if exists condition_logs_delete on public.condition_logs;

-- 閲覧: 本人 + マネージャー・管理者のみ(他の選手からは見えない)
create policy condition_logs_select on public.condition_logs for select
  using (
    user_id = auth.uid()
    or public.has_team_role(team_id, array['manager','admin']::public.membership_role[])
  );

-- 記録: 本人のみ(自分の分しか書けない)
create policy condition_logs_insert on public.condition_logs for insert
  with check (user_id = auth.uid() and public.is_team_member(team_id));

-- 修正・削除: 本人のみ
create policy condition_logs_update on public.condition_logs for update
  using (user_id = auth.uid());
create policy condition_logs_delete on public.condition_logs for delete
  using (user_id = auth.uid());
