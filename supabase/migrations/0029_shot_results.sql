-- =============================================================
-- 0029: シュート結果に「GK(GKセーブ)」「コーナー」を追加
--   従来: goal(ゴール) / miss(枠外) / blocked(ブロック)
--   追加: gk_save(GKに止められた) / corner(コーナー獲得)
--   ※ いずれも得点ではないので、シュート成功率の分母(試投)には
--     入るが分子(ゴール)には入らない(集計ロジックは result='goal'
--     のみを得点として数えるため変更不要)。
--
-- 何度実行しても安全(idempotent)。
-- 新規デプロイ: 0001 → … → 0028 → 0029 の順。
-- =============================================================

alter table public.stats_events drop constraint if exists stats_events_check;
alter table public.stats_events add constraint stats_events_check
  check (
    case type
      when 'shot' then
        subtype in ('center', 'drive', 'middle', 'back', 'one_touch', 'penalty', 'six_m', 'other')
        and result in ('goal', 'miss', 'blocked', 'gk_save', 'corner')
      when 'miss' then
        subtype in ('pass', 'keep', 'other') and result is null
      when 'gk_faced' then
        subtype is null and result in ('goal_against', 'block', 'off_target')
      when 'drawn_exclusion' then
        subtype in ('exclusion', 'penalty') and result is null
      else subtype is null and result is null
    end
  );
