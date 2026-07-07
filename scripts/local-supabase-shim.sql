-- =============================================================
-- ローカル素のPostgreSQLでSupabase相当の前提を再現するシム。
-- 用途: マイグレーション検証・RLS統合テスト・ローカルE2E。
-- 本番のSupabaseでは実行不要(これらは最初から存在する)。
-- =============================================================

-- Supabase標準ロール
do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then
    create role anon nologin noinherit;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then
    create role authenticated nologin noinherit;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'service_role') then
    create role service_role nologin noinherit bypassrls;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticator') then
    create role authenticator login noinherit password 'postgres';
  end if;
end $$;

grant anon, authenticated, service_role to authenticator;

-- authスキーマ(GoTrue相当の最小構成)
create schema if not exists auth;

create table if not exists auth.users (
  id uuid primary key,
  instance_id uuid,
  aud text,
  role text,
  email text unique,
  encrypted_password text,
  email_confirmed_at timestamptz,
  raw_app_meta_data jsonb,
  raw_user_meta_data jsonb,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- SupabaseのJWTヘルパー(request.jwt.claims GUCから読む)
create or replace function auth.uid()
returns uuid
language sql stable
as $$
  select nullif(
    nullif(current_setting('request.jwt.claims', true), '')::json ->> 'sub',
    ''
  )::uuid
$$;

create or replace function auth.role()
returns text
language sql stable
as $$
  select coalesce(
    nullif(current_setting('request.jwt.claims', true), '')::json ->> 'role',
    'anon'
  )
$$;

grant usage on schema auth to anon, authenticated, service_role;

-- Supabaseのデフォルト権限相当: publicスキーマをAPIロールへ開放
-- (アクセス制御はRLSが担う)
grant usage on schema public to anon, authenticated, service_role;
alter default privileges in schema public
  grant all on tables to anon, authenticated, service_role;
alter default privileges in schema public
  grant all on sequences to anon, authenticated, service_role;
alter default privileges in schema public
  grant execute on functions to anon, authenticated, service_role;
