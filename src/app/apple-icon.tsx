import { ImageResponse } from "next/og";

// iOSのホーム画面追加アイコン(角丸はOS側で自動適用されるため四角のまま)
export const size = { width: 180, height: 180 };
export const contentType = "image/png";

export default function AppleIcon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "#2563eb",
        }}
      >
        <span style={{ fontSize: 110 }}>🤽</span>
      </div>
    ),
    { ...size }
  );
}
