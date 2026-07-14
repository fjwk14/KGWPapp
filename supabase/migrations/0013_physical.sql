-- =============================================================
-- 0013: フィジカル測定(EAV)
--   physical_measurements: 測定項目(metric)は今後増減しうるため
--   固定カラムではなく EAV(1行=1項目の測定値)で持つ。
--   カタログ(項目名・単位・向き・レーダー軸)は src/lib/physical.ts 側で定義する。
--
-- 何度実行しても安全(idempotent)。
-- 新規デプロイ: 0001 → … → 0012 → 0013 の順。
-- =============================================================

create table if not exists public.physical_measurements (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references public.teams (id) on delete cascade,
  user_id uuid not null references public.users (id) on delete cascade,
  measured_on date not null default current_date,
  metric text not null,
  value numeric not null,
  created_by uuid references public.users (id) on delete set null default auth.uid(),
  created_at timestamptz not null default now()
);

create index if not exists idx_physical_measurements_team_metric
  on public.physical_measurements (team_id, metric);
create index if not exists idx_physical_measurements_user_metric
  on public.physical_measurements (user_id, metric);

-- ---------- team_id 整合性はアプリ側(server action)で team.id を直接指定するため
-- match系のような子テーブルではなく、team_id自体が起点。トリガーは不要。

-- ---------- RLS ----------
alter table public.physical_measurements enable row level security;

drop policy if exists physical_measurements_select on public.physical_measurements;
drop policy if exists physical_measurements_insert on public.physical_measurements;
drop policy if exists physical_measurements_update on public.physical_measurements;
drop policy if exists physical_measurements_delete on public.physical_measurements;

-- 閲覧は全チームメンバー。記録・編集・削除はマネージャー・管理者のみ。
create policy physical_measurements_select on public.physical_measurements for select
  using (public.is_team_member(team_id));
create policy physical_measurements_insert on public.physical_measurements for insert
  with check (
    public.has_team_role(team_id, array['manager','admin']::public.membership_role[])
    and created_by = auth.uid()
  );
create policy physical_measurements_update on public.physical_measurements for update
  using (public.has_team_role(team_id, array['manager','admin']::public.membership_role[]));
create policy physical_measurements_delete on public.physical_measurements for delete
  using (public.has_team_role(team_id, array['manager','admin']::public.membership_role[]));
