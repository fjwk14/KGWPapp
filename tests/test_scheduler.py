from datetime import datetime

import pytest

from instaauto.brand import Brand
from instaauto.scheduler import (
    PostQueue,
    QueueItem,
    _resolve_media_url,
    process_due,
)


def test_queue_item_parses_datetime_and_type():
    item = QueueItem.from_dict(
        {
            "id": "a1",
            "scheduled_at": "2026-07-10 09:00",
            "type": "reel",
            "media": "reels/x.mp4",
        }
    )
    assert item.scheduled_at == datetime(2026, 7, 10, 9, 0)
    assert item.type == "reel"
    assert item.media == ["reels/x.mp4"]  # 文字列は 1 要素リストに


def test_invalid_type_rejected():
    with pytest.raises(ValueError):
        QueueItem.from_dict(
            {"id": "x", "scheduled_at": "2026-07-10 09:00", "type": "story"}
        )


def test_is_due_only_when_pending_and_past():
    item = QueueItem.from_dict(
        {"id": "a", "scheduled_at": "2026-07-10 09:00", "type": "image"}
    )
    assert item.is_due(datetime(2026, 7, 10, 9, 0)) is True
    assert item.is_due(datetime(2026, 7, 10, 8, 59)) is False
    item.status = "published"
    assert item.is_due(datetime(2026, 7, 11, 0, 0)) is False


def test_resolve_media_url():
    assert _resolve_media_url("https://x.com/a.jpg", "https://cdn") == "https://x.com/a.jpg"
    assert _resolve_media_url("posts/a.jpg", "https://cdn/ig") == "https://cdn/ig/posts/a.jpg"
    with pytest.raises(ValueError):
        _resolve_media_url("posts/a.jpg", "")


class _FakeClient:
    def __init__(self):
        self.calls = []

    def publish_image(self, url, caption=""):
        self.calls.append(("image", url, caption))
        return "media-123"

    def publish_reel(self, url, caption=""):
        self.calls.append(("reel", url, caption))
        return "media-456"


def test_process_due_publishes_and_marks_status(tmp_path):
    qpath = tmp_path / "queue.yaml"
    queue = PostQueue(qpath)
    queue.items = [
        QueueItem.from_dict(
            {
                "id": "due",
                "scheduled_at": "2026-07-01 00:00",
                "type": "image",
                "media": ["posts/a.jpg"],
                "caption": "hello",
            }
        ),
        QueueItem.from_dict(
            {
                "id": "future",
                "scheduled_at": "2999-01-01 00:00",
                "type": "image",
                "media": ["posts/b.jpg"],
                "caption": "later",
            }
        ),
    ]
    client = _FakeClient()
    processed = process_due(
        queue, client, base_url="https://cdn/ig", now=datetime(2026, 7, 5)
    )
    assert len(processed) == 1
    assert processed[0].status == "published"
    assert processed[0].published_id == "media-123"
    assert client.calls == [("image", "https://cdn/ig/posts/a.jpg", "hello")]

    # 保存され、再読込しても状態が残る
    reloaded = PostQueue(qpath).load()
    statuses = {it.id: it.status for it in reloaded.items}
    assert statuses == {"due": "published", "future": "pending"}


def test_process_due_records_failure(tmp_path):
    class _Boom:
        def publish_image(self, url, caption=""):
            raise RuntimeError("token expired")

    queue = PostQueue(tmp_path / "q.yaml")
    queue.items = [
        QueueItem.from_dict(
            {
                "id": "x",
                "scheduled_at": "2026-07-01 00:00",
                "type": "image",
                "media": ["posts/a.jpg"],
                "caption": "hi",
            }
        )
    ]
    processed = process_due(
        queue, _Boom(), base_url="https://cdn", now=datetime(2026, 7, 5)
    )
    assert processed[0].status == "failed"
    assert "token expired" in processed[0].error


def test_pillar_roundtrips_through_yaml(tmp_path):
    queue = PostQueue(tmp_path / "q.yaml")
    queue.items = [
        QueueItem.from_dict(
            {
                "id": "p1",
                "scheduled_at": "2026-07-20 19:00",
                "type": "image",
                "media": ["posts/a.jpg"],
                "pillar": "new-arrival",
            }
        )
    ]
    queue.save()
    reloaded = PostQueue(queue.path).load()
    assert reloaded.items[0].pillar == "new-arrival"


def test_draft_items_are_not_due():
    item = QueueItem.from_dict(
        {
            "id": "d",
            "scheduled_at": "2026-07-01 00:00",
            "type": "image",
            "media": ["posts/a.jpg"],
            "status": "draft",
        }
    )
    assert item.is_due(datetime(2026, 7, 5)) is False


def test_brand_check_blocks_publication(tmp_path):
    brand = Brand(ng_words=["日本一"])
    queue = PostQueue(tmp_path / "q.yaml")
    queue.items = [
        QueueItem.from_dict(
            {
                "id": "ng",
                "scheduled_at": "2026-07-01 00:00",
                "type": "image",
                "media": ["posts/a.jpg"],
                "caption": "当社は日本一の品揃え",
            }
        )
    ]
    client = _FakeClient()
    processed = process_due(
        queue, client, base_url="https://cdn", now=datetime(2026, 7, 5), brand=brand
    )
    assert processed[0].status == "failed"
    assert "NG ワード" in processed[0].error
    assert client.calls == []  # 公開 API は呼ばれない
