-- =============================================================
-- 0017: 役職の再編(その2)- 分析チームの権限
--   分析チーム(analysis_team)ができること:
--     - 試合記録(分析モード): stats_events / match_rosters の記録
--     - クリップ作成・編集・タグ付け(分析・戦術の道具)
--     - AI戦術レポートの生成
--     - メンバーの視聴状況の閲覧
--   試合情報そのものの作成・編集、チーム管理はできない(従来どおり)。
--
-- ⚠️ 必ず 0016 を先に実行してから、このファイルを実行してください
--   (enum値の追加と使用は同一トランザクションにできないため)。
-- 何度実行しても安全(idempotent)。
-- =============================================================

-- ---------- 試合記録(スタッツ・出場メンバー) ----------
drop policy if exists rosters_insert on public.match_rosters;
create policy rosters_insert on public.match_rosters for insert
  with check (public.has_team_role(team_id, array['manager','analysis_team','admin']::public.membership_role[]));
drop policy if exists rosters_update on public.match_rosters;
create policy rosters_update on public.match_rosters for update
  using (public.has_team_role(team_id, array['manager','analysis_team','admin']::public.membership_role[]));
drop policy if exists rosters_delete on public.match_rosters;
create policy rosters_delete on public.match_rosters for delete
  using (public.has_team_role(team_id, array['manager','analysis_team','admin']::public.membership_role[]));

drop policy if exists stats_insert on public.stats_events;
create policy stats_insert on public.stats_events for insert
  with check (
    public.has_team_role(team_id, array['manager','analysis_team','admin']::public.membership_role[])
    and created_by = auth.uid()
  );
drop policy if exists stats_delete on public.stats_events;
create policy stats_delete on public.stats_events for delete
  using (public.has_team_role(team_id, array['manager','analysis_team','admin']::public.membership_role[]));

-- ---------- クリップ・タグ・レポート(分析の道具) ----------
drop policy if exists clips_insert on public.video_clips;
create policy clips_insert on public.video_clips for insert
  with check (
    public.has_team_role(team_id, array['manager','tactical_staff','analysis_team','executive','captain','admin']::public.membership_role[])
    and created_by = auth.uid()
  );
drop policy if exists clips_update on public.video_clips;
create policy clips_update on public.video_clips for update
  using (public.has_team_role(team_id, array['manager','tactical_staff','analysis_team','executive','captain','admin']::public.membership_role[]));
drop policy if exists clips_delete on public.video_clips;
create policy clips_delete on public.video_clips for delete
  using (public.has_team_role(team_id, array['manager','tactical_staff','analysis_team','executive','captain','admin']::public.membership_role[]));

drop policy if exists clip_tags_insert on public.clip_tags;
create policy clip_tags_insert on public.clip_tags for insert
  with check (
    public.has_team_role(team_id, array['manager','tactical_staff','analysis_team','executive','captain','admin']::public.membership_role[])
    and created_by = auth.uid()
  );
drop policy if exists clip_tags_delete on public.clip_tags;
create policy clip_tags_delete on public.clip_tags for delete
  using (public.has_team_role(team_id, array['manager','tactical_staff','analysis_team','executive','captain','admin']::public.membership_role[]));

drop policy if exists reports_insert on public.tactical_reports;
create policy reports_insert on public.tactical_reports for insert
  with check (
    public.has_team_role(team_id, array['manager','tactical_staff','analysis_team','executive','captain','admin']::public.membership_role[])
    and generated_by = auth.uid()
  );

-- ---------- 視聴状況の閲覧 ----------
drop policy if exists clip_views_select on public.clip_views;
create policy clip_views_select on public.clip_views for select
  using (
    user_id = auth.uid()
    or public.has_team_role(team_id, array['manager','tactical_staff','analysis_team','executive','captain','admin']::public.membership_role[])
  );
