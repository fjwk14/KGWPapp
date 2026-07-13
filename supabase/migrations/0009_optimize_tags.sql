-- =============================================================
-- 0009: タグテンプレートの最適化(水球特化)
--   デフォルトのタグを水球の実プレー・戦術に合わせて精査・再構成する。
--   action/cause/result/phase に加え tactic/situation も活用。
--
--   既存チームには「旧デフォルトのうち置き換えたもの」だけを削除し、
--   新デフォルトを追加する(管理者が手動追加したタグは残る)。
--   clip_tags は tag_type/tag_value を直接保持するため、
--   テンプレート変更は既存クリップのタグに影響しない。
--
-- 何度実行しても安全(idempotent)。
-- 新規デプロイ: 0001 → … → 0008 → 0009 の順。
-- =============================================================

create or replace function public.seed_default_tag_templates(p_team_id uuid)
returns void
language plpgsql security definer
set search_path = public
as $$
begin
  insert into public.tag_templates (team_id, tag_type, tag_value, sort_order)
  values
    -- プレー(action)
    (p_team_id, 'action', 'センターシュート', 1),
    (p_team_id, 'action', 'ドライブシュート', 2),
    (p_team_id, 'action', 'ミドルシュート', 3),
    (p_team_id, 'action', 'ワンタッチシュート', 4),
    (p_team_id, 'action', 'カウンターシュート', 5),
    (p_team_id, 'action', '縦パス（センターへ）', 6),
    (p_team_id, 'action', 'サイド展開', 7),
    (p_team_id, 'action', 'ドライブ（飛び込み）', 8),
    (p_team_id, 'action', 'スクリーン', 9),
    (p_team_id, 'action', 'スティール', 10),
    (p_team_id, 'action', 'シュートブロック', 11),
    (p_team_id, 'action', '退水誘発', 12),
    (p_team_id, 'action', 'パスミス', 13),
    (p_team_id, 'action', 'オフェンスファウル', 14),
    -- 要因(cause)
    (p_team_id, 'cause', '判断ミス', 1),
    (p_team_id, 'cause', '連携ミス', 2),
    (p_team_id, 'cause', '戻り遅れ', 3),
    (p_team_id, 'cause', '声かけ不足', 4),
    (p_team_id, 'cause', 'マークずれ', 5),
    (p_team_id, 'cause', 'センター対応ミス', 6),
    (p_team_id, 'cause', 'スクリーン対応ミス', 7),
    (p_team_id, 'cause', 'プレス剥がれ', 8),
    (p_team_id, 'cause', '技術ミス', 9),
    (p_team_id, 'cause', '集中力低下', 10),
    -- 結果(result)
    (p_team_id, 'result', '得点', 1),
    (p_team_id, 'result', '失点', 2),
    (p_team_id, 'result', '退水獲得', 3),
    (p_team_id, 'result', '退水された', 4),
    (p_team_id, 'result', 'ペナルティ獲得', 5),
    (p_team_id, 'result', 'ボール奪取', 6),
    (p_team_id, 'result', 'ターンオーバー', 7),
    (p_team_id, 'result', 'チャンス創出', 8),
    (p_team_id, 'result', '決定機逸', 9),
    -- 局面(phase)
    (p_team_id, 'phase', 'セットオフェンス', 1),
    (p_team_id, 'phase', 'セットディフェンス', 2),
    (p_team_id, 'phase', 'カウンター', 3),
    (p_team_id, 'phase', '被カウンター', 4),
    (p_team_id, 'phase', '退水攻撃（6対5）', 5),
    (p_team_id, 'phase', '退水守備（5対6）', 6),
    (p_team_id, 'phase', 'ペナルティ', 7),
    (p_team_id, 'phase', '試合終盤', 8),
    -- 戦術(tactic)
    (p_team_id, 'tactic', 'プレスディフェンス', 1),
    (p_team_id, 'tactic', 'ゾーンディフェンス', 2),
    (p_team_id, 'tactic', 'ドロップ', 3),
    (p_team_id, 'tactic', 'ダブルチーム', 4),
    (p_team_id, 'tactic', 'センター起点', 5),
    (p_team_id, 'tactic', 'アウトサイド狙い', 6),
    (p_team_id, 'tactic', 'スクリーンプレー', 7),
    (p_team_id, 'tactic', 'M型（6対5）', 8),
    -- 状況(situation)
    (p_team_id, 'situation', '数的優位', 1),
    (p_team_id, 'situation', '数的不利', 2),
    (p_team_id, 'situation', 'イーブン（6対6）', 3),
    (p_team_id, 'situation', 'ショットクロック残少', 4),
    (p_team_id, 'situation', 'リード時', 5),
    (p_team_id, 'situation', 'ビハインド時', 6)
  on conflict (team_id, tag_type, tag_value) do nothing;
end;
$$;

revoke execute on function public.seed_default_tag_templates(uuid)
  from public, anon, authenticated;

-- 旧デフォルトのうち、新デフォルトで置き換えた(=新セットに無い)ものを削除
delete from public.tag_templates t
where (t.tag_type, t.tag_value) in (
  ('action', 'シュート'),
  ('action', '退水'),
  ('action', '退水獲得'),
  ('action', 'カウンター'),
  ('action', 'センター起点'),
  ('action', '6対5'),
  ('action', '退水守備'),
  ('cause', '準備不足'),
  ('cause', '体力低下'),
  ('result', 'チャンス喪失'),
  ('result', 'カウンター被弾'),
  ('result', '守備成功'),
  ('phase', 'セット攻撃'),
  ('phase', 'セット守備'),
  ('phase', '6対5'),
  ('phase', '5対6')
);

-- 全チームに新デフォルトを付与(既存の残ったタグ・手動追加分は保持)
do $$
declare r record;
begin
  for r in select id from public.teams loop
    perform public.seed_default_tag_templates(r.id);
  end loop;
end $$;
