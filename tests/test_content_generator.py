from instaauto.brand import Brand
from instaauto.content_generator import ContentGenerator, GeneratedPost


def _brand(**overrides):
    base = dict(
        company={"name": "株式会社ディバイド", "business": "雑貨卸"},
        hashtags={"base": ["ディバイド"], "pool": ["雑貨"], "max_count": 5},
        cta="お問い合わせはプロフィールから。",
        ng_words=["日本一"],
    )
    base.update(overrides)
    return Brand(**base)


def test_generated_post_full_caption_adds_hashes_and_cta():
    post = GeneratedPost(
        caption="本文です",
        hashtags=["ディバイド", "#既に付き"],
        cta="お問い合わせはプロフィールから。",
    )
    text = post.full_caption()
    assert "本文です" in text
    assert "お問い合わせはプロフィールから。" in text
    assert "#ディバイド" in text
    assert "#既に付き" in text
    assert "##" not in text
    # CTA はハッシュタグより前
    assert text.index("お問い合わせ") < text.index("#ディバイド")


def test_fallback_when_no_api_key_uses_brand():
    gen = ContentGenerator(api_key="", brand=_brand())
    assert gen.ai_enabled is False
    post = gen.generate_post("新商品入荷")
    assert "新商品入荷" in post.caption
    assert "株式会社ディバイド" in post.caption
    assert "ディバイド" in post.hashtags
    assert post.cta == "お問い合わせはプロフィールから。"


def test_finalize_inserts_base_tags_and_caps_count():
    gen = ContentGenerator(api_key="", brand=_brand())
    post = gen._finalize(
        GeneratedPost(caption="x", hashtags=["a", "b", "c", "d", "e", "f"])
    )
    assert post.hashtags[0] == "ディバイド"   # 必須タグを先頭に補完
    assert len(post.hashtags) == 5           # max_count で切り詰め


def test_finalize_flags_ng_words():
    gen = ContentGenerator(api_key="", brand=_brand())
    post = gen._finalize(GeneratedPost(caption="当社は日本一です", hashtags=[]))
    assert any("日本一" in p for p in post.problems)


def test_ideas_fallback_count():
    gen = ContentGenerator(api_key="", brand=_brand())
    ideas = gen.brainstorm_ideas("採用", count=3)
    assert len(ideas) == 3


def test_parse_extracts_json_from_noise():
    gen = ContentGenerator(api_key="", brand=_brand())
    raw = 'ここに出力します: {"caption": "やあ", "hashtags": ["a", "#b"]} 以上'
    post = gen._parse(raw, topic="t")
    assert post.caption == "やあ"
    assert post.hashtags == ["a", "b"]


def test_reel_script_fallback_shape():
    gen = ContentGenerator(api_key="", brand=_brand())
    script = gen.generate_reel_script("テーブルコーデ", scene_count=4)
    assert len(script["scenes"]) == 4
    assert all("telop" in s for s in script["scenes"])
    assert script["caption"]
