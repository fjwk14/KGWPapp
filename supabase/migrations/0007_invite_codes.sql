-- =============================================================
-- 0007: チーム招待コード
--   部員はサインアップ時(またはオンボーディング画面)に
--   チームの招待コードを入力するだけで、自動で選手として参加できる。
--   管理者がメールで後から追加する手間をなくす。
--
-- 既存デプロイへの適用: このファイルを Supabase SQL Editor に
-- 丸ごと貼り付けて Run するだけ。
-- 新規デプロイ: 0001 → 0004 → 0005 → 0006 → 0007 の順に適用。
-- =============================================================

-- 読み間違えやすい文字(0/O/1/I/L)を除いた6桁コードを生成する
create or replace function public.gen_invite_code()
returns text language plpgsql as $$
declare
  v_chars text := 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  v_code text;
  i int;
begin
  loop
    v_code := '';
    for i in 1..6 loop
      v_code := v_code || substr(v_chars, floor(random() * length(v_chars))::int + 1, 1);
    end loop;
    exit when not exists (select 1 from public.teams where invite_code = v_code);
  end loop;
  return v_code;
end;
$$;

alter table public.teams add column invite_code text;

-- 既存チームに一意なコードを割り当て(1行ずつ生成して重複回避)
do $$
declare r record;
begin
  for r in select id from public.teams where invite_code is null loop
    update public.teams set invite_code = public.gen_invite_code() where id = r.id;
  end loop;
end $$;

alter table public.teams alter column invite_code set default public.gen_invite_code();
alter table public.teams alter column invite_code set not null;
alter table public.teams add constraint teams_invite_code_key unique (invite_code);

-- 招待コードで参加する(選手として。RLSを跨ぐため security definer)
create or replace function public.join_team_by_code(p_code text)
returns uuid
language plpgsql security definer
set search_path = public
as $$
declare
  v_team_id uuid;
begin
  if auth.uid() is null then
    raise exception 'not authenticated';
  end if;
  select id into v_team_id from public.teams
    where upper(invite_code) = upper(trim(p_code));
  if v_team_id is null then
    raise exception 'invalid invite code';
  end if;
  insert into public.memberships (team_id, user_id, role, status)
  values (v_team_id, auth.uid(), 'player', 'active')
  on conflict (team_id, user_id) do update set status = 'active';
  return v_team_id;
end;
$$;

-- 管理者が招待コードを再発行する(漏洩時の無効化用)
create or replace function public.regenerate_invite_code(p_team_id uuid)
returns text
language plpgsql security definer
set search_path = public
as $$
declare v_code text;
begin
  if not public.has_team_role(p_team_id, array['admin']::public.membership_role[]) then
    raise exception 'permission denied: admin only';
  end if;
  v_code := public.gen_invite_code();
  update public.teams set invite_code = v_code where id = p_team_id;
  return v_code;
end;
$$;
