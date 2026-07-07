-- =============================================================
-- KG Tactical Video - initial schema
-- teams / users / memberships / matches / video_clips /
-- tag_templates / clip_tags / clip_comments / tactical_reports
-- + RLS policies (team_id によるデータ分離、ロールベース権限)
-- =============================================================

create extension if not exists "pgcrypto";

-- ---------- enums ----------
create type public.membership_role as enum
  ('player', 'tactical_staff', 'executive', 'captain', 'admin');

create type public.membership_status as enum
  ('active', 'inactive', 'graduated', 'removed');

create type public.tag_type as enum
  ('action', 'cause', 'result', 'phase', 'player', 'tactic', 'situation');

create type public.comment_type as enum
  ('observation', 'question', 'tactical_opinion', 'coaching_note');

-- ---------- tables ----------

create table public.users (
  id uuid primary key references auth.users (id) on delete cascade,
  email text not null unique,
  name text not null,
  avatar_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.teams (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null unique,
  sport text not null default 'water_polo',
  logo_url text,
  primary_color text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.memberships (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references public.teams (id) on delete cascade,
  user_id uuid not null references public.users (id) on delete cascade,
  role public.membership_role not null default 'player',
  status public.membership_status not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (team_id, user_id)
);

create table public.matches (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references public.teams (id) on delete cascade,
  title text not null,
  opponent text,
  match_date date,
  competition text,
  result text,
  score_for integer check (score_for >= 0),
  score_against integer check (score_against >= 0),
  -- javascript:等の危険スキーム混入をDBレベルで遮断(アプリ検証のバックストップ)
  video_url text check (video_url is null or video_url ~* '^https?://'),
  notes text,
  created_by uuid references public.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.video_clips (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references public.teams (id) on delete cascade,
  match_id uuid not null references public.matches (id) on delete cascade,
  title text not null,
  start_time_seconds integer not null check (start_time_seconds >= 0),
  end_time_seconds integer not null check (end_time_seconds > 0),
  quarter integer check (quarter between 1 and 4),
  description text,
  created_by uuid references public.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (start_time_seconds < end_time_seconds)
);

create table public.tag_templates (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references public.teams (id) on delete cascade,
  tag_type public.tag_type not null,
  tag_value text not null,
  description text,
  sort_order integer not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (team_id, tag_type, tag_value)
);

create table public.clip_tags (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references public.teams (id) on delete cascade,
  clip_id uuid not null references public.video_clips (id) on delete cascade,
  tag_type public.tag_type not null,
  tag_value text not null,
  created_by uuid references public.users (id) on delete set null,
  created_at timestamptz not null default now(),
  unique (clip_id, tag_type, tag_value)
);

create table public.clip_comments (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references public.teams (id) on delete cascade,
  clip_id uuid not null references public.video_clips (id) on delete cascade,
  user_id uuid not null references public.users (id) on delete cascade,
  comment text not null check (char_length(comment) between 1 and 1000),
  comment_type public.comment_type not null default 'observation',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.tactical_reports (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references public.teams (id) on delete cascade,
  match_id uuid not null references public.matches (id) on delete cascade,
  generated_by uuid references public.users (id) on delete set null,
  title text not null,
  summary text,
  offensive_findings text,
  defensive_findings text,
  transition_findings text,
  key_problem_patterns jsonb not null default '[]'::jsonb,
  recommended_training_themes jsonb not null default '[]'::jsonb,
  meeting_points jsonb not null default '[]'::jsonb,
  ai_confidence numeric check (ai_confidence between 0 and 1),
  created_at timestamptz not null default now()
);

-- ---------- indexes ----------
create index idx_memberships_user on public.memberships (user_id);
create index idx_memberships_team on public.memberships (team_id);
create index idx_matches_team on public.matches (team_id, match_date desc);
create index idx_clips_match on public.video_clips (match_id);
create index idx_clips_team on public.video_clips (team_id);
create index idx_clip_tags_clip on public.clip_tags (clip_id);
create index idx_clip_tags_team_type on public.clip_tags (team_id, tag_type, tag_value);
create index idx_clip_comments_clip on public.clip_comments (clip_id);
create index idx_reports_match on public.tactical_reports (match_id);
create index idx_tag_templates_team on public.tag_templates (team_id, tag_type, sort_order);

-- ---------- helper functions (security definer: RLS再帰を回避) ----------

create or replace function public.is_team_member(p_team_id uuid)
returns boolean
language sql stable security definer
set search_path = public
as $$
  select exists (
    select 1 from memberships m
    where m.team_id = p_team_id
      and m.user_id = auth.uid()
      and m.status = 'active'
  );
$$;

create or replace function public.has_team_role(p_team_id uuid, p_roles public.membership_role[])
returns boolean
language sql stable security definer
set search_path = public
as $$
  select exists (
    select 1 from memberships m
    where m.team_id = p_team_id
      and m.user_id = auth.uid()
      and m.status = 'active'
      and m.role = any (p_roles)
  );
$$;

create or replace function public.shares_team_with(p_user_id uuid)
returns boolean
language sql stable security definer
set search_path = public
as $$
  select exists (
    select 1
    from memberships me
    join memberships them
      on me.team_id = them.team_id
    where me.user_id = auth.uid()
      and me.status = 'active'
      and them.user_id = p_user_id
      and them.status = 'active'
  );
$$;

-- ---------- triggers ----------

create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger trg_users_updated before update on public.users
  for each row execute function public.set_updated_at();
create trigger trg_teams_updated before update on public.teams
  for each row execute function public.set_updated_at();
create trigger trg_memberships_updated before update on public.memberships
  for each row execute function public.set_updated_at();
create trigger trg_matches_updated before update on public.matches
  for each row execute function public.set_updated_at();
create trigger trg_clips_updated before update on public.video_clips
  for each row execute function public.set_updated_at();
create trigger trg_tag_templates_updated before update on public.tag_templates
  for each row execute function public.set_updated_at();
create trigger trg_clip_comments_updated before update on public.clip_comments
  for each row execute function public.set_updated_at();

-- auth.users -> public.users プロフィール自動作成
create or replace function public.handle_new_user()
returns trigger
language plpgsql security definer
set search_path = public
as $$
begin
  -- emailはadd_member_by_emailの照合に使うため小文字に正規化して保存する
  insert into public.users (id, email, name)
  values (
    new.id,
    lower(new.email),
    coalesce(new.raw_user_meta_data ->> 'name', split_part(new.email, '@', 1))
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- チーム作成者を admin として自動登録 + 水球初期タグをシード
create or replace function public.seed_default_tag_templates(p_team_id uuid)
returns void
language plpgsql security definer
set search_path = public
as $$
begin
  insert into public.tag_templates (team_id, tag_type, tag_value, sort_order)
  values
    (p_team_id, 'action', 'シュート', 1),
    (p_team_id, 'action', 'パスミス', 2),
    (p_team_id, 'action', '退水', 3),
    (p_team_id, 'action', '退水獲得', 4),
    (p_team_id, 'action', 'カウンター', 5),
    (p_team_id, 'action', 'センター起点', 6),
    (p_team_id, 'action', '6対5', 7),
    (p_team_id, 'action', '退水守備', 8),
    (p_team_id, 'cause', '判断ミス', 1),
    (p_team_id, 'cause', '連携ミス', 2),
    (p_team_id, 'cause', '戻り遅れ', 3),
    (p_team_id, 'cause', '声かけ不足', 4),
    (p_team_id, 'cause', 'マークずれ', 5),
    (p_team_id, 'cause', '準備不足', 6),
    (p_team_id, 'cause', '技術ミス', 7),
    (p_team_id, 'cause', '体力低下', 8),
    (p_team_id, 'result', '得点', 1),
    (p_team_id, 'result', '失点', 2),
    (p_team_id, 'result', 'チャンス創出', 3),
    (p_team_id, 'result', 'チャンス喪失', 4),
    (p_team_id, 'result', 'カウンター被弾', 5),
    (p_team_id, 'result', '退水獲得', 6),
    (p_team_id, 'result', '守備成功', 7),
    (p_team_id, 'phase', 'セット攻撃', 1),
    (p_team_id, 'phase', 'セット守備', 2),
    (p_team_id, 'phase', 'カウンター', 3),
    (p_team_id, 'phase', '被カウンター', 4),
    (p_team_id, 'phase', '6対5', 5),
    (p_team_id, 'phase', '5対6', 6),
    (p_team_id, 'phase', '試合終盤', 7)
  on conflict (team_id, tag_type, tag_value) do nothing;
end;
$$;

-- security definerかつ認可チェックを持たないため、PostgREST RPCとしての
-- 呼び出しを禁止する(トリガー経由でのみ実行される)
revoke execute on function public.seed_default_tag_templates(uuid)
  from public, anon, authenticated;

create or replace function public.handle_new_team()
returns trigger
language plpgsql security definer
set search_path = public
as $$
begin
  if auth.uid() is not null then
    insert into public.memberships (team_id, user_id, role, status)
    values (new.id, auth.uid(), 'admin', 'active')
    on conflict (team_id, user_id) do nothing;
  end if;
  perform public.seed_default_tag_templates(new.id);
  return new;
end;
$$;

create trigger on_team_created
  after insert on public.teams
  for each row execute function public.handle_new_team();

-- team_id 整合性: 子レコードの team_id を親から強制する
create or replace function public.enforce_clip_team()
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

create trigger trg_clip_team before insert or update of match_id on public.video_clips
  for each row execute function public.enforce_clip_team();

create or replace function public.enforce_clip_child_team()
returns trigger language plpgsql as $$
declare
  v_team uuid;
begin
  select team_id into v_team from public.video_clips where id = new.clip_id;
  if v_team is null then
    raise exception 'clip not found';
  end if;
  new.team_id := v_team;
  return new;
end;
$$;

create trigger trg_clip_tag_team before insert or update of clip_id on public.clip_tags
  for each row execute function public.enforce_clip_child_team();
create trigger trg_clip_comment_team before insert or update of clip_id on public.clip_comments
  for each row execute function public.enforce_clip_child_team();

create or replace function public.enforce_report_team()
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

create trigger trg_report_team before insert or update of match_id on public.tactical_reports
  for each row execute function public.enforce_report_team();

-- 管理者がメールでメンバーを追加する RPC
create or replace function public.add_member_by_email(
  p_team_id uuid,
  p_email text,
  p_role public.membership_role default 'player'
)
returns void
language plpgsql security definer
set search_path = public
as $$
declare
  v_user_id uuid;
begin
  if not public.has_team_role(p_team_id, array['admin']::public.membership_role[]) then
    raise exception 'permission denied: admin only';
  end if;

  select id into v_user_id from public.users where lower(email) = lower(p_email);
  if v_user_id is null then
    raise exception 'user not found: 先に本人がサインアップしてください';
  end if;

  insert into public.memberships (team_id, user_id, role, status)
  values (p_team_id, v_user_id, p_role, 'active')
  on conflict (team_id, user_id)
  do update set role = excluded.role, status = 'active';
end;
$$;

-- ---------- Row Level Security ----------

alter table public.users enable row level security;
alter table public.teams enable row level security;
alter table public.memberships enable row level security;
alter table public.matches enable row level security;
alter table public.video_clips enable row level security;
alter table public.tag_templates enable row level security;
alter table public.clip_tags enable row level security;
alter table public.clip_comments enable row level security;
alter table public.tactical_reports enable row level security;

-- スタッフ系ロール(試合・クリップ・タグ・レポート作成が可能)
-- tactical_staff / executive / captain / admin

-- users: 自分自身 + 同じチームのメンバーのみ閲覧可
create policy users_select on public.users for select
  using (id = auth.uid() or public.shares_team_with(id));
create policy users_update on public.users for update
  using (id = auth.uid());

-- emailはadd_member_by_emailの招待照合に使うため、クライアントからの
-- 変更を禁止する(なりすまし招待の防止)。name/avatar_urlのみ更新可。
revoke update on table public.users from anon, authenticated;
grant update (name, avatar_url) on table public.users to authenticated;

-- teams
create policy teams_select on public.teams for select
  using (public.is_team_member(id));
create policy teams_insert on public.teams for insert
  with check (auth.uid() is not null);
create policy teams_update on public.teams for update
  using (public.has_team_role(id, array['admin']::public.membership_role[]));
create policy teams_delete on public.teams for delete
  using (public.has_team_role(id, array['admin']::public.membership_role[]));

-- memberships: 自分のもの or 所属チームのものを閲覧、管理は admin
create policy memberships_select on public.memberships for select
  using (user_id = auth.uid() or public.is_team_member(team_id));
create policy memberships_insert on public.memberships for insert
  with check (public.has_team_role(team_id, array['admin']::public.membership_role[]));
create policy memberships_update on public.memberships for update
  using (public.has_team_role(team_id, array['admin']::public.membership_role[]));
create policy memberships_delete on public.memberships for delete
  using (public.has_team_role(team_id, array['admin']::public.membership_role[]));

-- matches: 閲覧は全メンバー、作成/更新はスタッフ系、削除は admin
create policy matches_select on public.matches for select
  using (public.is_team_member(team_id));
create policy matches_insert on public.matches for insert
  with check (
    public.has_team_role(team_id, array['tactical_staff','executive','captain','admin']::public.membership_role[])
    and created_by = auth.uid()
  );
create policy matches_update on public.matches for update
  using (public.has_team_role(team_id, array['tactical_staff','executive','captain','admin']::public.membership_role[]));
create policy matches_delete on public.matches for delete
  using (public.has_team_role(team_id, array['admin']::public.membership_role[]));

-- video_clips: 閲覧は全メンバー、作成/更新はスタッフ系
create policy clips_select on public.video_clips for select
  using (public.is_team_member(team_id));
create policy clips_insert on public.video_clips for insert
  with check (
    public.has_team_role(team_id, array['tactical_staff','executive','captain','admin']::public.membership_role[])
    and created_by = auth.uid()
  );
create policy clips_update on public.video_clips for update
  using (public.has_team_role(team_id, array['tactical_staff','executive','captain','admin']::public.membership_role[]));
create policy clips_delete on public.video_clips for delete
  using (public.has_team_role(team_id, array['tactical_staff','executive','captain','admin']::public.membership_role[]));

-- tag_templates: 閲覧は全メンバー、管理は admin
create policy tag_templates_select on public.tag_templates for select
  using (public.is_team_member(team_id));
create policy tag_templates_insert on public.tag_templates for insert
  with check (public.has_team_role(team_id, array['admin']::public.membership_role[]));
create policy tag_templates_update on public.tag_templates for update
  using (public.has_team_role(team_id, array['admin']::public.membership_role[]));
create policy tag_templates_delete on public.tag_templates for delete
  using (public.has_team_role(team_id, array['admin']::public.membership_role[]));

-- clip_tags: 閲覧は全メンバー、付与/削除はスタッフ系
create policy clip_tags_select on public.clip_tags for select
  using (public.is_team_member(team_id));
create policy clip_tags_insert on public.clip_tags for insert
  with check (
    public.has_team_role(team_id, array['tactical_staff','executive','captain','admin']::public.membership_role[])
    and created_by = auth.uid()
  );
create policy clip_tags_delete on public.clip_tags for delete
  using (public.has_team_role(team_id, array['tactical_staff','executive','captain','admin']::public.membership_role[]));

-- clip_comments: 閲覧/投稿は全メンバー(playerもコメント可)、編集/削除は本人のみ
create policy clip_comments_select on public.clip_comments for select
  using (public.is_team_member(team_id));
create policy clip_comments_insert on public.clip_comments for insert
  with check (public.is_team_member(team_id) and user_id = auth.uid());
create policy clip_comments_update on public.clip_comments for update
  using (user_id = auth.uid());
create policy clip_comments_delete on public.clip_comments for delete
  using (user_id = auth.uid());

-- tactical_reports: 閲覧は全メンバー、生成はスタッフ系、編集/確定は executive/captain/admin
create policy reports_select on public.tactical_reports for select
  using (public.is_team_member(team_id));
create policy reports_insert on public.tactical_reports for insert
  with check (
    public.has_team_role(team_id, array['tactical_staff','executive','captain','admin']::public.membership_role[])
    and generated_by = auth.uid()
  );
create policy reports_update on public.tactical_reports for update
  using (public.has_team_role(team_id, array['executive','captain','admin']::public.membership_role[]));
create policy reports_delete on public.tactical_reports for delete
  using (public.has_team_role(team_id, array['admin']::public.membership_role[]));
