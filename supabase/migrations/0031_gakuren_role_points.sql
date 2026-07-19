-- =============================================================
-- 0031: 学連ロール + 学連関与試合の自動ポイント付与
--   1. membership_role に 'gakuren'(学連)を追加
--   2. matches.gakuren_involved: その試合の運営に学連が関わったか(任意選択)
--
-- ポイント自体は専用テーブルを持たず、既存の設計方針どおり
-- (matches.gakuren_involved = true の試合数) × 3pt を
-- 学連ロール保持者に都度算出する(アプリ側 points.ts / points-data.ts)。
--
-- 何度実行しても安全(idempotent)。
-- 新規デプロイ: 0001 → … → 0030 → 0031 の順。
-- =============================================================

alter type public.membership_role add value if not exists 'gakuren';

alter table public.matches add column if not exists gakuren_involved boolean not null default false;
