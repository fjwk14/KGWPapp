from pathlib import Path

from instaauto.brand import MAX_HASHTAGS, Brand, check_caption


def test_load_missing_file_returns_defaults(tmp_path):
    brand = Brand.load(tmp_path / "nope.yaml")
    assert brand.company_name == "株式会社ディバイド"
    assert brand.pillars == []


def test_load_repo_brand_yaml_has_pillars():
    brand = Brand.load()  # config/brand.yaml
    assert brand.company_name == "株式会社ディバイド"
    assert len(brand.pillars) >= 3
    assert brand.pillar("howto")["format"] == "reel"
    assert brand.base_hashtags  # 必須タグが定義されている


def test_check_caption_ok():
    brand = Brand(ng_words=["日本一"], hashtags={"max_count": 10})
    assert check_caption("普通の投稿です #tag1 #tag2", brand) == []


def test_check_caption_flags_ng_word_and_limits():
    brand = Brand(ng_words=["日本一"], hashtags={"max_count": 2})
    problems = check_caption("日本一です #a #b #c", brand)
    assert any("NG ワード" in p for p in problems)
    assert any("社内ルール上限" in p for p in problems)


def test_check_caption_flags_instagram_hard_limits():
    brand = Brand(hashtags={"max_count": 30})
    tags = " ".join(f"#t{i}" for i in range(MAX_HASHTAGS + 1))
    problems = check_caption("x" * 2300 + " " + tags, brand)
    assert any("2200" in p for p in problems)
    assert any("Instagram 上限 30" in p for p in problems)


def test_prompt_context_mentions_key_fields():
    brand = Brand.load()
    ctx = brand.prompt_context()
    assert "株式会社ディバイド" in ctx
    assert "文体" in ctx
