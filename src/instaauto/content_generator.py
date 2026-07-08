"""AI によるコンテンツ生成（キャプション・ハッシュタグ・投稿ネタ）.

Anthropic Claude API を利用します。API キーが無い場合はテンプレートに
フォールバックし、ツール全体は動作を継続します。
"""

from __future__ import annotations

import json
from dataclasses import dataclass, field

try:
    import anthropic
except ImportError:  # anthropic 未導入でも import 時に落とさない
    anthropic = None


@dataclass
class BrandVoice:
    """ブランドの発信トーン。config.yaml から供給."""

    company: str = "株式会社ディバイド"
    tone: str = "誠実で親しみやすく、専門性が伝わる"
    audience: str = "自社サービスに関心のあるビジネス層"
    language: str = "日本語"
    default_hashtags: list[str] = field(default_factory=list)
    ng_words: list[str] = field(default_factory=list)


@dataclass
class GeneratedPost:
    caption: str
    hashtags: list[str]

    def full_caption(self) -> str:
        tags = " ".join(h if h.startswith("#") else f"#{h}" for h in self.hashtags)
        return f"{self.caption}\n\n{tags}".strip()


class ContentGenerator:
    def __init__(
        self,
        api_key: str = "",
        model: str = "claude-sonnet-5",
        brand: BrandVoice | None = None,
    ) -> None:
        self.model = model
        self.brand = brand or BrandVoice()
        self._client = (
            anthropic.Anthropic(api_key=api_key)
            if (api_key and anthropic is not None)
            else None
        )

    @property
    def ai_enabled(self) -> bool:
        return self._client is not None

    def generate_post(self, topic: str, extra: str = "") -> GeneratedPost:
        """トピックからキャプションとハッシュタグを生成."""
        if not self.ai_enabled:
            return self._fallback(topic)

        system = (
            f"あなたは{self.brand.company}の広報担当者です。"
            f"Instagram投稿のキャプションを作成します。"
            f"トーン: {self.brand.tone}。対象読者: {self.brand.audience}。"
            f"言語: {self.brand.language}。"
        )
        if self.brand.ng_words:
            system += f" 次の語は使わない: {', '.join(self.brand.ng_words)}。"

        user = (
            f"投稿トピック: {topic}\n"
            f"{('補足: ' + extra) if extra else ''}\n\n"
            "以下のJSON形式だけを出力してください（前後に説明文を付けない）:\n"
            '{"caption": "本文（絵文字を適度に、150〜300字）", '
            '"hashtags": ["日本語または英語のタグを8〜15個、#は付けない"]}'
        )
        msg = self._client.messages.create(
            model=self.model,
            max_tokens=1024,
            system=system,
            messages=[{"role": "user", "content": user}],
        )
        text = "".join(block.text for block in msg.content if block.type == "text")
        return self._parse(text, topic)

    def brainstorm_ideas(self, theme: str, count: int = 5) -> list[str]:
        """投稿ネタを複数生成."""
        if not self.ai_enabled:
            return [f"{theme} のポイント {i + 1}" for i in range(count)]
        user = (
            f"{self.brand.company}のInstagramで発信する「{theme}」に関する"
            f"投稿ネタを{count}個、それぞれ1行で提案してください。番号付きの箇条書きのみ。"
        )
        msg = self._client.messages.create(
            model=self.model,
            max_tokens=1024,
            messages=[{"role": "user", "content": user}],
        )
        text = "".join(block.text for block in msg.content if block.type == "text")
        ideas = [
            line.lstrip("0123456789.-）) 　").strip()
            for line in text.splitlines()
            if line.strip()
        ]
        return [i for i in ideas if i][:count]

    # ---- 内部処理 ------------------------------------------------------
    def _parse(self, text: str, topic: str) -> GeneratedPost:
        try:
            start = text.index("{")
            end = text.rindex("}") + 1
            data = json.loads(text[start:end])
            hashtags = list(data.get("hashtags", [])) or self.brand.default_hashtags
            return GeneratedPost(
                caption=str(data.get("caption", "")).strip(),
                hashtags=[str(h).lstrip("#") for h in hashtags],
            )
        except (ValueError, json.JSONDecodeError):
            return self._fallback(topic)

    def _fallback(self, topic: str) -> GeneratedPost:
        return GeneratedPost(
            caption=f"【{self.brand.company}】{topic}",
            hashtags=[h.lstrip("#") for h in self.brand.default_hashtags]
            or ["ディバイド", "お知らせ"],
        )
