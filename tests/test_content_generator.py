from instaauto.content_generator import BrandVoice, ContentGenerator, GeneratedPost


def test_generated_post_full_caption_adds_hashes():
    post = GeneratedPost(caption="本文です", hashtags=["ディバイド", "#既に付き"])
    text = post.full_caption()
    assert "本文です" in text
    assert "#ディバイド" in text
    assert "#既に付き" in text
    assert "##" not in text


def test_fallback_when_no_api_key():
    gen = ContentGenerator(api_key="", brand=BrandVoice(default_hashtags=["Divide"]))
    assert gen.ai_enabled is False
    post = gen.generate_post("新サービス公開")
    assert "新サービス公開" in post.caption
    assert "Divide" in post.hashtags


def test_ideas_fallback_count():
    gen = ContentGenerator(api_key="")
    ideas = gen.brainstorm_ideas("採用", count=3)
    assert len(ideas) == 3


def test_parse_extracts_json_from_noise():
    gen = ContentGenerator(api_key="")
    raw = 'ここに出力します: {"caption": "やあ", "hashtags": ["a", "#b"]} 以上'
    post = gen._parse(raw, topic="t")
    assert post.caption == "やあ"
    assert post.hashtags == ["a", "b"]
