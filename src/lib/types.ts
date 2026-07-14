export type Role =
  | "player"
  | "manager"
  | "tactical_staff"
  | "executive"
  | "captain"
  | "admin";

export type MembershipStatus = "active" | "inactive" | "graduated" | "removed";

export type TagType =
  | "action"
  | "cause"
  | "result"
  | "phase"
  | "player"
  | "tactic"
  | "situation";

export type CommentType =
  | "observation"
  | "question"
  | "tactical_opinion"
  | "coaching_note";

export interface Team {
  id: string;
  name: string;
  slug: string;
  sport: string;
  logo_url: string | null;
  primary_color: string | null;
  invite_code: string;
}

export interface Membership {
  id: string;
  team_id: string;
  user_id: string;
  role: Role;
  secondary_role: Role | null;
  status: MembershipStatus;
  cap_number: number | null;
  is_gk: boolean;
  field_position: number | null;
}

export interface Profile {
  id: string;
  email: string;
  name: string;
  family_name: string | null;
  given_name: string | null;
  avatar_url: string | null;
}

// Q別得失点: キーは "1"〜"4" と "5"(PSO)
export type QuarterScores = Partial<
  Record<"1" | "2" | "3" | "4" | "5", { for?: number; against?: number }>
>;

export interface Match {
  id: string;
  team_id: string;
  title: string;
  opponent: string | null;
  match_date: string | null;
  competition: string | null;
  result: string | null;
  score_for: number | null;
  score_against: number | null;
  quarter_scores: QuarterScores | null;
  video_url: string | null;
  notes: string | null;
  created_by: string | null;
  created_at: string;
}

// 試合動画(後日添付。クオーター単位で複数登録できる)
export interface MatchVideo {
  id: string;
  team_id: string;
  match_id: string;
  quarter: number | null; // 1-4 = Q1-Q4, 5 = PSO, null = フル動画
  title: string | null;
  url: string;
  created_by: string | null;
  created_at: string;
}

export interface VideoClip {
  id: string;
  team_id: string;
  match_id: string;
  video_id: string | null;
  title: string;
  start_time_seconds: number;
  end_time_seconds: number;
  quarter: number | null;
  description: string | null;
  created_by: string | null;
  created_at: string;
}

export interface ClipTag {
  id: string;
  team_id: string;
  clip_id: string;
  tag_type: TagType;
  tag_value: string;
}

export interface ClipComment {
  id: string;
  team_id: string;
  clip_id: string;
  user_id: string;
  comment: string;
  comment_type: CommentType;
  parent_comment_id: string | null;
  mention_user_ids: string[];
  created_at: string;
}

export interface TagTemplate {
  id: string;
  team_id: string;
  tag_type: TagType;
  tag_value: string;
  description: string | null;
  sort_order: number;
  is_active: boolean;
}

export interface TacticalReport {
  id: string;
  team_id: string;
  match_id: string;
  generated_by: string | null;
  title: string;
  summary: string | null;
  offensive_findings: string | null;
  defensive_findings: string | null;
  transition_findings: string | null;
  key_problem_patterns: string[];
  recommended_training_themes: string[];
  meeting_points: string[];
  ai_confidence: number | null;
  created_at: string;
}
