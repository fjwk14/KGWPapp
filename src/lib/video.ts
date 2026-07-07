// 動画URL + 開始秒から「該当場面を開く」URLを組み立てる。
// YouTubeはt=秒に対応。その他のURLはメディアフラグメント(#t=)を付ける。

export function formatSeconds(total: number): string {
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

export function buildTimestampUrl(videoUrl: string, startSeconds: number): string {
  try {
    const url = new URL(videoUrl);
    const host = url.hostname.replace(/^www\./, "");
    if (host === "youtube.com" || host === "m.youtube.com") {
      url.searchParams.set("t", `${startSeconds}s`);
      return url.toString();
    }
    if (host === "youtu.be") {
      url.searchParams.set("t", `${startSeconds}`);
      return url.toString();
    }
    url.hash = `t=${startSeconds}`;
    return url.toString();
  } catch {
    return videoUrl;
  }
}
