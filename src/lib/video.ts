// 動画URL + 開始秒から「該当場面を開く」URLを組み立てる。
// YouTubeはt=秒に対応。その他のURLはメディアフラグメント(#t=)を付ける。

export function formatSeconds(total: number): string {
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  if (h > 0) {
    return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  }
  return `${m}:${String(s).padStart(2, "0")}`;
}

// hrefとして安全に使えるURLのみ返す(それ以外はnull)
export function safeHttpUrl(url: string | null | undefined): string | null {
  if (!url) return null;
  return /^https?:\/\//i.test(url) ? url : null;
}

export function buildTimestampUrl(videoUrl: string, startSeconds: number): string {
  try {
    const url = new URL(videoUrl);
    // javascript:/data:等の危険スキームはリンク化しない(XSS防止)
    if (url.protocol !== "http:" && url.protocol !== "https:") {
      return "#";
    }
    const host = url.hostname.replace(/^www\./, "");
    if (host === "youtube.com" || host === "m.youtube.com") {
      // 埋め込みURLはstart=、通常のwatch/live/shortsはt=を使う
      if (url.pathname.startsWith("/embed/")) {
        url.searchParams.set("start", `${startSeconds}`);
      } else {
        url.searchParams.set("t", `${startSeconds}s`);
      }
      return url.toString();
    }
    if (host === "youtu.be") {
      url.searchParams.set("t", `${startSeconds}`);
      return url.toString();
    }
    url.hash = `t=${startSeconds}`;
    return url.toString();
  } catch {
    return "#";
  }
}
