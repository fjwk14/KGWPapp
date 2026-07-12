import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Client } from "pg";

// 実PostgreSQLに対するRLS権限の統合テスト。
// 実行には migrations + seed + scripts/local-supabase-shim.sql 適用済みの
// DBが必要(README参照)。DATABASE_URL未設定時はスキップされる。
//
//   DATABASE_URL=postgres://postgres:postgres@localhost:5432/kgtv npm test

const DATABASE_URL = process.env.DATABASE_URL;

const TEAM_A = "aaaaaaaa-0000-0000-0000-000000000001";
const MATCH_A = "bbbbbbbb-0000-0000-0000-000000000001";
const CLIP_A = "cccccccc-0000-0000-0000-000000000001";
const ADMIN = "11111111-1111-1111-1111-111111111111";
const STAFF = "22222222-2222-2222-2222-222222222222";
const CAPTAIN = "33333333-3333-3333-3333-333333333333";
const PLAYER = "44444444-4444-4444-4444-444444444444";
// テスト内で作成する部外者(チームB所属)
const OUTSIDER = "55555555-5555-5555-5555-555555555555";
const TEAM_B = "aaaaaaaa-0000-0000-0000-000000000002";

describe.skipIf(!DATABASE_URL)("RLS統合テスト(実PostgreSQL)", () => {
  let db: Client;

  beforeAll(async () => {
    db = new Client({ connectionString: DATABASE_URL });
    await db.connect();
    // 部外者ユーザーとチームBをスーパーユーザーとして用意
    await db.query(`
      insert into auth.users (id, email, raw_user_meta_data)
      values ('${OUTSIDER}', 'outsider@example.com', '{"name":"部外者"}')
      on conflict (id) do nothing`);
    await db.query(`
      insert into public.users (id, email, name)
      values ('${OUTSIDER}', 'outsider@example.com', '部外者')
      on conflict (id) do nothing`);
    await db.query(`
      insert into public.teams (id, name, slug)
      values ('${TEAM_B}', '別チーム', 'other-team')
      on conflict (id) do nothing`);
    await db.query(`
      insert into public.memberships (team_id, user_id, role, status)
      values ('${TEAM_B}', '${OUTSIDER}', 'admin', 'active')
      on conflict (team_id, user_id) do nothing`);
  });

  afterAll(async () => {
    await db?.end();
  });

  // 指定ユーザーのJWTクレームでSQLを実行(トランザクション内・自動ロールバック)
  async function asUser<T>(
    userId: string | null,
    fn: (q: (sql: string, params?: unknown[]) => Promise<{ rows: Record<string, unknown>[]; rowCount: number | null }>) => Promise<T>
  ): Promise<T> {
    await db.query("begin");
    try {
      if (userId) {
        await db.query("set local role authenticated");
        await db.query(
          `select set_config('request.jwt.claims', $1, true)`,
          [JSON.stringify({ sub: userId, role: "authenticated" })]
        );
      } else {
        await db.query("set local role anon");
      }
      return await fn((sql, params) => db.query(sql, params as never));
    } finally {
      await db.query("rollback");
    }
  }

  describe("team_idによるデータ分離", () => {
    it("チームメンバーは自チームの試合を閲覧できる", async () => {
      await asUser(PLAYER, async (q) => {
        const { rows } = await q("select id from matches");
        expect(rows.map((r) => r.id)).toContain(MATCH_A);
      });
    });

    it("部外者には他チームの試合・クリップ・タグ・コメントが一切見えない", async () => {
      await asUser(OUTSIDER, async (q) => {
        expect((await q("select id from matches where team_id = $1", [TEAM_A])).rowCount).toBe(0);
        expect((await q("select id from video_clips where team_id = $1", [TEAM_A])).rowCount).toBe(0);
        expect((await q("select id from clip_tags where team_id = $1", [TEAM_A])).rowCount).toBe(0);
        expect((await q("select id from clip_comments where team_id = $1", [TEAM_A])).rowCount).toBe(0);
        expect((await q("select id from tag_templates where team_id = $1", [TEAM_A])).rowCount).toBe(0);
      });
    });

    it("未ログイン(anon)には何も見えない", async () => {
      await asUser(null, async (q) => {
        expect((await q("select id from matches")).rowCount).toBe(0);
        expect((await q("select id from teams")).rowCount).toBe(0);
      });
    });

    it("部外者は他チームの試合を更新できない(0行)", async () => {
      await asUser(OUTSIDER, async (q) => {
        const res = await q("update matches set title = '乗っ取り' where id = $1", [MATCH_A]);
        expect(res.rowCount).toBe(0);
      });
    });
  });

  describe("ロール別権限", () => {
    it("playerは試合を登録できない", async () => {
      await asUser(PLAYER, async (q) => {
        await expect(
          q(
            "insert into matches (team_id, title, created_by) values ($1, 'player試合', $2)",
            [TEAM_A, PLAYER]
          )
        ).rejects.toThrow(/row-level security/);
      });
    });

    it("tactical_staffは試合を登録できる", async () => {
      await asUser(STAFF, async (q) => {
        const res = await q(
          "insert into matches (team_id, title, created_by) values ($1, 'staff試合', $2) returning id",
          [TEAM_A, STAFF]
        );
        expect(res.rowCount).toBe(1);
      });
    });

    it("managerは戦術班と同等に試合を登録できる", async () => {
      // TEAM_Aにmanagerロールのユーザーを用意
      await db.query(`
        insert into auth.users (id, email, raw_user_meta_data)
        values ('66666666-6666-6666-6666-666666666666', 'manager@example.com', '{"name":"マネージャー"}')
        on conflict (id) do nothing`);
      await db.query(`
        insert into public.users (id, email, name)
        values ('66666666-6666-6666-6666-666666666666', 'manager@example.com', 'マネージャー')
        on conflict (id) do nothing`);
      await db.query(`
        insert into public.memberships (team_id, user_id, role, status)
        values ('${TEAM_A}', '66666666-6666-6666-6666-666666666666', 'manager', 'active')
        on conflict (team_id, user_id) do update set role = 'manager', status = 'active'`);

      await asUser("66666666-6666-6666-6666-666666666666", async (q) => {
        const res = await q(
          "insert into matches (team_id, title, created_by) values ($1, 'manager試合', $2) returning id",
          [TEAM_A, "66666666-6666-6666-6666-666666666666"]
        );
        expect(res.rowCount).toBe(1);
      });
    });

    it("created_byの偽装(他人名義での登録)はできない", async () => {
      await asUser(STAFF, async (q) => {
        await expect(
          q(
            "insert into matches (team_id, title, created_by) values ($1, '偽装', $2)",
            [TEAM_A, PLAYER]
          )
        ).rejects.toThrow(/row-level security/);
      });
    });

    it("playerはタグを付けられないが、staffは付けられる", async () => {
      await asUser(PLAYER, async (q) => {
        await expect(
          q(
            "insert into clip_tags (team_id, clip_id, tag_type, tag_value, created_by) values ($1, $2, 'action', 'シュート', $3)",
            [TEAM_A, CLIP_A, PLAYER]
          )
        ).rejects.toThrow(/row-level security/);
      });
      await asUser(STAFF, async (q) => {
        const res = await q(
          "insert into clip_tags (team_id, clip_id, tag_type, tag_value, created_by) values ($1, $2, 'action', 'センター起点', $3) returning id",
          [TEAM_A, CLIP_A, STAFF]
        );
        expect(res.rowCount).toBe(1);
      });
    });

    it("playerでもコメントは投稿できる", async () => {
      await asUser(PLAYER, async (q) => {
        const res = await q(
          "insert into clip_comments (team_id, clip_id, user_id, comment) values ($1, $2, $3, 'テストコメント') returning id",
          [TEAM_A, CLIP_A, PLAYER]
        );
        expect(res.rowCount).toBe(1);
      });
    });

    it("他人のコメントは削除できない(本人のみ)", async () => {
      await asUser(STAFF, async (q) => {
        // seedでcaptainが書いたコメントをstaffが消そうとする → 0行
        const res = await q(
          "delete from clip_comments where user_id = $1",
          [CAPTAIN]
        );
        expect(res.rowCount).toBe(0);
      });
    });

    it("レポート編集はstaff不可・captain可", async () => {
      // レポートをadmin権限(スーパーユーザー)で用意
      await db.query(`
        insert into tactical_reports (id, team_id, match_id, title, generated_by)
        values ('dddddddd-0000-0000-0000-000000000001', '${TEAM_A}', '${MATCH_A}', 'テストレポート', '${STAFF}')
        on conflict (id) do nothing`);

      await asUser(STAFF, async (q) => {
        const res = await q(
          "update tactical_reports set summary = 'staff編集' where match_id = $1",
          [MATCH_A]
        );
        expect(res.rowCount).toBe(0);
      });
      await asUser(CAPTAIN, async (q) => {
        const res = await q(
          "update tactical_reports set summary = 'captain編集' where match_id = $1",
          [MATCH_A]
        );
        expect(res.rowCount).toBe(1);
      });
    });

    it("メンバー管理(role変更)はadminのみ", async () => {
      await asUser(PLAYER, async (q) => {
        const res = await q(
          "update memberships set role = 'admin' where user_id = $1",
          [PLAYER]
        );
        expect(res.rowCount).toBe(0); // 自己昇格は不可
      });
      await asUser(ADMIN, async (q) => {
        const res = await q(
          "update memberships set role = 'tactical_staff' where user_id = $1 and team_id = $2",
          [PLAYER, TEAM_A]
        );
        expect(res.rowCount).toBe(1);
      });
    });

    it("チームAのadminは他チームのmembershipを変更できない", async () => {
      await asUser(ADMIN, async (q) => {
        const res = await q(
          "update memberships set role = 'player' where team_id = $1",
          [TEAM_B]
        );
        expect(res.rowCount).toBe(0);
      });
    });

    it("タグテンプレート管理はadminのみ", async () => {
      await asUser(STAFF, async (q) => {
        await expect(
          q(
            "insert into tag_templates (team_id, tag_type, tag_value) values ($1, 'tactic', 'プレス')",
            [TEAM_A]
          )
        ).rejects.toThrow(/row-level security/);
      });
      await asUser(ADMIN, async (q) => {
        const res = await q(
          "insert into tag_templates (team_id, tag_type, tag_value) values ($1, 'tactic', 'プレス') returning id",
          [TEAM_A]
        );
        expect(res.rowCount).toBe(1);
      });
    });
  });

  describe("スタッツ(stats_events / match_rosters)", () => {
    const MANAGER = "66666666-6666-6666-6666-666666666666";

    beforeAll(async () => {
      // マネージャーをTEAM_Aに用意(既存テストと共用)
      await db.query(`
        insert into auth.users (id, email, raw_user_meta_data)
        values ('${MANAGER}', 'manager@example.com', '{"name":"マネージャー"}')
        on conflict (id) do nothing`);
      await db.query(`
        insert into public.users (id, email, name)
        values ('${MANAGER}', 'manager@example.com', 'マネージャー')
        on conflict (id) do nothing`);
      await db.query(`
        insert into public.memberships (team_id, user_id, role, status)
        values ('${TEAM_A}', '${MANAGER}', 'manager', 'active')
        on conflict (team_id, user_id) do update set role = 'manager', status = 'active'`);
    });

    it("マネージャーはスタッツイベントを記録できる", async () => {
      await asUser(MANAGER, async (q) => {
        const res = await q(
          `insert into stats_events (team_id, match_id, quarter, player_id, type, subtype, result)
           values ($1, $2, 1, $3, 'shot', 'center', 'goal') returning id, team_id`,
          [TEAM_A, MATCH_A, PLAYER]
        );
        expect(res.rowCount).toBe(1);
      });
    });

    it("選手・戦術班はスタッツを記録できない(閲覧は可)", async () => {
      for (const uid of [PLAYER, STAFF]) {
        await asUser(uid, async (q) => {
          await expect(
            q(
              `insert into stats_events (team_id, match_id, quarter, player_id, type)
               values ($1, $2, 1, $3, 'assist')`,
              [TEAM_A, MATCH_A, PLAYER]
            )
          ).rejects.toThrow(/row-level security/);
        });
        // 閲覧はできる(別トランザクションで確認)
        await asUser(uid, async (q) => {
          await q("select id from stats_events where match_id = $1", [MATCH_A]);
        });
      }
    });

    it("部外者には他チームのスタッツが見えない", async () => {
      await db.query(`
        insert into public.stats_events (team_id, match_id, quarter, player_id, type)
        values ('${TEAM_A}', '${MATCH_A}', 1, '${PLAYER}', 'cut')`);
      await asUser(OUTSIDER, async (q) => {
        expect(
          (await q("select id from stats_events where team_id = $1", [TEAM_A])).rowCount
        ).toBe(0);
      });
    });

    it("CHECK制約: 不正なsubtypeは拒否", async () => {
      await asUser(MANAGER, async (q) => {
        await expect(
          q(
            `insert into stats_events (team_id, match_id, quarter, player_id, type, subtype, result)
             values ($1, $2, 1, $3, 'shot', 'invalid', 'goal')`,
            [TEAM_A, MATCH_A, PLAYER]
          )
        ).rejects.toThrow(/check constraint/);
      });
    });

    it("CHECK制約: チームイベントへのplayer_id指定は拒否", async () => {
      await asUser(MANAGER, async (q) => {
        await expect(
          q(
            `insert into stats_events (team_id, match_id, quarter, player_id, type)
             values ($1, $2, 1, $3, 'opponent_goal')`,
            [TEAM_A, MATCH_A, PLAYER]
          )
        ).rejects.toThrow(/check constraint/);
      });
    });

    it("team_id偽装はトリガーで矯正される", async () => {
      await asUser(MANAGER, async (q) => {
        const res = await q(
          `insert into stats_events (team_id, match_id, quarter, player_id, type)
           values ($1, $2, 1, $3, 'assist') returning team_id`,
          [TEAM_B, MATCH_A, PLAYER]
        );
        expect(res.rows[0]?.team_id).toBe(TEAM_A);
      });
    });

    it("出場メンバー登録はマネージャー可・選手不可", async () => {
      await asUser(MANAGER, async (q) => {
        const res = await q(
          `insert into match_rosters (team_id, match_id, user_id, cap_number, is_gk)
           values ($1, $2, $3, 2, false) returning id`,
          [TEAM_A, MATCH_A, PLAYER]
        );
        expect(res.rowCount).toBe(1);
      });
      await asUser(PLAYER, async (q) => {
        await expect(
          q(
            `insert into match_rosters (team_id, match_id, user_id, cap_number, is_gk)
             values ($1, $2, $3, 3, false)`,
            [TEAM_A, MATCH_A, PLAYER]
          )
        ).rejects.toThrow(/row-level security/);
      });
    });
  });

  describe("RPCと整合性ガード", () => {
    it("add_member_by_emailは非adminには拒否される", async () => {
      await asUser(STAFF, async (q) => {
        await expect(
          q("select add_member_by_email($1, 'outsider@example.com', 'player')", [TEAM_A])
        ).rejects.toThrow(/permission denied/);
      });
    });

    it("add_member_by_emailでadminはメンバーを追加できる", async () => {
      await asUser(ADMIN, async (q) => {
        await q("select add_member_by_email($1, 'outsider@example.com', 'player')", [TEAM_A]);
        const res = await q(
          "select role from memberships where team_id = $1 and user_id = $2",
          [TEAM_A, OUTSIDER]
        );
        expect(res.rows[0]?.role).toBe("player");
      });
    });

    it("seed_default_tag_templatesは一般ユーザーからRPC実行できない", async () => {
      await asUser(OUTSIDER, async (q) => {
        await expect(
          q("select seed_default_tag_templates($1)", [TEAM_A])
        ).rejects.toThrow(/permission denied/);
      });
    });

    it("クリップのteam_id偽装はトリガーで矯正される", async () => {
      await asUser(STAFF, async (q) => {
        // チームBのteam_idを指定してもmatchの所属チームに強制される
        const res = await q(
          `insert into video_clips (team_id, match_id, title, start_time_seconds, end_time_seconds, created_by)
           values ($1, $2, '偽装クリップ', 0, 10, $3) returning team_id`,
          [TEAM_B, MATCH_A, STAFF]
        );
        expect(res.rows[0]?.team_id).toBe(TEAM_A);
      });
    });

    it("start_time_seconds >= end_time_seconds はCHECK制約で拒否される", async () => {
      await asUser(STAFF, async (q) => {
        await expect(
          q(
            `insert into video_clips (team_id, match_id, title, start_time_seconds, end_time_seconds, created_by)
             values ($1, $2, '不正クリップ', 30, 30, $3)`,
            [TEAM_A, MATCH_A, STAFF]
          )
        ).rejects.toThrow(/check constraint/);
      });
    });

    it("users.emailはクライアントから変更できない(なりすまし防止)", async () => {
      await asUser(PLAYER, async (q) => {
        await expect(
          q("update users set email = 'admin@example.com' where id = $1", [PLAYER])
        ).rejects.toThrow(/permission denied/);
      });
    });
  });

  describe("招待コード(join_team_by_code)", () => {
    // チームBに参加していない新規ユーザー
    const NEWBIE = "77777777-7777-7777-7777-777777777777";

    beforeAll(async () => {
      await db.query(`
        insert into auth.users (id, email, raw_user_meta_data)
        values ('${NEWBIE}', 'newbie@example.com', '{"name":"新入部員"}')
        on conflict (id) do nothing`);
      await db.query(`
        insert into public.users (id, email, name)
        values ('${NEWBIE}', 'newbie@example.com', '新入部員')
        on conflict (id) do nothing`);
    });

    it("正しい招待コードで選手として参加できる", async () => {
      const { rows } = await db.query(
        `select invite_code from public.teams where id = $1`,
        [TEAM_A]
      );
      const code = rows[0].invite_code as string;
      await asUser(NEWBIE, async (q) => {
        const res = await q("select join_team_by_code($1) as team_id", [code]);
        expect(res.rows[0].team_id).toBe(TEAM_A);
        const m = await q(
          "select role, status from memberships where team_id = $1 and user_id = $2",
          [TEAM_A, NEWBIE]
        );
        expect(m.rows[0]).toMatchObject({ role: "player", status: "active" });
      });
    });

    it("小文字・前後空白でも参加できる(大文字化とtrim)", async () => {
      const { rows } = await db.query(
        `select invite_code from public.teams where id = $1`,
        [TEAM_A]
      );
      const code = rows[0].invite_code as string;
      await asUser(NEWBIE, async (q) => {
        const res = await q("select join_team_by_code($1) as team_id", [
          `  ${code.toLowerCase()}  `,
        ]);
        expect(res.rows[0].team_id).toBe(TEAM_A);
      });
    });

    it("不正なコードは拒否される", async () => {
      await asUser(NEWBIE, async (q) => {
        await expect(
          q("select join_team_by_code($1)", ["ZZZZZZ"])
        ).rejects.toThrow(/invalid invite code/);
      });
    });

    it("管理者はコードを再発行でき、古いコードは無効になる", async () => {
      await asUser(ADMIN, async (q) => {
        const before = await q(
          "select invite_code from teams where id = $1",
          [TEAM_A]
        );
        const oldCode = before.rows[0].invite_code as string;
        const res = await q("select regenerate_invite_code($1) as code", [TEAM_A]);
        const newCode = res.rows[0].code as string;
        expect(newCode).not.toBe(oldCode);
        const after = await q("select invite_code from teams where id = $1", [
          TEAM_A,
        ]);
        expect(after.rows[0].invite_code).toBe(newCode);
      });
    });

    it("管理者以外はコードを再発行できない", async () => {
      await asUser(PLAYER, async (q) => {
        await expect(
          q("select regenerate_invite_code($1)", [TEAM_A])
        ).rejects.toThrow(/permission denied/);
      });
    });
  });

  describe("試合動画(match_videos)", () => {
    const MANAGER = "66666666-6666-6666-6666-666666666666";

    it("スタッフ・マネージャーは動画を後付けできる", async () => {
      for (const uid of [STAFF, MANAGER]) {
        await asUser(uid, async (q) => {
          const res = await q(
            `insert into match_videos (team_id, match_id, quarter, url, created_by)
             values ($1, $2, 1, 'https://youtube.com/watch?v=rls', $3) returning id`,
            [TEAM_A, MATCH_A, uid]
          );
          expect(res.rowCount).toBe(1);
        });
      }
    });

    it("選手は動画を追加できない(閲覧は可)", async () => {
      await asUser(PLAYER, async (q) => {
        await expect(
          q(
            `insert into match_videos (team_id, match_id, url, created_by)
             values ($1, $2, 'https://youtube.com/watch?v=x', $3)`,
            [TEAM_A, MATCH_A, PLAYER]
          )
        ).rejects.toThrow(/row-level security/);
      });
      await asUser(PLAYER, async (q) => {
        expect(
          (await q("select id from match_videos where match_id = $1", [MATCH_A]))
            .rowCount
        ).toBeGreaterThan(0);
      });
    });

    it("部外者には他チームの動画が見えない", async () => {
      await asUser(OUTSIDER, async (q) => {
        expect(
          (await q("select id from match_videos where team_id = $1", [TEAM_A]))
            .rowCount
        ).toBe(0);
      });
    });

    it("http(s)以外のURLはCHECK制約で拒否される", async () => {
      await asUser(STAFF, async (q) => {
        await expect(
          q(
            `insert into match_videos (team_id, match_id, url, created_by)
             values ($1, $2, 'javascript:alert(1)', $3)`,
            [TEAM_A, MATCH_A, STAFF]
          )
        ).rejects.toThrow(/check constraint/);
      });
    });

    it("team_id偽装はトリガーで矯正される", async () => {
      await asUser(STAFF, async (q) => {
        const res = await q(
          `insert into match_videos (team_id, match_id, url, created_by)
           values ($1, $2, 'https://youtube.com/watch?v=spoof', $3) returning team_id`,
          [TEAM_B, MATCH_A, STAFF]
        );
        expect(res.rows[0]?.team_id).toBe(TEAM_A);
      });
    });

    it("動画を削除するとクリップのvideo_idはNULLになる(クリップは残る)", async () => {
      await asUser(STAFF, async (q) => {
        const video = await q(
          `insert into match_videos (team_id, match_id, quarter, url, created_by)
           values ($1, $2, 2, 'https://youtube.com/watch?v=cascade', $3) returning id`,
          [TEAM_A, MATCH_A, STAFF]
        );
        const clip = await q(
          `insert into video_clips (team_id, match_id, video_id, title, start_time_seconds, end_time_seconds, created_by)
           values ($1, $2, $3, '動画付きクリップ', 5, 15, $4) returning id`,
          [TEAM_A, MATCH_A, video.rows[0].id, STAFF]
        );
        await q("delete from match_videos where id = $1", [video.rows[0].id]);
        const after = await q(
          "select video_id from video_clips where id = $1",
          [clip.rows[0].id]
        );
        expect(after.rowCount).toBe(1);
        expect(after.rows[0].video_id).toBeNull();
      });
    });
  });
});
