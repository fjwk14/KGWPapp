"""株式会社ディバイドのブランドプロフィール（config/brand.yaml）.

AI コンテンツ生成・週間投稿プラン・投稿前チェックのすべてが
このファイルの内容を参照します。会社情報や発信方針を変えるときは
config/brand.yaml だけを編集すれば全体に反映されます。
"""

from __future__ import annotations

import re
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

import yaml

from .config import REPO_ROOT

BRAND_PATH = REPO_ROOT / "config" / "brand.yaml"

# Instagram の仕様上限
MAX_CAPTION_CHARS = 2200
MAX_HASHTAGS = 30


@dataclass
class Brand:
    """ブランド設定。brand.yaml が無い場合も最低限の既定値で動作する."""

    company: dict[str, Any] = field(default_factory=dict)
    audience: list[str] = field(default_factory=list)
    tone: dict[str, Any] = field(default_factory=dict)
    pillars: list[dict[str, Any]] = field(default_factory=list)
    hashtags: dict[str, Any] = field(default_factory=dict)
    cta: str = ""
    ng_words: list[str] = field(default_factory=list)

    # ---- 読み込み -------------------------------------------------------
    @classmethod
    def load(cls, path: Path | None = None) -> "Brand":
        brand_path = path or BRAND_PATH
        if not brand_path.exists():
            return cls(company={"name": "株式会社ディバイド"})
        with open(brand_path, encoding="utf-8") as f:
            raw = yaml.safe_load(f) or {}
        return cls(
            company=raw.get("company", {}) or {},
            audience=raw.get("audience", []) or [],
            tone=raw.get("tone", {}) or {},
            pillars=raw.get("pillars", []) or [],
            hashtags=raw.get("hashtags", {}) or {},
            cta=(raw.get("cta") or "").strip(),
            ng_words=raw.get("ng_words", []) or [],
        )

    # ---- 参照ヘルパー ---------------------------------------------------
    @property
    def company_name(self) -> str:
        return self.company.get("name", "株式会社ディバイド")

    @property
    def base_hashtags(self) -> list[str]:
        return [str(t).lstrip("#") for t in self.hashtags.get("base", [])]

    @property
    def pool_hashtags(self) -> list[str]:
        return [str(t).lstrip("#") for t in self.hashtags.get("pool", [])]

    @property
    def max_hashtags(self) -> int:
        return min(int(self.hashtags.get("max_count", 15)), MAX_HASHTAGS)

    def pillar(self, pillar_id: str) -> dict[str, Any]:
        for p in self.pillars:
            if p.get("id") == pillar_id:
                return p
        raise KeyError(f"投稿の柱 '{pillar_id}' が brand.yaml にありません。")

    def prompt_context(self) -> str:
        """AI へ渡すブランド説明文."""
        avoid = "、".join(self.tone.get("avoid", [])) or "なし"
        return (
            f"会社名: {self.company_name}\n"
            f"事業内容: {self.company.get('business', '')}\n"
            f"所在地: {self.company.get('location', '')}\n"
            f"主な読者: {'、'.join(self.audience) or '一般ユーザー'}\n"
            f"文体: {self.tone.get('style', '丁寧で親しみやすい敬体')}\n"
            f"キャラクター: {self.tone.get('personality', '')}\n"
            f"絵文字の方針: {self.tone.get('emoji', '適度に使う')}\n"
            f"避けるべき表現: {avoid}"
        )


def check_caption(caption: str, brand: Brand) -> list[str]:
    """投稿前チェック。問題点のリストを返す（空リストなら合格）.

    - Instagram 仕様上限（本文 2200 字 / ハッシュタグ 30 個）
    - 社内ルールのハッシュタグ上限（brand.yaml の max_count）
    - NG ワード（誇大表現など）
    """
    problems: list[str] = []
    if len(caption) > MAX_CAPTION_CHARS:
        problems.append(
            f"本文が {len(caption)} 文字あります（Instagram 上限 {MAX_CAPTION_CHARS}）。"
        )
    tags = re.findall(r"#\S+", caption)
    if len(tags) > MAX_HASHTAGS:
        problems.append(
            f"ハッシュタグが {len(tags)} 個あります（Instagram 上限 {MAX_HASHTAGS}）。"
        )
    elif len(tags) > brand.max_hashtags:
        problems.append(
            f"ハッシュタグが社内ルール上限 {brand.max_hashtags} 個を超えています（{len(tags)} 個）。"
        )
    for word in brand.ng_words:
        if word and word in caption:
            problems.append(f"NG ワード「{word}」が含まれています。")
    return problems
