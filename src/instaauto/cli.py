"""コマンドラインインターフェース.

使い方の例:
  python -m instaauto check                     # 認証と接続の確認
  python -m instaauto generate "新サービス公開"   # AI でキャプション生成
  python -m instaauto make-reel img1.jpg img2.jpg -o out/reel.mp4
  python -m instaauto run                        # 予約投稿の処理（GitHub Actions 用）
  python -m instaauto report                     # 分析レポートを生成
"""

from __future__ import annotations

import argparse
import sys
from datetime import datetime

from . import __version__
from .analytics import write_report
from .config import ConfigError, Settings, load_config, load_settings
from .content_generator import BrandVoice, ContentGenerator
from .graph_api import GraphAPIError, InstagramClient
from .reel_generator import ReelSpec, build_reel
from .scheduler import PostQueue, process_due

QUEUE_PATH_DEFAULT = "content/queue.yaml"


def _client(settings: Settings) -> InstagramClient:
    return InstagramClient(
        ig_user_id=settings.ig_user_id,
        access_token=settings.access_token,
        api_version=settings.graph_api_version,
    )


def _brand_from_config(cfg: dict) -> BrandVoice:
    b = cfg.get("brand", {})
    return BrandVoice(
        company=b.get("company", "株式会社ディバイド"),
        tone=b.get("tone", "誠実で親しみやすく、専門性が伝わる"),
        audience=b.get("audience", "自社サービスに関心のあるビジネス層"),
        language=b.get("language", "日本語"),
        default_hashtags=b.get("default_hashtags", []),
        ng_words=b.get("ng_words", []),
    )


def cmd_check(args: argparse.Namespace) -> int:
    settings = load_settings()
    client = _client(settings)
    profile = client.account_profile()
    print("✅ Instagram 接続 OK")
    print(f"  アカウント: @{profile.get('username')}")
    print(f"  フォロワー: {profile.get('followers_count'):,}")
    print(f"  投稿数    : {profile.get('media_count'):,}")
    print(f"  AI 生成   : {'有効' if settings.has_ai else '無効（APIキー未設定）'}")
    return 0


def cmd_generate(args: argparse.Namespace) -> int:
    settings = load_settings()
    cfg = load_config()
    gen = ContentGenerator(
        api_key=settings.anthropic_api_key,
        model=settings.content_model,
        brand=_brand_from_config(cfg),
    )
    post = gen.generate_post(args.topic, extra=args.extra or "")
    print(post.full_caption())
    return 0


def cmd_ideas(args: argparse.Namespace) -> int:
    settings = load_settings()
    cfg = load_config()
    gen = ContentGenerator(
        api_key=settings.anthropic_api_key,
        model=settings.content_model,
        brand=_brand_from_config(cfg),
    )
    for i, idea in enumerate(gen.brainstorm_ideas(args.theme, count=args.count), 1):
        print(f"{i}. {idea}")
    return 0


def cmd_make_reel(args: argparse.Namespace) -> int:
    spec = ReelSpec(
        image_paths=args.images,
        output_path=args.output,
        seconds_per_image=args.seconds,
        audio_path=args.audio,
    )
    path = build_reel(spec)
    print(f"✅ リールを生成しました: {path} ({spec.total_seconds:.1f}秒)")
    return 0


def cmd_run(args: argparse.Namespace) -> int:
    settings = load_settings()
    cfg = load_config()
    queue = PostQueue(args.queue).load()
    gen = ContentGenerator(
        api_key=settings.anthropic_api_key,
        model=settings.content_model,
        brand=_brand_from_config(cfg),
    )
    now = datetime.now()
    due = queue.due_items(now)
    if not due:
        print(f"⏸  公開対象の投稿はありません（{now:%Y-%m-%d %H:%M} 時点）。")
        return 0

    processed = process_due(
        queue, _client(settings), settings.public_media_base_url, gen, now=now
    )
    ok = [p for p in processed if p.status == "published"]
    failed = [p for p in processed if p.status == "failed"]
    for p in ok:
        print(f"✅ 公開: {p.id} -> media {p.published_id}")
    for p in failed:
        print(f"❌ 失敗: {p.id} -> {p.error}", file=sys.stderr)
    return 1 if failed else 0


def cmd_report(args: argparse.Namespace) -> int:
    settings = load_settings()
    path = write_report(_client(settings), out_dir=args.out, media_limit=args.limit)
    print(f"✅ レポートを生成しました: {path}")
    return 0


def build_parser() -> argparse.ArgumentParser:
    p = argparse.ArgumentParser(
        prog="instaauto",
        description="株式会社ディバイド Instagram 運用自動化ツールキット",
    )
    p.add_argument("--version", action="version", version=f"instaauto {__version__}")
    sub = p.add_subparsers(dest="command", required=True)

    sub.add_parser("check", help="認証と接続を確認").set_defaults(func=cmd_check)

    g = sub.add_parser("generate", help="AI でキャプションを生成")
    g.add_argument("topic", help="投稿トピック")
    g.add_argument("--extra", help="補足情報", default="")
    g.set_defaults(func=cmd_generate)

    i = sub.add_parser("ideas", help="投稿ネタを AI でブレインストーム")
    i.add_argument("theme", help="テーマ")
    i.add_argument("--count", type=int, default=5)
    i.set_defaults(func=cmd_ideas)

    r = sub.add_parser("make-reel", help="画像からリール動画を生成")
    r.add_argument("images", nargs="+", help="入力画像（順番に表示）")
    r.add_argument("-o", "--output", required=True, help="出力 mp4 パス")
    r.add_argument("--seconds", type=float, default=2.5, help="1枚あたりの表示秒数")
    r.add_argument("--audio", help="BGM 音声ファイル", default=None)
    r.set_defaults(func=cmd_make_reel)

    run = sub.add_parser("run", help="予約時刻を過ぎた投稿を公開")
    run.add_argument("--queue", default=QUEUE_PATH_DEFAULT, help="キュー YAML パス")
    run.set_defaults(func=cmd_run)

    rep = sub.add_parser("report", help="分析レポートを生成")
    rep.add_argument("--out", default="reports", help="出力ディレクトリ")
    rep.add_argument("--limit", type=int, default=12, help="集計する投稿数")
    rep.set_defaults(func=cmd_report)

    return p


def main(argv: list[str] | None = None) -> int:
    parser = build_parser()
    args = parser.parse_args(argv)
    try:
        return args.func(args)
    except ConfigError as e:
        print(f"⚠️  設定エラー: {e}", file=sys.stderr)
        return 2
    except GraphAPIError as e:
        print(f"⚠️  Instagram API エラー: {e}", file=sys.stderr)
        return 3


if __name__ == "__main__":
    raise SystemExit(main())
