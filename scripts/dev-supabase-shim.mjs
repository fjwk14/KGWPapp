// =============================================================
// ローカル開発用のSupabase互換シムサーバー(Auth + REST)。
// Docker(supabase start)が使えない環境で、実PostgreSQL +
// RLSに対してアプリをE2E実行するためのもの。本番では不使用。
//
//   DATABASE_URL=postgres://postgres:postgres@localhost:5432/kgtv \
//   node scripts/dev-supabase-shim.mjs
//
// エミュレート対象(このアプリが使う範囲のみ):
//   POST /auth/v1/signup, /auth/v1/token?grant_type=password,
//   GET  /auth/v1/user, POST /auth/v1/logout
//   GET/POST/PATCH/DELETE /rest/v1/:table (eq/in/order/limit,
//   users(...)埋め込み, single/maybeSingle), POST /rest/v1/rpc/:fn
// =============================================================

import { createServer } from "node:http";
import { createHmac, randomUUID, timingSafeEqual } from "node:crypto";
import pg from "pg";

const PORT = Number(process.env.SHIM_PORT ?? 54321);
const JWT_SECRET =
  process.env.SHIM_JWT_SECRET ??
  "super-secret-jwt-token-with-at-least-32-characters";
const DATABASE_URL =
  process.env.DATABASE_URL ?? "postgres://postgres:postgres@localhost:5432/kgtv";

// DATE型はPostgREST同様に "YYYY-MM-DD" 文字列のまま返す
pg.types.setTypeParser(1082, (v) => v);

const pool = new pg.Pool({ connectionString: DATABASE_URL, max: 10 });

// ---------- JWT (HS256) ----------
const b64url = (buf) =>
  Buffer.from(buf).toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");

function signJwt(payload) {
  const header = b64url(JSON.stringify({ alg: "HS256", typ: "JWT" }));
  const body = b64url(JSON.stringify(payload));
  const sig = b64url(
    createHmac("sha256", JWT_SECRET).update(`${header}.${body}`).digest()
  );
  return `${header}.${body}.${sig}`;
}

function verifyJwt(token) {
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  const expected = createHmac("sha256", JWT_SECRET)
    .update(`${parts[0]}.${parts[1]}`)
    .digest();
  const given = Buffer.from(parts[2].replace(/-/g, "+").replace(/_/g, "/"), "base64");
  if (expected.length !== given.length || !timingSafeEqual(expected, given)) return null;
  const payload = JSON.parse(Buffer.from(parts[1], "base64").toString());
  if (payload.exp && payload.exp < Date.now() / 1000) return null;
  return payload;
}

export const anonKey = signJwt({ role: "anon", iss: "shim", exp: 2000000000 });

// ---------- Auth helpers ----------
async function fetchAuthUser(id) {
  const { rows } = await pool.query(
    "select id, email, raw_user_meta_data, created_at, updated_at from auth.users where id = $1",
    [id]
  );
  if (!rows[0]) return null;
  const u = rows[0];
  return {
    id: u.id,
    aud: "authenticated",
    role: "authenticated",
    email: u.email,
    email_confirmed_at: u.created_at,
    app_metadata: { provider: "email", providers: ["email"] },
    user_metadata: u.raw_user_meta_data ?? {},
    created_at: u.created_at,
    updated_at: u.updated_at,
  };
}

function makeSession(user) {
  const expiresIn = 60 * 60 * 24;
  const accessToken = signJwt({
    sub: user.id,
    role: "authenticated",
    aud: "authenticated",
    email: user.email,
    exp: Math.floor(Date.now() / 1000) + expiresIn,
  });
  return {
    access_token: accessToken,
    token_type: "bearer",
    expires_in: expiresIn,
    expires_at: Math.floor(Date.now() / 1000) + expiresIn,
    refresh_token: randomUUID(),
    user,
  };
}

// ---------- PostgREST helpers ----------
const RESERVED_PARAMS = new Set(["select", "order", "limit", "offset", "on_conflict", "columns"]);
const IDENT = /^[a-z_][a-z0-9_]*$/;

function parseFilters(searchParams) {
  const where = [];
  const values = [];
  for (const [key, raw] of searchParams.entries()) {
    if (RESERVED_PARAMS.has(key)) continue;
    if (!IDENT.test(key)) throw new Error(`bad column: ${key}`);
    if (raw.startsWith("eq.")) {
      values.push(raw.slice(3));
      where.push(`"${key}" = $${values.length}`);
    } else if (raw.startsWith("in.(")) {
      const items = raw.slice(4, -1).split(",").map((s) => decodeURIComponent(s.replace(/^"|"$/g, "")));
      values.push(items);
      where.push(`"${key}" = any($${values.length})`);
    } else if (raw.startsWith("is.null")) {
      where.push(`"${key}" is null`);
    } else {
      throw new Error(`unsupported filter: ${key}=${raw}`);
    }
  }
  return { where, values };
}

function parseOrder(searchParams) {
  const order = searchParams.get("order");
  if (!order) return "";
  const parts = order.split(",").map((seg) => {
    const bits = seg.split(".");
    const col = bits[0];
    if (!IDENT.test(col)) throw new Error(`bad order column: ${col}`);
    const dir = bits.includes("desc") ? "desc" : "asc";
    const nulls = bits.includes("nullslast")
      ? "nulls last"
      : bits.includes("nullsfirst")
        ? "nulls first"
        : "";
    return `"${col}" ${dir} ${nulls}`.trim();
  });
  return `order by ${parts.join(", ")}`;
}

// select句から埋め込み(users(...)等)を抽出
function parseEmbeds(selectParam) {
  const embeds = [];
  if (!selectParam) return embeds;
  const re = /(\w+)\(([^)]*)\)/g;
  let m;
  while ((m = re.exec(selectParam))) {
    embeds.push({ table: m[1], cols: m[2].split(",").map((s) => s.trim()).filter(Boolean) });
  }
  return embeds;
}

// RLS適用済みクエリ実行(role + JWTクレームをトランザクション内で設定)
async function withRls(claims, fn) {
  const client = await pool.connect();
  try {
    await client.query("begin");
    const role = claims?.role === "authenticated" ? "authenticated" : "anon";
    await client.query(`set local role ${role}`);
    await client.query(`select set_config('request.jwt.claims', $1, true)`, [
      JSON.stringify(claims ?? { role: "anon" }),
    ]);
    const result = await fn(client);
    await client.query("commit");
    return result;
  } catch (e) {
    await client.query("rollback").catch(() => {});
    throw e;
  } finally {
    client.release();
  }
}

// 埋め込みの解決(user_id -> usersのみ対応。RLSを通すため同一クライアントで実行)
async function resolveEmbeds(client, rows, embeds) {
  for (const embed of embeds) {
    if (embed.table !== "users") throw new Error(`unsupported embed: ${embed.table}`);
    const ids = [...new Set(rows.map((r) => r.user_id).filter(Boolean))];
    let usersById = new Map();
    if (ids.length > 0) {
      const cols = embed.cols.length && !embed.cols.includes("*")
        ? [...new Set(["id", ...embed.cols])]
        : ["id", "email", "name", "avatar_url"];
      const { rows: users } = await client.query(
        `select ${cols.map((c) => `"${c}"`).join(", ")} from public.users where id = any($1)`,
        [ids]
      );
      usersById = new Map(users.map((u) => [u.id, u]));
    }
    for (const row of rows) {
      const user = usersById.get(row.user_id) ?? null;
      row.users = user
        ? Object.fromEntries(Object.entries(user).filter(([k]) => embed.cols.length === 0 || embed.cols.includes(k) || k === "id" ? true : false))
        : null;
      if (row.users && embed.cols.length > 0 && !embed.cols.includes("id")) {
        // 明示されていないidは応答から除く(実PostgRESTに合わせる)
        const { id: _id, ...rest } = row.users;
        row.users = rest;
      }
    }
  }
  return rows;
}

function pgErrorResponse(res, e) {
  const status = e.code === "42501" ? 403 : e.code === "23505" ? 409 : 400;
  sendJson(res, status, {
    code: e.code ?? "PGRST000",
    message: e.message,
    details: e.detail ?? null,
    hint: e.hint ?? null,
  });
}

// INSERT/UPDATEボディの値をpgパラメータへ変換。
// 配列・オブジェクトはJSONB列向けにJSON文字列化する(node-pgの
// デフォルトはPostgres配列リテラル化のためjsonb列で構文エラーになる)
function toPgParam(value) {
  if (value === undefined) return null;
  if (value !== null && typeof value === "object") return JSON.stringify(value);
  return value;
}

function sendJson(res, status, body) {
  const data = JSON.stringify(body);
  res.writeHead(status, {
    "content-type": "application/json",
    "content-length": Buffer.byteLength(data),
  });
  res.end(data);
}

async function readBody(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  const raw = Buffer.concat(chunks).toString();
  return raw ? JSON.parse(raw) : null;
}

// ---------- HTTP server ----------
const server = createServer(async (req, res) => {
  const url = new URL(req.url, `http://localhost:${PORT}`);
  const auth = req.headers.authorization?.replace(/^Bearer\s+/i, "");
  const claims = auth ? verifyJwt(auth) : null;

  try {
    // ----- Auth endpoints -----
    if (url.pathname === "/auth/v1/signup" && req.method === "POST") {
      const body = await readBody(req);
      const email = String(body.email ?? "").toLowerCase();
      const id = randomUUID();
      try {
        await pool.query(
          `insert into auth.users (id, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data)
           values ($1, $2, crypt($3, gen_salt('bf')), now(), '{"provider":"email","providers":["email"]}', $4)`,
          [id, email, body.password, JSON.stringify(body.data ?? {})]
        );
      } catch (e) {
        if (e.code === "23505") {
          return sendJson(res, 422, { code: 422, msg: "User already registered" });
        }
        throw e;
      }
      const user = await fetchAuthUser(id);
      return sendJson(res, 200, makeSession(user));
    }

    if (url.pathname === "/auth/v1/token" && req.method === "POST") {
      const grant = url.searchParams.get("grant_type");
      const body = await readBody(req);
      if (grant === "password") {
        const { rows } = await pool.query(
          `select id from auth.users where lower(email) = lower($1) and encrypted_password = crypt($2, encrypted_password)`,
          [body.email, body.password]
        );
        if (!rows[0]) {
          return sendJson(res, 400, {
            code: 400,
            error_code: "invalid_credentials",
            msg: "Invalid login credentials",
          });
        }
        const user = await fetchAuthUser(rows[0].id);
        return sendJson(res, 200, makeSession(user));
      }
      if (grant === "refresh_token") {
        return sendJson(res, 400, { code: 400, msg: "refresh not supported in shim" });
      }
      return sendJson(res, 400, { code: 400, msg: `unsupported grant: ${grant}` });
    }

    if (url.pathname === "/auth/v1/user" && req.method === "GET") {
      if (!claims?.sub) return sendJson(res, 401, { code: 401, msg: "invalid token" });
      const user = await fetchAuthUser(claims.sub);
      if (!user) return sendJson(res, 401, { code: 401, msg: "user not found" });
      return sendJson(res, 200, user);
    }

    if (url.pathname === "/auth/v1/logout" && req.method === "POST") {
      res.writeHead(204);
      return res.end();
    }

    // ----- REST: RPC -----
    const rpcMatch = url.pathname.match(/^\/rest\/v1\/rpc\/(\w+)$/);
    if (rpcMatch && req.method === "POST") {
      const fn = rpcMatch[1];
      if (!IDENT.test(fn)) return sendJson(res, 400, { message: "bad rpc" });
      const args = (await readBody(req)) ?? {};
      const keys = Object.keys(args);
      try {
        const result = await withRls(claims, (client) =>
          client.query(
            `select public."${fn}"(${keys.map((k, i) => `"${k}" := $${i + 1}`).join(", ")}) as result`,
            keys.map((k) => args[k])
          )
        );
        return sendJson(res, 200, result.rows[0]?.result ?? null);
      } catch (e) {
        return pgErrorResponse(res, e);
      }
    }

    // ----- REST: tables -----
    const tableMatch = url.pathname.match(/^\/rest\/v1\/(\w+)$/);
    if (tableMatch) {
      const table = tableMatch[1];
      if (!IDENT.test(table)) return sendJson(res, 400, { message: "bad table" });
      const { where, values } = parseFilters(url.searchParams);
      const whereSql = where.length ? `where ${where.join(" and ")}` : "";
      const embeds = parseEmbeds(url.searchParams.get("select"));
      const wantsObject = (req.headers.accept ?? "").includes("vnd.pgrst.object");
      const prefer = req.headers.prefer ?? "";
      const wantsRepresentation = prefer.includes("return=representation");

      try {
        let rows;
        if (req.method === "GET") {
          const orderSql = parseOrder(url.searchParams);
          const limit = url.searchParams.get("limit");
          const limitSql = limit ? `limit ${Number(limit)}` : "";
          rows = await withRls(claims, async (client) => {
            const { rows } = await client.query(
              `select * from public."${table}" ${whereSql} ${orderSql} ${limitSql}`,
              values
            );
            return resolveEmbeds(client, rows, embeds);
          });
        } else if (req.method === "POST") {
          const body = await readBody(req);
          const items = Array.isArray(body) ? body : [body];
          if (items.length === 0) return sendJson(res, 201, []);
          const cols = Object.keys(items[0]);
          const params = [];
          const tuples = items.map((item) => {
            const ph = cols.map((c) => {
              params.push(toPgParam(item[c]));
              return `$${params.length}`;
            });
            return `(${ph.join(", ")})`;
          });
          // RETURNINGはSELECTポリシーの対象になるため、実PostgREST同様に
          // representation要求時のみ付ける(例: AFTERトリガーで membership を
          // 作るteams insertは、RETURNINGがあると可視性チェックで落ちる)
          const returning = wantsRepresentation || wantsObject ? "returning *" : "";
          rows = await withRls(claims, async (client) => {
            const { rows } = await client.query(
              `insert into public."${table}" (${cols.map((c) => `"${c}"`).join(", ")})
               values ${tuples.join(", ")} ${returning}`,
              params
            );
            return resolveEmbeds(client, rows, embeds);
          });
          if (!wantsRepresentation && !wantsObject) {
            res.writeHead(201);
            return res.end();
          }
        } else if (req.method === "PATCH") {
          const body = await readBody(req);
          const cols = Object.keys(body);
          const setParams = [...values];
          const setSql = cols
            .map((c) => {
              setParams.push(toPgParam(body[c]));
              return `"${c}" = $${setParams.length}`;
            })
            .join(", ");
          rows = await withRls(claims, async (client) => {
            const { rows } = await client.query(
              `update public."${table}" set ${setSql} ${whereSql} returning *`,
              setParams
            );
            return resolveEmbeds(client, rows, embeds);
          });
          if (!wantsRepresentation) {
            res.writeHead(204);
            return res.end();
          }
        } else if (req.method === "DELETE") {
          rows = await withRls(claims, async (client) => {
            const { rows } = await client.query(
              `delete from public."${table}" ${whereSql} returning *`,
              values
            );
            return rows;
          });
          if (!wantsRepresentation) {
            res.writeHead(204);
            return res.end();
          }
        } else {
          return sendJson(res, 405, { message: "method not allowed" });
        }

        if (wantsObject) {
          if (rows.length === 0) {
            return sendJson(res, 406, {
              code: "PGRST116",
              message: "JSON object requested, multiple (or no) rows returned",
              details: "The result contains 0 rows",
              hint: null,
            });
          }
          return sendJson(res, req.method === "POST" ? 201 : 200, rows[0]);
        }
        return sendJson(res, req.method === "POST" ? 201 : 200, rows);
      } catch (e) {
        return pgErrorResponse(res, e);
      }
    }

    sendJson(res, 404, { message: `not found: ${req.method} ${url.pathname}` });
  } catch (e) {
    console.error(e);
    sendJson(res, 500, { message: e.message });
  }
});

server.listen(PORT, () => {
  console.log(`[shim] Supabase-compatible dev server on http://127.0.0.1:${PORT}`);
  console.log(`[shim] NEXT_PUBLIC_SUPABASE_ANON_KEY=${anonKey}`);
});
