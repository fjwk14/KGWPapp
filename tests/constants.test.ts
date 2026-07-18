import { describe, it, expect } from "vitest";
import { positionLabel } from "@/lib/constants";

describe("positionLabel", () => {
  it("GKはis_gk優先で常にGK", () => {
    expect(positionLabel(true, 3, 5)).toBe("GK");
    expect(positionLabel(true, null, null)).toBe("GK");
  });

  it("field_position未設定は未設定表示", () => {
    expect(positionLabel(false, null, null)).toBe("未設定");
  });

  it("primaryのみなら単独表示", () => {
    expect(positionLabel(false, 3, null)).toBe("バック");
  });

  it("secondaryがあれば併記する", () => {
    expect(positionLabel(false, 3, 5)).toBe("バック / 左0度");
  });

  it("secondaryが不正値(範囲外)なら無視する", () => {
    expect(positionLabel(false, 1, 99)).toBe("右0度");
  });
});
