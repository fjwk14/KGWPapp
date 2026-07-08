"""AI によるコンテンツ生成（キャプション・ハッシュタグ・投稿ネタ・リール台本）.

config/brand.yaml のブランドプロフィール（トーン・投稿の柱・ハッシュタグ戦略）
に沿って Anthropic Claude API で生成します。API キーが無い場合はテンプレートに
フォールバックし、ツール全体は動作を継続します。
"""

from __future__ import annotations

import json
from dataclasses import dataclass, field
from typing import Any

from .brand import Brand, check_caption

try:
    import anthropic
except ImportError:  # anthropic 未導入でも import 時に落とさない
    anthropic = None

_SYSTEM_BASE = (
    "あなたは日本企業の Instagram 運用を支援するプロのコピーライターです。"
    "指示されたブランド設定・文体を厳密に守り、"
    "必ず指定された JSON 形式のみで回答してください（前後に説明文を付けない）。"
)


@dataclass
class GeneratedPost:
    caption: str
    hashtags: list[str]
    cta: str = ""
    problems: list[str] = field(default_factory=list)

    def full_caption(self) -> str:
        """本文 + CTA + ハッシュタグを投稿用に組み立てる."""
        parts = [self.caption.strip()]
        if self.cta:
            parts.append(self.cta.strip())
        if self.hashtags:
            parts.append(
                " ".join(h if h.startswith("#") else f"#{h}" for h in self.hashtags)
            )
        return "\n\n".join(p for p in parts if p)


class ContentGenerator:
    def __init__(
        self,
        api_key: str = "",
        model: str = "claude-sonnet-5",
        brand: Brand | None = None,
    ) -> None:
        self.model = model
        self.brand = brand or Brand()
        self._client = (
            anthropic.Anthropic(api_key=api_key)
            if (api_key and anthropic is not None)
            else None
        )

    @property
    def ai_enabled(self) -> bool:
        return self._client is not None

    # ---- キャプション生成 ----------------------------------------------
    def generate_post(
        self, topic: str, extra: str = "", pillar_id: str = ""
    ) -> GeneratedPost:
        """トピック（+投稿の柱）からキャプションとハッシュタグを生成."""
        if not self.ai_enabled:
            return self._finalize(self._fallback(topic))

        pillar_text = ""
        if pillar_id:
            try:
                p = self.brand.pillar(pillar_id)
                pillar_text = f"- 投稿の柱: {p['name']}（{p.get('description', '')}）\n"
            except KeyError:
                pass

        user = f"""以下のブランド設定に沿って、Instagram 投稿のキャプションを 1 本作成してください。

# ブランド設定
{self.brand.prompt_context()}

# 今回の投稿
{pillar_text}- 題材: {topic}
{('- 補足: ' + extra) if extra else ''}

# 要件
- 冒頭 1 行目はフィードで目を引くフック（本題が伝わる短い一文）
- 本文は 150〜300 字。読みやすく適度に改行する
- ハッシュタグは本文に含めず hashtags フィールドに分離する（# は付けない）
- ハッシュタグは必須タグ {json.dumps(self.brand.base_hashtags, ensure_ascii=False)} を含め、
  候補プール {json.dumps(self.brand.pool_hashtags, ensure_ascii=False)} と題材固有のタグを
  組み合わせて最大 {self.brand.max_hashtags} 個

# 出力形式（JSON のみ）
{{"caption": "本文", "hashtags": ["タグ1", "タグ2"]}}"""

        text = self._ask(user, max_tokens=1500)
        return self._finalize(self._parse(text, topic))

    # ---- 投稿ネタ出し ---------------------------------------------------
    def brainstorm_ideas(self, theme: str, count: int = 5) -> list[str]:
        """テーマ（投稿の柱の名前でも自由テーマでも可）から投稿ネタを複数生成."""
        if not self.ai_enabled:
            return [f"{theme} のポイント {i + 1}" for i in range(count)]
        user = (
            f"以下のブランド設定を持つ会社の Instagram で発信する"
            f"「{theme}」に関する投稿ネタを {count} 個提案してください。\n\n"
            f"# ブランド設定\n{self.brand.prompt_context()}\n\n"
            "それぞれ 1 行で、番号付きの箇条書きのみを出力してください。"
        )
        text = self._ask(user, max_tokens=1024, use_system=False)
        ideas = [
            line.lstrip("0123456789.-）) 　").strip()
            for line in text.splitlines()
            if line.strip()
        ]
        return [i for i in ideas if i][:count]

    # ---- リール台本 -----------------------------------------------------
    def generate_reel_script(self, topic: str, scene_count: int = 5) -> dict[str, Any]:
        """リール動画の構成台本を生成する.

        戻り値: {"scenes": [{"telop": str, "direction": str}], "caption": str}
        telop は make-reel の --telop にそのまま使える短文。
        """
        if not self.ai_enabled:
            return self._fallback_reel_script(topic, scene_count)

        user = f"""以下のブランド設定に沿って、Instagram リール動画の構成を作ってください。

# ブランド設定
{self.brand.prompt_context()}

# 題材
{topic}

# 要件
- シーンは {scene_count} 個。各シーンは画像 1 枚 + 短いテロップ 1 行（全角 15 文字以内）
- 1 シーン目は視聴を止めるフック、最終シーンは締め + 行動喚起
- caption はリール投稿用の本文（3 行程度、ハッシュタグは含めない）

# 出力形式（JSON のみ）
{{"scenes": [{{"telop": "テロップ文", "direction": "画像/映像の指示"}}], "caption": "投稿本文"}}"""
        text = self._ask(user, max_tokens=2000)
        try:
            data = self._extract_json(text)
            scenes = list(data.get("scenes", []))[:scene_count]
            return {"scenes": scenes, "caption": str(data.get("caption", "")).strip()}
        except (ValueError, json.JSONDecodeError):
            return self._fallback_reel_script(topic, scene_count)

    def _fallback_reel_script(self, topic: str, scene_count: int) -> dict[str, Any]:
        scenes = (
            [{"telop": topic[:15], "direction": "フックになる印象的なカット"}]
            + [
                {"telop": f"ポイント{i}", "direction": "商品や事例のカット"}
                for i in range(1, max(scene_count - 1, 1))
            ]
            + [{"telop": "詳しくはプロフィールへ", "direction": "締めのカット"}]
        )
        return {
            "scenes": scenes[:scene_count],
            "caption": f"【{self.brand.company_name}】{topic}",
        }

    # ---- 内部処理 ------------------------------------------------------
    def _ask(self, user: str, max_tokens: int, use_system: bool = True) -> str:
        kwargs: dict[str, Any] = dict(
            model=self.model,
            max_tokens=max_tokens,
            messages=[{"role": "user", "content": user}],
        )
        if use_system:
            kwargs["system"] = _SYSTEM_BASE
        msg = self._client.messages.create(**kwargs)
        return "".join(block.text for block in msg.content if block.type == "text")

    @staticmethod
    def _extract_json(text: str) -> dict[str, Any]:
        start = text.index("{")
        end = text.rindex("}") + 1
        return json.loads(text[start:end])

    def _parse(self, text: str, topic: str) -> GeneratedPost:
        try:
            data = self._extract_json(text)
            hashtags = [
                str(h).lstrip("#") for h in data.get("hashtags", [])
            ] or self.brand.base_hashtags
            return GeneratedPost(
                caption=str(data.get("caption", "")).strip(),
                hashtags=hashtags,
            )
        except (ValueError, json.JSONDecodeError):
            return self._fallback(topic)

    def _fallback(self, topic: str) -> GeneratedPost:
        return GeneratedPost(
            caption=f"【{self.brand.company_name}】{topic}",
            hashtags=self.brand.base_hashtags or ["ディバイド", "お知らせ"],
        )

    def _finalize(self, post: GeneratedPost) -> GeneratedPost:
        """必須タグの補完・上限適用・CTA 付与・投稿前チェック."""
        tags = [t.lstrip("#") for t in post.hashtags]
        for base in self.brand.base_hashtags:
            if base not in tags:
                tags.insert(0, base)
        post.hashtags = tags[: self.brand.max_hashtags]
        post.cta = self.brand.cta
        post.problems = check_caption(post.full_caption(), self.brand)
        return post
