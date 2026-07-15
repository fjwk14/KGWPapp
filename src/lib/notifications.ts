// 未読バッジの判定ロジック(純関数)。
// 「未読」の定義: 自分宛メンション、または自分が参加した話題(自分が
// 起点/返信したスレッド)への新着コメントのうち、そのクリップの
// 最終既読時刻(comment_reads.last_read_at)より新しいもの。
// 自分自身の投稿は数えない。
export interface CommentForUnread {
  id: string;
  clip_id: string;
  parent_comment_id: string | null;
  user_id: string;
  mention_user_ids: string[];
  created_at: string;
}

export interface CommentReadRow {
  clip_id: string;
  last_read_at: string;
}

// 自分が「参加している」話題(root_comment_id)の集合を求める。
// root自体が自分の投稿 or その話題に自分が返信している場合に参加とみなす。
function involvedThreadIds(
  comments: CommentForUnread[],
  userId: string
): Set<string> {
  const involved = new Set<string>();
  for (const c of comments) {
    if (c.user_id !== userId) continue;
    const rootId = c.parent_comment_id ?? c.id;
    involved.add(rootId);
  }
  return involved;
}

function isUnreadCandidate(
  c: CommentForUnread,
  userId: string,
  involved: Set<string>
): boolean {
  if (c.user_id === userId) return false; // 自分の投稿は対象外
  const rootId = c.parent_comment_id ?? c.id;
  const mentioned = c.mention_user_ids?.includes(userId) ?? false;
  return mentioned || involved.has(rootId);
}

export function unreadCommentIds(
  comments: CommentForUnread[],
  reads: CommentReadRow[],
  userId: string
): string[] {
  const lastReadByClip = new Map(reads.map((r) => [r.clip_id, r.last_read_at]));
  const involved = involvedThreadIds(comments, userId);
  return comments
    .filter((c) => {
      if (!isUnreadCandidate(c, userId, involved)) return false;
      const lastRead = lastReadByClip.get(c.clip_id);
      return !lastRead || c.created_at > lastRead;
    })
    .map((c) => c.id);
}

// 既読/未読を問わず、自分に関係する(メンション or 自分が参加したスレッドの)
// 他人からのコメントID。マイページの「最近もらったコメント」に使う。
export function receivedCommentIds(
  comments: CommentForUnread[],
  userId: string
): string[] {
  const involved = involvedThreadIds(comments, userId);
  return comments
    .filter((c) => isUnreadCandidate(c, userId, involved))
    .map((c) => c.id);
}

export function countUnreadComments(
  comments: CommentForUnread[],
  reads: CommentReadRow[],
  userId: string
): number {
  return unreadCommentIds(comments, reads, userId).length;
}

// クリップ単位の未読有無(一覧画面でのバッジ表示に使う)
export function unreadClipIds(
  comments: CommentForUnread[],
  reads: CommentReadRow[],
  userId: string
): Set<string> {
  const ids = unreadCommentIds(comments, reads, userId);
  const byId = new Map(comments.map((c) => [c.id, c]));
  const clips = new Set<string>();
  for (const id of ids) {
    const c = byId.get(id);
    if (c) clips.add(c.clip_id);
  }
  return clips;
}
