import type { MetadataRoute } from "next";

// ホーム画面に追加した際のPWAマニフェスト。
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "関学水球アプリ",
    short_name: "関学水球",
    description:
      "試合記録・動画クリップ・フィジカル評価・練習出欠をひとつにした水球部のチームアプリ",
    start_url: "/dashboard",
    display: "standalone",
    background_color: "#ffffff",
    theme_color: "#2563eb",
    orientation: "portrait",
    icons: [
      {
        src: "/icon.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/icon.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
  };
}
