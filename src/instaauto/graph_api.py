"""Meta Graph API クライアント（Instagram Content Publishing + Insights）.

公式ドキュメント:
  https://developers.facebook.com/docs/instagram-platform/content-publishing
  https://developers.facebook.com/docs/instagram-platform/insights
"""

from __future__ import annotations

import time
from typing import Any

import requests

GRAPH_BASE = "https://graph.facebook.com"

# リール（動画）はサーバー側の処理完了を待つ必要がある
_MAX_STATUS_POLLS = 30
_STATUS_POLL_INTERVAL_SEC = 5


class GraphAPIError(RuntimeError):
    """Graph API がエラーを返したときに送出."""


class InstagramClient:
    """1 つの Instagram ビジネスアカウントに対する操作をまとめる."""

    def __init__(
        self,
        ig_user_id: str,
        access_token: str,
        api_version: str = "v21.0",
        session: requests.Session | None = None,
    ) -> None:
        self.ig_user_id = ig_user_id
        self.access_token = access_token
        self.api_version = api_version
        self._session = session or requests.Session()

    # ---- 低レベル HTTP -------------------------------------------------
    def _url(self, path: str) -> str:
        return f"{GRAPH_BASE}/{self.api_version}/{path.lstrip('/')}"

    def _request(self, method: str, path: str, **params: Any) -> dict[str, Any]:
        params["access_token"] = self.access_token
        resp = self._session.request(method, self._url(path), params=params, timeout=60)
        try:
            data = resp.json()
        except ValueError:
            resp.raise_for_status()
            raise GraphAPIError(f"想定外の応答: {resp.text[:200]}")
        if not resp.ok or "error" in data:
            err = data.get("error", {})
            msg = err.get("message", resp.text[:200])
            code = err.get("code", resp.status_code)
            raise GraphAPIError(f"Graph API エラー [{code}]: {msg}")
        return data

    # ---- コンテンツ公開 ------------------------------------------------
    def publish_image(self, image_url: str, caption: str = "") -> str:
        """単一画像を投稿し、公開された media ID を返す."""
        creation = self._request(
            "POST",
            f"{self.ig_user_id}/media",
            image_url=image_url,
            caption=caption,
        )
        return self._publish_container(creation["id"])

    def publish_reel(
        self,
        video_url: str,
        caption: str = "",
        cover_url: str | None = None,
        share_to_feed: bool = True,
    ) -> str:
        """リール動画を投稿し、公開された media ID を返す."""
        params: dict[str, Any] = {
            "media_type": "REELS",
            "video_url": video_url,
            "caption": caption,
            "share_to_feed": "true" if share_to_feed else "false",
        }
        if cover_url:
            params["cover_url"] = cover_url
        creation = self._request("POST", f"{self.ig_user_id}/media", **params)
        container_id = creation["id"]
        self._wait_until_finished(container_id)
        return self._publish_container(container_id)

    def publish_carousel(self, image_urls: list[str], caption: str = "") -> str:
        """複数画像のカルーセル投稿。media ID を返す."""
        if not 2 <= len(image_urls) <= 10:
            raise ValueError("カルーセルは 2〜10 枚の画像が必要です。")
        children: list[str] = []
        for url in image_urls:
            child = self._request(
                "POST",
                f"{self.ig_user_id}/media",
                image_url=url,
                is_carousel_item="true",
            )
            children.append(child["id"])
        container = self._request(
            "POST",
            f"{self.ig_user_id}/media",
            media_type="CAROUSEL",
            children=",".join(children),
            caption=caption,
        )
        return self._publish_container(container["id"])

    def _wait_until_finished(self, container_id: str) -> None:
        """動画コンテナの処理完了（FINISHED）を待つ."""
        for _ in range(_MAX_STATUS_POLLS):
            status = self._request(
                "GET", container_id, fields="status_code,status"
            )
            code = status.get("status_code")
            if code == "FINISHED":
                return
            if code == "ERROR":
                raise GraphAPIError(f"メディア処理に失敗: {status.get('status')}")
            time.sleep(_STATUS_POLL_INTERVAL_SEC)
        raise GraphAPIError("メディア処理がタイムアウトしました。")

    def _publish_container(self, creation_id: str) -> str:
        published = self._request(
            "POST", f"{self.ig_user_id}/media_publish", creation_id=creation_id
        )
        return published["id"]

    # ---- インサイト（分析）--------------------------------------------
    def account_insights(
        self, metrics: list[str], period: str = "day"
    ) -> dict[str, Any]:
        """アカウント全体のインサイトを取得."""
        return self._request(
            "GET",
            f"{self.ig_user_id}/insights",
            metric=",".join(metrics),
            period=period,
        )

    def account_profile(self) -> dict[str, Any]:
        """フォロワー数・投稿数などの基本プロフィールを取得."""
        return self._request(
            "GET",
            self.ig_user_id,
            fields="username,followers_count,follows_count,media_count",
        )

    def recent_media(self, limit: int = 25) -> list[dict[str, Any]]:
        """直近の投稿一覧（基本メトリクス付き）を取得."""
        data = self._request(
            "GET",
            f"{self.ig_user_id}/media",
            fields="id,caption,media_type,permalink,timestamp,like_count,comments_count",
            limit=limit,
        )
        return data.get("data", [])

    def media_insights(self, media_id: str, metrics: list[str]) -> dict[str, Any]:
        """個別投稿のインサイトを取得."""
        return self._request(
            "GET", f"{media_id}/insights", metric=",".join(metrics)
        )
