-- =============================================================
-- 0019: シュート種別の追加(ミドル・バック) + 分析記録項目の拡充
--   1. シュート subtype に 'middle'(ミドル)・'back'(バック)を追加。
--      → 統合CHECK制約(stats_events_check)を作り直す。
--   2. 分析チームの記録項目(type)を4つ追加(O/D整理・0028相当):
--        side_switch : サイド展開(逆サイドへの展開)       → 展開力
--        screen      : スクリーン(味方のためのピック)     → 創出力
--        shot_block  : シュートブロック                    → 守備力
--        steal_ball  : スティール(ボールを奪う)           → 判断力
--      いずれも player_id 必須・subtype/result なし(else分岐で成立)。
--
-- 何度実行しても安全(idempotent)。
-- 新規デプロイ: 0001 → … → 0018 → 0019 の順。
-- =============================================================

-- ---------- 1. type の許可値を拡張 ----------
alter table public.stats_events drop constraint if exists stats_events_type_check;
alter table public.stats_events add constraint stats_events_type_check
  check (type in (
    'shot', 'assist', 'cut', 'drawn_exclusion', 'exclusion',
    'offensive_foul', 'miss', 'gk_faced', 'attack_end_no_shot', 'opponent_goal',
    'key_pass', 'counter_join', 'defense_stop',
    'off_ball_move', 'rebound_win', 'drive_break',
    'side_switch', 'screen', 'shot_block', 'steal_ball'
  ));

-- ---------- 2. type ごとの subtype/result 整合性(シュートにmiddle/back追加) ----------
alter table public.stats_events drop constraint if exists stats_events_check;
alter table public.stats_events add constraint stats_events_check
  check (
    case type
      when 'shot' then
        subtype in ('center', 'drive', 'middle', 'back', 'one_touch', 'penalty', 'six_m', 'other')
        and result in ('goal', 'miss', 'blocked')
      when 'miss' then
        subtype in ('pass', 'keep', 'other') and result is null
      when 'gk_faced' then
        subtype is null and result in ('goal_against', 'block', 'off_target')
      when 'drawn_exclusion' then
        subtype in ('exclusion', 'penalty') and result is null
      else subtype is null and result is null
    end
  );
