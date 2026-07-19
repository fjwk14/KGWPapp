-- =============================================================
-- 0032: 出欠回答の理由
--   practice_attendances.reason: 出席以外を回答する際に添えられる理由。
--   チーム内全員に公開(閲覧ポリシーは既存のselectポリシーのまま)。
--
-- 何度実行しても安全(idempotent)。
-- 新規デプロイ: 0001 → … → 0031 → 0032 の順。
-- =============================================================

alter table public.practice_attendances add column if not exists reason text
  check (reason is null or char_length(reason) <= 300);
