-- =============================================================
-- 0028: 手動ポイント付与の上限を200→50に引き下げ
--   特別功労ポイントが突出しすぎないよう、1回あたりの上限を絞る。
--
-- 何度実行しても安全(idempotent)。
-- 新規デプロイ: 0001 → … → 0027 → 0028 の順。
-- =============================================================

alter table public.point_grants drop constraint if exists point_grants_points_check;
alter table public.point_grants add constraint point_grants_points_check
  check (points between 1 and 50);
