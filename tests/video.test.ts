import { describe, expect, it } from "vitest";
import { buildTimestampUrl, formatSeconds, safeHttpUrl } from "@/lib/video";

describe("safeHttpUrl", () => {
  it("http/httpsのみhrefとして許可する", () => {
    expect(safeHttpUrl("https://example.com")).toBe("https://example.com");
    expect(safeHttpUrl("http://example.com")).toBe("http://example.com");
    expect(safeHttpUrl("javascript:alert(1)")).toBeNull();
    expect(safeHttpUrl("data:text/html,x")).toBeNull();
    expect(safeHttpUrl(null)).toBeNull();
    expect(safeHttpUrl("")).toBeNull();
  });
});

describe("formatSeconds", () => {
  it("秒を m:ss 形式にする", () => {
    expect(formatSeconds(0)).toBe("0:00");
    expect(formatSeconds(65)).toBe("1:05");
    expect(formatSeconds(615)).toBe("10:15");
  });

  it("1時間以上は h:mm:ss 形式にする(水球の試合は1時間超)", () => {
    expect(formatSeconds(3600)).toBe("1:00:00");
    expect(formatSeconds(3700)).toBe("1:01:40");
  });
});

describe("buildTimestampUrl", () => {
  it("YouTubeは t=秒s を付ける", () => {
    expect(
      buildTimestampUrl("https://www.youtube.com/watch?v=abc123", 615)
    ).toContain("t=615s");
  });

  it("youtu.be短縮URLに対応する", () => {
    expect(buildTimestampUrl("https://youtu.be/abc123", 90)).toContain("t=90");
  });

  it("埋め込みURLは start= を使う", () => {
    expect(
      buildTimestampUrl("https://www.youtube.com/embed/abc123", 90)
    ).toContain("start=90");
  });

  it("その他のURLはメディアフラグメントを付ける", () => {
    expect(buildTimestampUrl("https://example.com/video.mp4", 30)).toBe(
      "https://example.com/video.mp4#t=30"
    );
  });

  it("不正なURLや危険なスキームはリンク化しない(XSS防止)", () => {
    expect(buildTimestampUrl("not-a-url", 30)).toBe("#");
    expect(buildTimestampUrl("javascript:alert(1)", 30)).toBe("#");
    expect(buildTimestampUrl("data:text/html,x", 30)).toBe("#");
  });
});
