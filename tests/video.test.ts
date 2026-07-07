import { describe, expect, it } from "vitest";
import { buildTimestampUrl, formatSeconds } from "@/lib/video";

describe("formatSeconds", () => {
  it("秒を m:ss 形式にする", () => {
    expect(formatSeconds(0)).toBe("0:00");
    expect(formatSeconds(65)).toBe("1:05");
    expect(formatSeconds(615)).toBe("10:15");
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

  it("その他のURLはメディアフラグメントを付ける", () => {
    expect(buildTimestampUrl("https://example.com/video.mp4", 30)).toBe(
      "https://example.com/video.mp4#t=30"
    );
  });

  it("不正なURLはそのまま返す", () => {
    expect(buildTimestampUrl("not-a-url", 30)).toBe("not-a-url");
  });
});
