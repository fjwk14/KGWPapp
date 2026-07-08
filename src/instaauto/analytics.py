"""分析レポートの生成.

アカウントのプロフィールと直近投稿のインサイトを集計し、
Markdown レポートを出力します。
"""

from __future__ import annotations

from datetime import datetime
from pathlib import Path
from typing import Any

from .graph_api import GraphAPIError, InstagramClient

# 投稿単位で取得するインサイト指標（メディア種別で使えるものが異なる）
MEDIA_METRICS = ["reach", "likes", "comments", "saved", "shares"]


def collect_report(client: InstagramClient, media_limit: int = 12) -> dict[str, Any]:
    """レポート用データを収集."""
    profile = client.account_profile()
    media = client.recent_media(limit=media_limit)

    enriched: list[dict[str, Any]] = []
    for m in media:
        row = {
            "id": m.get("id"),
            "type": m.get("media_type"),
            "permalink": m.get("permalink"),
            "timestamp": m.get("timestamp"),
            "caption": (m.get("caption") or "").splitlines()[0][:40],
            "likes": m.get("like_count", 0),
            "comments": m.get("comments_count", 0),
        }
        try:
            insights = client.media_insights(m["id"], MEDIA_METRICS)
            for metric in insights.get("data", []):
                values = metric.get("values", [{}])
                row[metric["name"]] = values[0].get("value", 0)
        except GraphAPIError:
            # 一部の指標は種別により未対応。取得できた分だけ使う
            pass
        enriched.append(row)

    return {"profile": profile, "media": enriched, "generated_at": datetime.now()}


def render_markdown(report: dict[str, Any]) -> str:
    """収集済みデータを Markdown 文字列に整形."""
    p = report["profile"]
    ts = report["generated_at"].strftime("%Y-%m-%d %H:%M")
    media = report["media"]

    lines = [
        f"# Instagram 運用レポート（{p.get('username', 'アカウント')}）",
        "",
        f"生成日時: {ts}",
        "",
        "## アカウント概況",
        "",
        f"- フォロワー数: **{p.get('followers_count', 0):,}**",
        f"- フォロー数: {p.get('follows_count', 0):,}",
        f"- 投稿数: {p.get('media_count', 0):,}",
        "",
        "## 直近投稿のパフォーマンス",
        "",
        "| 投稿 | 種別 | リーチ | いいね | コメント | 保存 | シェア |",
        "| --- | --- | ---: | ---: | ---: | ---: | ---: |",
    ]
    total_reach = total_likes = 0
    for m in media:
        reach = m.get("reach", 0) or 0
        # "likes" はインサイト由来、"like_count" は recent_media 由来
        likes = m.get("likes") or m.get("like_count") or 0
        total_reach += reach
        total_likes += likes
        title = (m.get("caption") or m.get("id") or "-").replace("|", "／")
        lines.append(
            f"| {title} | {m.get('type', '-')} | {reach:,} | {likes:,} "
            f"| {m.get('comments', 0):,} | {m.get('saved', 0) or 0:,} "
            f"| {m.get('shares', 0) or 0:,} |"
        )

    count = max(len(media), 1)
    lines += [
        "",
        "## サマリー",
        "",
        f"- 集計対象: 直近 {len(media)} 投稿",
        f"- 合計リーチ: {total_reach:,}",
        f"- 平均いいね: {total_likes / count:.1f}",
        "",
    ]
    return "\n".join(lines)


def write_report(client: InstagramClient, out_dir: str | Path, media_limit: int = 12) -> str:
    """レポートを生成してファイルに保存し、パスを返す."""
    report = collect_report(client, media_limit=media_limit)
    md = render_markdown(report)
    out = Path(out_dir)
    out.mkdir(parents=True, exist_ok=True)
    stamp = report["generated_at"].strftime("%Y%m%d")
    path = out / f"report-{stamp}.md"
    path.write_text(md, encoding="utf-8")
    return str(path)
