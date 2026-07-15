-- =============================================================
-- 0021: 練習予定 + 事前出欠申告
--   マネージャーが練習を「予定(scheduled)」として先に作成しておくと、
--   各部員が自分の出欠(出席/欠席/遅刻/見学)を事前に自己申告できる。
--   従来通り「記録して出欠へ」で当日その場で記録する運用(done・全員出席で
--   初期化)もそのまま使える。
--
--   1. practices.status: 'scheduled'(予定) | 'done'(実施済み・記録)
--   2. practice_attendances に自分の行だけを書ける自己申告ポリシーを追加
--      (既存のマネージャー/管理者ポリシーと並存。どちらかを満たせばよい)
--
-- 何度実行しても安全(idempotent)。
-- 新規デプロイ: 0001 → … → 0020 → 0021 の順。
-- =============================================================

alter table public.practices add column if not exists status text
  not null default 'scheduled' check (status in ('scheduled', 'done'));

-- 既存データはすべて「記録して出欠へ」で作られた実施済み練習として扱う
update public.practices set status = 'done' where status = 'scheduled';

-- ---------- 自己申告(誰でも自分の出欠だけは書ける) ----------
drop policy if exists practice_attendances_insert_self on public.practice_attendances;
create policy practice_attendances_insert_self on public.practice_attendances for insert
  with check (public.is_team_member(team_id) and user_id = auth.uid());

drop policy if exists practice_attendances_update_self on public.practice_attendances;
create policy practice_attendances_update_self on public.practice_attendances for update
  using (user_id = auth.uid());
