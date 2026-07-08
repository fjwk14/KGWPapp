"""投稿キューの管理と、予約時刻に達した投稿の自動公開.

キューは YAML ファイル（content/queue.yaml）で管理します。各エントリ:

  - id: uniq-001
    scheduled_at: "2026-07-10 09:00"   # ローカル時刻（config の timezone）
    type: reel                          # image | carousel | reel
    media:                              # 公開URL、または PUBLIC_MEDIA_BASE_URL からの相対パス
      - reels/launch.mp4
    caption: "新サービスを公開しました！"  # 省略時は topic から AI 生成
    topic: "新サービス公開のお知らせ"       # caption 省略時のみ使用
    status: pending                      # pending | published | failed
"""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime
from pathlib import Path
from typing import Any

import yaml

from .content_generator import ContentGenerator
from .graph_api import InstagramClient

VALID_TYPES = {"image", "carousel", "reel"}


@dataclass
class QueueItem:
    id: str
    scheduled_at: datetime
    type: str
    media: list[str]
    caption: str = ""
    topic: str = ""
    status: str = "pending"
    published_id: str = ""
    error: str = ""
    _raw: dict[str, Any] = field(default_factory=dict, repr=False)

    @classmethod
    def from_dict(cls, d: dict[str, Any]) -> "QueueItem":
        scheduled = d["scheduled_at"]
        if isinstance(scheduled, str):
            scheduled = _parse_dt(scheduled)
        elif not isinstance(scheduled, datetime):
            scheduled = datetime.combine(scheduled, datetime.min.time())
        item_type = str(d.get("type", "image")).lower()
        if item_type not in VALID_TYPES:
            raise ValueError(f"未知の投稿タイプ: {item_type}")
        media = d.get("media", [])
        if isinstance(media, str):
            media = [media]
        return cls(
            id=str(d["id"]),
            scheduled_at=scheduled,
            type=item_type,
            media=list(media),
            caption=str(d.get("caption", "")),
            topic=str(d.get("topic", "")),
            status=str(d.get("status", "pending")),
            published_id=str(d.get("published_id", "")),
            error=str(d.get("error", "")),
            _raw=d,
        )

    def to_dict(self) -> dict[str, Any]:
        d = dict(self._raw)
        d.update(
            id=self.id,
            scheduled_at=self.scheduled_at.strftime("%Y-%m-%d %H:%M"),
            type=self.type,
            media=self.media,
            caption=self.caption,
            topic=self.topic,
            status=self.status,
        )
        if self.published_id:
            d["published_id"] = self.published_id
        if self.error:
            d["error"] = self.error
        return d

    def is_due(self, now: datetime) -> bool:
        return self.status == "pending" and self.scheduled_at <= now


def _parse_dt(value: str) -> datetime:
    for fmt in ("%Y-%m-%d %H:%M", "%Y-%m-%d %H:%M:%S", "%Y-%m-%dT%H:%M"):
        try:
            return datetime.strptime(value, fmt)
        except ValueError:
            continue
    raise ValueError(f"日時の形式を解釈できません: {value!r}")


class PostQueue:
    def __init__(self, path: str | Path):
        self.path = Path(path)
        self.items: list[QueueItem] = []

    def load(self) -> "PostQueue":
        if not self.path.exists():
            self.items = []
            return self
        with open(self.path, encoding="utf-8") as f:
            data = yaml.safe_load(f) or []
        self.items = [QueueItem.from_dict(d) for d in data]
        return self

    def save(self) -> None:
        self.path.parent.mkdir(parents=True, exist_ok=True)
        with open(self.path, "w", encoding="utf-8") as f:
            yaml.safe_dump(
                [it.to_dict() for it in self.items],
                f,
                allow_unicode=True,
                sort_keys=False,
            )

    def due_items(self, now: datetime | None = None) -> list[QueueItem]:
        now = now or datetime.now()
        return [it for it in self.items if it.is_due(now)]


def _resolve_media_url(ref: str, base_url: str) -> str:
    """公開URL、または公開ベースURL + 相対パスに解決."""
    if ref.startswith(("http://", "https://")):
        return ref
    if not base_url:
        raise ValueError(
            f"メディア {ref!r} が相対パスですが PUBLIC_MEDIA_BASE_URL が未設定です。"
        )
    return f"{base_url}/{ref.lstrip('/')}"


def publish_item(
    item: QueueItem,
    client: InstagramClient,
    base_url: str,
    generator: ContentGenerator | None = None,
) -> str:
    """1 件のキューアイテムを公開し、media ID を返す."""
    caption = item.caption
    if not caption and item.topic and generator is not None:
        caption = generator.generate_post(item.topic).full_caption()

    urls = [_resolve_media_url(m, base_url) for m in item.media]
    if not urls:
        raise ValueError(f"{item.id}: メディアが指定されていません。")

    if item.type == "image":
        return client.publish_image(urls[0], caption)
    if item.type == "carousel":
        return client.publish_carousel(urls, caption)
    if item.type == "reel":
        return client.publish_reel(urls[0], caption)
    raise ValueError(f"未対応の投稿タイプ: {item.type}")


def process_due(
    queue: PostQueue,
    client: InstagramClient,
    base_url: str,
    generator: ContentGenerator | None = None,
    now: datetime | None = None,
) -> list[QueueItem]:
    """予約時刻を過ぎた投稿を公開し、キューを更新する.

    戻り値は今回処理したアイテム（成功/失敗を含む）。
    """
    processed: list[QueueItem] = []
    for item in queue.due_items(now):
        try:
            media_id = publish_item(item, client, base_url, generator)
            item.status = "published"
            item.published_id = media_id
            item.error = ""
        except Exception as e:  # 1件の失敗で全体を止めない
            item.status = "failed"
            item.error = str(e)
        processed.append(item)
    if processed:
        queue.save()
    return processed
