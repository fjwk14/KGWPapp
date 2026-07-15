import { describe, expect, it } from "vitest";
import {
  countUnreadComments,
  receivedCommentIds,
  unreadClipIds,
  unreadCommentIds,
  type CommentForUnread,
  type CommentReadRow,
} from "@/lib/notifications";

function c(partial: Partial<CommentForUnread> & Pick<CommentForUnread, "id" | "clip_id" | "user_id" | "created_at">): CommentForUnread {
  return {
    parent_comment_id: null,
    mention_user_ids: [],
    ...partial,
  };
}

describe("unreadCommentIds", () => {
  it("自分宛メンションは未読になる", () => {
    const comments = [
      c({ id: "1", clip_id: "clip1", user_id: "other", mention_user_ids: ["me"], created_at: "2026-01-02" }),
    ];
    const reads: CommentReadRow[] = [];
    expect(unreadCommentIds(comments, reads, "me")).toEqual(["1"]);
  });

  it("自分が起点の話題への返信は未読になる", () => {
    const comments = [
      c({ id: "root", clip_id: "clip1", user_id: "me", created_at: "2026-01-01" }),
      c({ id: "reply", clip_id: "clip1", user_id: "other", parent_comment_id: "root", created_at: "2026-01-02" }),
    ];
    expect(unreadCommentIds(comments, [], "me")).toEqual(["reply"]);
  });

  it("自分が返信済みの話題への新着返信も未読になる(自分の訪問時に既読済みの前提)", () => {
    const comments = [
      c({ id: "root", clip_id: "clip1", user_id: "other1", created_at: "2026-01-01" }),
      c({ id: "myReply", clip_id: "clip1", user_id: "me", parent_comment_id: "root", created_at: "2026-01-02" }),
      c({ id: "newReply", clip_id: "clip1", user_id: "other2", parent_comment_id: "root", created_at: "2026-01-03" }),
    ];
    // 返信するためにクリップを訪問した時点でMarkCommentsReadが既読化する想定
    const reads: CommentReadRow[] = [{ clip_id: "clip1", last_read_at: "2026-01-02" }];
    expect(unreadCommentIds(comments, reads, "me")).toEqual(["newReply"]);
  });

  it("既読記録が全く無い場合、参加スレッドの他人の投稿は全て未読候補になる", () => {
    const comments = [
      c({ id: "root", clip_id: "clip1", user_id: "other1", created_at: "2026-01-01" }),
      c({ id: "myReply", clip_id: "clip1", user_id: "me", parent_comment_id: "root", created_at: "2026-01-02" }),
    ];
    expect(unreadCommentIds(comments, [], "me")).toEqual(["root"]);
  });

  it("無関係な話題(自分の投稿もメンションもない)は未読にならない", () => {
    const comments = [
      c({ id: "root", clip_id: "clip1", user_id: "other1", created_at: "2026-01-01" }),
      c({ id: "reply", clip_id: "clip1", user_id: "other2", parent_comment_id: "root", created_at: "2026-01-02" }),
    ];
    expect(unreadCommentIds(comments, [], "me")).toEqual([]);
  });

  it("自分自身の投稿は未読に数えない", () => {
    const comments = [
      c({ id: "1", clip_id: "clip1", user_id: "me", mention_user_ids: ["me"], created_at: "2026-01-01" }),
    ];
    expect(unreadCommentIds(comments, [], "me")).toEqual([]);
  });

  it("既読時刻より前のコメントは未読にならない", () => {
    const comments = [
      c({ id: "1", clip_id: "clip1", user_id: "other", mention_user_ids: ["me"], created_at: "2026-01-01" }),
      c({ id: "2", clip_id: "clip1", user_id: "other", mention_user_ids: ["me"], created_at: "2026-01-03" }),
    ];
    const reads: CommentReadRow[] = [{ clip_id: "clip1", last_read_at: "2026-01-02" }];
    expect(unreadCommentIds(comments, reads, "me")).toEqual(["2"]);
  });

  it("既読が無いクリップは全て未読候補になる", () => {
    const comments = [
      c({ id: "1", clip_id: "clip1", user_id: "other", mention_user_ids: ["me"], created_at: "2020-01-01" }),
    ];
    expect(unreadCommentIds(comments, [], "me")).toEqual(["1"]);
  });
});

describe("countUnreadComments", () => {
  it("未読件数を返す", () => {
    const comments = [
      c({ id: "1", clip_id: "clip1", user_id: "other", mention_user_ids: ["me"], created_at: "2026-01-01" }),
      c({ id: "2", clip_id: "clip2", user_id: "other", mention_user_ids: ["me"], created_at: "2026-01-01" }),
    ];
    expect(countUnreadComments(comments, [], "me")).toBe(2);
  });
});

describe("receivedCommentIds", () => {
  it("既読/未読を問わず自分宛・参加スレッドのコメントを返す(マイページ用)", () => {
    const comments = [
      c({ id: "1", clip_id: "clip1", user_id: "other", mention_user_ids: ["me"], created_at: "2020-01-01" }),
      c({ id: "unrelated", clip_id: "clip2", user_id: "other", created_at: "2020-01-01" }),
    ];
    expect(receivedCommentIds(comments, "me")).toEqual(["1"]);
  });
});

describe("unreadClipIds", () => {
  it("未読コメントがあるクリップIDの集合を返す(重複排除)", () => {
    const comments = [
      c({ id: "1", clip_id: "clip1", user_id: "other", mention_user_ids: ["me"], created_at: "2026-01-01" }),
      c({ id: "2", clip_id: "clip1", user_id: "other", mention_user_ids: ["me"], created_at: "2026-01-02" }),
      c({ id: "3", clip_id: "clip2", user_id: "other", mention_user_ids: ["me"], created_at: "2026-01-01" }),
    ];
    expect(unreadClipIds(comments, [], "me")).toEqual(new Set(["clip1", "clip2"]));
  });
});
