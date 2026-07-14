-- =============================================================
-- 0012: メンバーのポジション区分(帽子番号の位置)
--   分析のポジション別基準に使う。
--   field_position: 1=右奥 2=右手前 3=センターバック 4=左手前 5=左奥 6=センター
--   GK は既存の is_gk = true で表す(field_position は null)。
--
-- 何度実行しても安全(idempotent)。
-- 新規デプロイ: 0001 → … → 0011 → 0012 の順。
-- =============================================================

alter table public.memberships add column if not exists field_position smallint
  check (field_position is null or field_position between 1 and 6);
