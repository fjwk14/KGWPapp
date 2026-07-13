-- =============================================================
-- 0010: メンバーの既定の帽子番号・ポジション(GK/フィールダー)
--   管理画面で各メンバーに帽子番号とGK区分を設定しておくと、
--   試合記録の出場メンバー選択がその値で初期化され、毎回の
--   手入力が不要になる。
--
-- 何度実行しても安全(idempotent)。
-- 新規デプロイ: 0001 → … → 0009 → 0010 の順。
-- =============================================================

alter table public.memberships add column if not exists cap_number integer
  check (cap_number is null or cap_number between 1 and 99);
alter table public.memberships add column if not exists is_gk boolean not null default false;

-- 同一チーム内で帽子番号は重複させない(未設定=nullは重複可)
create unique index if not exists uniq_membership_cap
  on public.memberships (team_id, cap_number)
  where cap_number is not null;
