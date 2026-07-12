-- =============================================================
-- 0004: リアルタイムスタッツ入力
--   match_rosters : 試合ごとの出場メンバー(帽子番号・GK区分)
--   stats_events  : 試合中のイベント(シュート・アシスト・退水誘発 等)
--
-- 既存デプロイへの適用: このファイルを Supabase SQL Editor に
-- 丸ごと貼り付けて Run するだけ(0002/0003のような分割は不要)。
-- 新規デプロイ: 0001 → 0004 の順に適用。
-- =============================================================

-- ---------- 出場メンバー ----------
create table public.match_rosters (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references public.teams (id) on delete cascade,
  match_id uuid not null references public.matches (id) on delete cascade,
  user_id uuid not null references public.users (id) on delete cascade,
  cap_number integer not null check (cap_number between 1 and 99),
  is_gk boolean not null default false,
  created_at timestamptz not null default now(),
  unique (match_id, user_id),
  unique (match_id, cap_number)
);

-- ---------- スタッツイベント ----------
create table public.stats_events (
  -- idはクライアント生成を許可(オフラインキューの冪等な再送のため)
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references public.teams (id) on delete cascade,
  match_id uuid not null references public.matches (id) on delete cascade,
  -- 1〜4 = Q1〜Q4, 5 = PSO
  quarter smallint not null check (quarter between 1 and 5),
  -- チームイベント(攻撃終了・相手得点)は player_id が null
  player_id uuid references public.users (id) on delete set null,
  type text not null check (type in (
    'shot', 'assist', 'cut', 'drawn_exclusion', 'exclusion',
    'offensive_foul', 'miss', 'gk_faced', 'attack_end_no_shot', 'opponent_goal'
  )),
  subtype text,
  result text,
  is_extra_man boolean not null default false,
  created_by uuid references public.users (id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),

  -- type ごとの subtype / result の整合性
  check (
    case type
      when 'shot' then
        subtype in ('center', 'drive', 'one_touch', 'penalty', 'six_m', 'other')
        and result in ('goal', 'miss', 'blocked')
      when 'miss' then
        subtype in ('pass', 'keep', 'other') and result is null
      when 'gk_faced' then
        subtype is null and result in ('goal_against', 'block', 'off_target')
      when 'drawn_exclusion' then
        -- 紙シートの「P/E誘発」: exclusion=退水誘発, penalty=ペナルティ誘発
        subtype in ('exclusion', 'penalty') and result is null
      else subtype is null and result is null
    end
  ),
  -- チームイベント以外は選手必須
  check (
    (type in ('attack_end_no_shot', 'opponent_goal') and player_id is null)
    or (type not in ('attack_end_no_shot', 'opponent_goal') and player_id is not null)
  )
);

create index idx_match_rosters_match on public.match_rosters (match_id);
create index idx_stats_events_match on public.stats_events (match_id, created_at);
create index idx_stats_events_team on public.stats_events (team_id);

-- ---------- team_id 整合性(親のmatchから強制) ----------
create or replace function public.enforce_match_child_team()
returns trigger language plpgsql as $$
declare
  v_team uuid;
begin
  select team_id into v_team from public.matches where id = new.match_id;
  if v_team is null then
    raise exception 'match not found';
  end if;
  new.team_id := v_team;
  return new;
end;
$$;

create trigger trg_roster_team before insert or update of match_id on public.match_rosters
  for each row execute function public.enforce_match_child_team();
create trigger trg_stats_event_team before insert or update of match_id on public.stats_events
  for each row execute function public.enforce_match_child_team();

-- ---------- RLS ----------
alter table public.match_rosters enable row level security;
alter table public.stats_events enable row level security;

-- 記録・編集は管理者とマネージャーのみ。閲覧は全メンバー。
create policy rosters_select on public.match_rosters for select
  using (public.is_team_member(team_id));
create policy rosters_insert on public.match_rosters for insert
  with check (public.has_team_role(team_id, array['manager','admin']::public.membership_role[]));
create policy rosters_update on public.match_rosters for update
  using (public.has_team_role(team_id, array['manager','admin']::public.membership_role[]));
create policy rosters_delete on public.match_rosters for delete
  using (public.has_team_role(team_id, array['manager','admin']::public.membership_role[]));

create policy stats_select on public.stats_events for select
  using (public.is_team_member(team_id));
create policy stats_insert on public.stats_events for insert
  with check (
    public.has_team_role(team_id, array['manager','admin']::public.membership_role[])
    and created_by = auth.uid()
  );
create policy stats_delete on public.stats_events for delete
  using (public.has_team_role(team_id, array['manager','admin']::public.membership_role[]));
