-- =============================================================
-- 0016: 役職の再編(その1)
--   1. membership_role に 'analysis_team'(分析チーム)を追加
--      ※「戦術班→戦術チーム」は表示名のみの変更(アプリ側)。DB値は
--        'tactical_staff' のまま変えない(既存データ・ポリシーを壊さない)。
--   2. 役職の併用(secondary_role)を管理者以外にも開放
--      権限判定(has_team_role)は 0008 で既に primary/secondary の
--      和集合になっているため、admin限定のCHECK制約を外すだけでよい。
--
-- ⚠️ Supabase SQL Editor での実行手順(重要):
--   PostgreSQLの制約で「enum値の追加」と「その値の使用」は
--   同一トランザクションにできません。必ず
--     1) このファイル(0016)を Run
--     2) その後で 0017_analysis_team_permissions.sql を Run
--   の順に、別々に実行してください。
-- =============================================================

alter type public.membership_role add value if not exists 'analysis_team';

-- 併用役職を全ロールに開放(admin限定の制約を撤廃)
alter table public.memberships
  drop constraint if exists memberships_secondary_role_admin_only;

-- 併用は primary と別の役職のみ(同じ役職の併用は無意味なので防ぐ)
alter table public.memberships
  drop constraint if exists memberships_secondary_role_distinct;
alter table public.memberships
  add constraint memberships_secondary_role_distinct
  check (secondary_role is null or secondary_role <> role);
