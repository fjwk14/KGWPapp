export type Role =
  | "player"
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
}

export interface Membership {
  id: string;
  team_id: string;
  user_id: string;
  role: Role;
  status: MembershipStatus;
}

export interface Profile {
  id: string;
  email: string;
  name: string;
  avatar_url: string | null;
}

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
  video_url: string | null;
  notes: string | null;
  created_by: string | null;
  created_at: string;
}

export interface VideoClip {
  id: string;
  team_id: string;
  match_id: string;
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
