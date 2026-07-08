-- =============================================================
-- 0003: マネージャーに戦術班と同等の権限を付与
--   (試合登録・動画URL登録・クリップ作成・タグ付け・コメント・
--    AIレポート生成が可能。レポート確定と管理はできない)
--
-- ⚠️ 必ず 0002_add_manager_role.sql を先に Run してから実行してください。
--   既存デプロイ用の差分です。新規デプロイでは 0001 に含まれるため不要。
-- =============================================================

-- matches
drop policy if exists matches_insert on public.matches;
create policy matches_insert on public.matches for insert
  with check (
    public.has_team_role(team_id, array['manager','tactical_staff','executive','captain','admin']::public.membership_role[])
    and created_by = auth.uid()
  );
drop policy if exists matches_update on public.matches;
create policy matches_update on public.matches for update
  using (public.has_team_role(team_id, array['manager','tactical_staff','executive','captain','admin']::public.membership_role[]));

-- video_clips
drop policy if exists clips_insert on public.video_clips;
create policy clips_insert on public.video_clips for insert
  with check (
    public.has_team_role(team_id, array['manager','tactical_staff','executive','captain','admin']::public.membership_role[])
    and created_by = auth.uid()
  );
drop policy if exists clips_update on public.video_clips;
create policy clips_update on public.video_clips for update
  using (public.has_team_role(team_id, array['manager','tactical_staff','executive','captain','admin']::public.membership_role[]));
drop policy if exists clips_delete on public.video_clips;
create policy clips_delete on public.video_clips for delete
  using (public.has_team_role(team_id, array['manager','tactical_staff','executive','captain','admin']::public.membership_role[]));

-- clip_tags
drop policy if exists clip_tags_insert on public.clip_tags;
create policy clip_tags_insert on public.clip_tags for insert
  with check (
    public.has_team_role(team_id, array['manager','tactical_staff','executive','captain','admin']::public.membership_role[])
    and created_by = auth.uid()
  );
drop policy if exists clip_tags_delete on public.clip_tags;
create policy clip_tags_delete on public.clip_tags for delete
  using (public.has_team_role(team_id, array['manager','tactical_staff','executive','captain','admin']::public.membership_role[]));

-- tactical_reports (生成のみ。確定/編集は executive/captain/admin のまま)
drop policy if exists reports_insert on public.tactical_reports;
create policy reports_insert on public.tactical_reports for insert
  with check (
    public.has_team_role(team_id, array['manager','tactical_staff','executive','captain','admin']::public.membership_role[])
    and generated_by = auth.uid()
  );
