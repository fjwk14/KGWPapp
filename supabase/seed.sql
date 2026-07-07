-- =============================================================
-- ローカル開発用シード (supabase db reset で適用)
-- ※ auth.users への直接 insert はローカル環境専用。
--    本番では通常のサインアップフローを使うこと。
-- ※ 実部員名は使用しない(ダミーデータのみ)。
-- =============================================================

-- ダミーユーザー (パスワードは全員 "password123")
insert into auth.users (
  id, instance_id, aud, role, email, encrypted_password,
  email_confirmed_at, raw_app_meta_data, raw_user_meta_data,
  created_at, updated_at
)
values
  ('11111111-1111-1111-1111-111111111111', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'admin@example.com',
   crypt('password123', gen_salt('bf')), now(),
   '{"provider":"email","providers":["email"]}', '{"name":"管理者テスト"}', now(), now()),
  ('22222222-2222-2222-2222-222222222222', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'staff@example.com',
   crypt('password123', gen_salt('bf')), now(),
   '{"provider":"email","providers":["email"]}', '{"name":"戦術班テスト"}', now(), now()),
  ('33333333-3333-3333-3333-333333333333', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'captain@example.com',
   crypt('password123', gen_salt('bf')), now(),
   '{"provider":"email","providers":["email"]}', '{"name":"主将テスト"}', now(), now()),
  ('44444444-4444-4444-4444-444444444444', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'player@example.com',
   crypt('password123', gen_salt('bf')), now(),
   '{"provider":"email","providers":["email"]}', '{"name":"選手テスト"}', now(), now());

-- デモチーム(トリガーが admin membership + 初期タグを自動作成しないよう、
-- auth.uid() が無いコンテキストなので membership は手動で入れる)
insert into public.teams (id, name, slug, sport, primary_color)
values ('aaaaaaaa-0000-0000-0000-000000000001', 'KGデモ水球部', 'kg-demo', 'water_polo', '#1d4ed8');

insert into public.memberships (team_id, user_id, role, status)
values
  ('aaaaaaaa-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111', 'admin', 'active'),
  ('aaaaaaaa-0000-0000-0000-000000000001', '22222222-2222-2222-2222-222222222222', 'tactical_staff', 'active'),
  ('aaaaaaaa-0000-0000-0000-000000000001', '33333333-3333-3333-3333-333333333333', 'captain', 'active'),
  ('aaaaaaaa-0000-0000-0000-000000000001', '44444444-4444-4444-4444-444444444444', 'player', 'active');

-- デモ試合
insert into public.matches (id, team_id, title, opponent, match_date, competition, result, score_for, score_against, video_url, created_by)
values (
  'bbbbbbbb-0000-0000-0000-000000000001',
  'aaaaaaaa-0000-0000-0000-000000000001',
  '練習試合 vs Aチーム', 'Aチーム', current_date - 7, '練習試合', 'lose', 8, 11,
  'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
  '22222222-2222-2222-2222-222222222222'
);

-- デモクリップ + タグ + コメント
insert into public.video_clips (id, team_id, match_id, title, start_time_seconds, end_time_seconds, quarter, description, created_by)
values
  ('cccccccc-0000-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-000000000001',
   'bbbbbbbb-0000-0000-0000-000000000001', 'Q2 カウンター失点', 615, 645, 2,
   '戻りが遅れて2対1を作られた場面', '22222222-2222-2222-2222-222222222222'),
  ('cccccccc-0000-0000-0000-000000000002', 'aaaaaaaa-0000-0000-0000-000000000001',
   'bbbbbbbb-0000-0000-0000-000000000001', 'Q3 6対5で得点', 1280, 1310, 3,
   '退水獲得からのセットで左45度から得点', '22222222-2222-2222-2222-222222222222');

insert into public.clip_tags (team_id, clip_id, tag_type, tag_value, created_by)
values
  ('aaaaaaaa-0000-0000-0000-000000000001', 'cccccccc-0000-0000-0000-000000000001', 'phase', '被カウンター', '22222222-2222-2222-2222-222222222222'),
  ('aaaaaaaa-0000-0000-0000-000000000001', 'cccccccc-0000-0000-0000-000000000001', 'cause', '戻り遅れ', '22222222-2222-2222-2222-222222222222'),
  ('aaaaaaaa-0000-0000-0000-000000000001', 'cccccccc-0000-0000-0000-000000000001', 'result', '失点', '22222222-2222-2222-2222-222222222222'),
  ('aaaaaaaa-0000-0000-0000-000000000001', 'cccccccc-0000-0000-0000-000000000002', 'phase', '6対5', '22222222-2222-2222-2222-222222222222'),
  ('aaaaaaaa-0000-0000-0000-000000000001', 'cccccccc-0000-0000-0000-000000000002', 'action', 'シュート', '22222222-2222-2222-2222-222222222222'),
  ('aaaaaaaa-0000-0000-0000-000000000001', 'cccccccc-0000-0000-0000-000000000002', 'result', '得点', '22222222-2222-2222-2222-222222222222');

insert into public.clip_comments (team_id, clip_id, user_id, comment, comment_type)
values
  ('aaaaaaaa-0000-0000-0000-000000000001', 'cccccccc-0000-0000-0000-000000000001',
   '33333333-3333-3333-3333-333333333333', 'シュート後の切り替えの声かけを徹底したい', 'tactical_opinion'),
  ('aaaaaaaa-0000-0000-0000-000000000001', 'cccccccc-0000-0000-0000-000000000002',
   '44444444-4444-4444-4444-444444444444', 'このセットの動き方をもう一度確認したいです', 'question');
