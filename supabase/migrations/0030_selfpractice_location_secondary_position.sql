-- =============================================================
-- 0030: 自主練の場所 + ポジションの併用
--   1. self_practices.location: 自主練の実施場所(任意)
--   2. memberships.secondary_field_position: ポジションの併用
--      (secondary_roleと同じ考え方。GKは対象外・is_gkはそのまま)
--
-- 何度実行しても安全(idempotent)。
-- 新規デプロイ: 0001 → … → 0029 → 0030 の順。
-- =============================================================

alter table public.self_practices add column if not exists location text;

alter table public.memberships add column if not exists secondary_field_position smallint
  check (secondary_field_position is null or secondary_field_position between 1 and 6);
