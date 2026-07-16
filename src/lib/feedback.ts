// 練習後ピアフィードバックのペア決め(純関数)。
//
// practice_id をシードにした決定的シャッフルで参加者の「円環」を作り、
// 各メンバーは円環の次の人へFBを送る。これにより:
//   - 全員がちょうど1回送り、ちょうど1回受け取る
//   - 自分自身には当たらない(参加者2人以上のとき)
//   - 誰がどの端末・どのタイミングで開いても同じ相手が表示される
//   - 学年・役職・ポジションに関係なくランダムに混ざる(縦横のつながり)

function hashSeed(key: string): number {
  // FNV-1a 32bit
  let h = 0x811c9dc5;
  for (let i = 0; i < key.length; i++) {
    h ^= key.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

function mulberry32(seed: number): () => number {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export interface FeedbackPair {
  from: string;
  to: string;
}

// 参加者(userId配列)から決定的なFBペアの円環を作る。
// 2人未満ならペアは作れない(空配列)。
export function buildFeedbackPairs(
  seedKey: string,
  userIds: string[]
): FeedbackPair[] {
  const ids = [...new Set(userIds)].sort();
  if (ids.length < 2) return [];
  const rand = mulberry32(hashSeed(seedKey));
  // Fisher-Yates
  for (let i = ids.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [ids[i], ids[j]] = [ids[j], ids[i]];
  }
  return ids.map((from, i) => ({ from, to: ids[(i + 1) % ids.length] }));
}

// 指定ユーザーのFB相手を返す(参加していなければnull)
export function feedbackTargetOf(
  seedKey: string,
  userIds: string[],
  userId: string
): string | null {
  return (
    buildFeedbackPairs(seedKey, userIds).find((p) => p.from === userId)?.to ??
    null
  );
}
