-- =============================================================
-- 0014: 展開力・対人守備を実データ化するイベント種別を追加
--   試合記録のワンタップ項目に3つ追加する:
--     key_pass      : 縦パス(攻撃の起点になる縦パス/展開)  → 展開力
--     counter_join  : 速攻参加(カウンターで前線に走る/繋ぐ) → 展開力
--     defense_stop  : 対人守備(1対1で相手を抑えた/撃たせず) → 対人守備
--   いずれも player_id 必須・subtype/result なし(既存CHECKのelse分岐で成立)。
--
-- 何度実行しても安全(idempotent)。
-- 新規デプロイ: 0001 → … → 0013 → 0014 の順。
-- =============================================================

alter table public.stats_events drop constraint if exists stats_events_type_check;
alter table public.stats_events add constraint stats_events_type_check
  check (type in (
    'shot', 'assist', 'cut', 'drawn_exclusion', 'exclusion',
    'offensive_foul', 'miss', 'gk_faced', 'attack_end_no_shot', 'opponent_goal',
    'key_pass', 'counter_join', 'defense_stop'
  ));
