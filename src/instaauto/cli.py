"""コマンドラインインターフェース.

使い方の例:
  python -m instaauto check                      # 認証と接続の確認
  python -m instaauto generate "新商品入荷"        # AI でキャプション生成
  python -m instaauto ideas styling --count 5    # 投稿の柱からネタ出し
  python -m instaauto plan                       # 来週分の投稿プラン雛形を生成
  python -m instaauto reel-script "商品の使い方"   # リール台本（テロップ）を生成
  python -m instaauto make-reel img1.jpg img2.jpg -o out/reel.mp4 --telop "新入荷" --telop "詳細はプロフへ"
  python -m instaauto run                        # 予約投稿の処理（GitHub Actions 用）
  python -m instaauto report                     # 分析レポートを生成
"""

from __future__ import annotations

import argparse
import os
import sys
from datetime import datetime, timedelta
from zoneinfo import ZoneInfo

import yaml

from . import __version__
from .analytics import write_report
from .brand import Brand
from .config import ConfigError, Settings, load_config, load_settings
from .content_generator import ContentGenerator
from .graph_api import GraphAPIError, InstagramClient
from .reel_generator import ReelGenerationError, ReelSpec, build_reel
from .scheduler import PostQueue, QueueItem, process_due

QUEUE_PATH_DEFAULT = "content/queue.yaml"

_WEEKDAYS = {"mon": 0, "tue": 1, "wed": 2, "thu": 3, "fri": 4, "sat": 5, "sun": 6}


def _client(settings: Settings) -> InstagramClient:
    return InstagramClient(
        ig_user_id=settings.ig_user_id,
        access_token=settings.access_token,
        api_version=settings.graph_api_version,
    )


def _generator(settings: Settings, brand: Brand) -> ContentGenerator:
    return ContentGenerator(
        api_key=settings.anthropic_api_key,
        model=settings.content_model,
        brand=brand,
    )


def _ai_generator(brand: Brand) -> ContentGenerator:
    """AI 系コマンド用。Instagram 未連携（IG_USER_ID 等が無い）でも動く."""
    try:
        settings = load_settings()
        api_key, model = settings.anthropic_api_key, settings.content_model
    except ConfigError:
        api_key = os.getenv("ANTHROPIC_API_KEY", "")
        model = os.getenv("CONTENT_MODEL", "claude-sonnet-5")
    return ContentGenerator(api_key=api_key, model=model, brand=brand)


def _local_now(cfg: dict) -> datetime:
    """運用タイムゾーン（既定 JST）の現在時刻を naive で返す.

    キューの scheduled_at はこのタイムゾーンのローカル時刻として解釈する。
    GitHub Actions（UTC）で実行しても予約時刻がずれない。
    """
    tz = ZoneInfo(cfg.get("timezone", "Asia/Tokyo"))
    return datetime.now(tz).replace(tzinfo=None)


def _print_problems(problems: list[str]) -> None:
    for p in problems:
        print(f"⚠️  {p}", file=sys.stderr)


def cmd_check(args: argparse.Namespace) -> int:
    settings = load_settings()
    client = _client(settings)
    profile = client.account_profile()
    brand = Brand.load()
    print("✅ Instagram 接続 OK")
    print(f"  アカウント: @{profile.get('username')}")
    print(f"  フォロワー: {profile.get('followers_count'):,}")
    print(f"  投稿数    : {profile.get('media_count'):,}")
    print(f"  AI 生成   : {'有効' if settings.has_ai else '無効（APIキー未設定）'}")
    print(f"  ブランド  : {brand.company_name}（投稿の柱 {len(brand.pillars)} 本）")
    return 0


def cmd_generate(args: argparse.Namespace) -> int:
    brand = Brand.load()
    gen = _ai_generator(brand)
    post = gen.generate_post(args.topic, extra=args.extra or "", pillar_id=args.pillar)
    print(post.full_caption())
    _print_problems(post.problems)
    return 1 if post.problems else 0


def cmd_ideas(args: argparse.Namespace) -> int:
    brand = Brand.load()
    gen = _ai_generator(brand)
    # 投稿の柱 ID が渡されたら柱の説明をテーマに使う
    theme = args.theme
    try:
        p = brand.pillar(args.theme)
        theme = f"{p['name']}（{p.get('description', '')}）"
    except KeyError:
        pass
    for i, idea in enumerate(gen.brainstorm_ideas(theme, count=args.count), 1):
        print(f"{i}. {idea}")
    return 0


def cmd_plan(args: argparse.Namespace) -> int:
    """brand.yaml の投稿の柱 × config.yaml の時間帯から、来週分のキュー雛形を生成.

    生成される項目は status: draft。素材（media）を差し替えて
    status を pending に変えると run が公開対象にします。
    """
    cfg = load_config()
    brand = Brand.load()
    if not brand.pillars:
        print("⚠️  brand.yaml に投稿の柱（pillars）がありません。", file=sys.stderr)
        return 2

    plan_cfg = cfg.get("plan", {})
    slots = plan_cfg.get("slots", [])
    posts = int(plan_cfg.get("posts_per_week", len(slots) or 3))
    if not slots:
        slots = [{"weekday": "Tue", "time": "19:00"}, {"weekday": "Thu", "time": "12:15"},
                 {"weekday": "Sat", "time": "20:00"}]
    slots = slots[:posts]

    # プラン生成に Instagram の認証情報は不要。AI キーがあれば具体化に使う
    gen = None
    if args.ai:
        gen = _ai_generator(brand)
        if not gen.ai_enabled:
            print("⚠️  ANTHROPIC_API_KEY が無いため AI 具体化はスキップします。", file=sys.stderr)
            gen = None

    now = _local_now(cfg)
    items = []
    for i, slot in enumerate(slots):
        wd = _WEEKDAYS.get(str(slot.get("weekday", "Tue"))[:3].lower(), 1)
        hh, mm = str(slot.get("time", "19:00")).split(":")
        # 今日以降で次に来るその曜日（同日はスキップして翌週に）
        days_ahead = (wd - now.weekday()) % 7 or 7
        when = (now + timedelta(days=days_ahead)).replace(
            hour=int(hh), minute=int(mm), second=0, microsecond=0
        )
        pillar = brand.pillars[i % len(brand.pillars)]
        fmt = pillar.get("format", "image")
        topic = f"{pillar['name']}の投稿"
        if gen is not None:
            ideas = gen.brainstorm_ideas(
                f"{pillar['name']}（{pillar.get('description', '')}）", count=1
            )
            if ideas:
                topic = ideas[0]
        media_placeholder = (
            "reels/CHANGE-ME.mp4" if fmt == "reel" else "posts/CHANGE-ME.jpg"
        )
        items.append(
            {
                "id": f"{when:%Y-%m-%d}-{pillar['id']}",
                "scheduled_at": f"{when:%Y-%m-%d %H:%M}",
                "type": "reel" if fmt == "reel" else ("carousel" if fmt == "carousel" else "image"),
                "media": [media_placeholder],
                "topic": topic,
                "pillar": pillar["id"],
                "status": "draft",
            }
        )

    text = yaml.safe_dump(items, allow_unicode=True, sort_keys=False)
    if args.write:
        queue = PostQueue(args.queue).load()
        existing_ids = {it.id for it in queue.items}
        added = 0
        for d in items:
            if d["id"] not in existing_ids:
                queue.items.append(QueueItem.from_dict(d))
                added += 1
        queue.save()
        print(f"✅ {added} 件を {args.queue} に追加しました（status: draft）。")
        print("   素材（media）を差し替えて status を pending にすると公開対象になります。")
    else:
        print(text)
    return 0


def cmd_reel_script(args: argparse.Namespace) -> int:
    brand = Brand.load()
    gen = _ai_generator(brand)
    script = gen.generate_reel_script(args.topic, scene_count=args.scenes)
    print("# リール構成案")
    for i, scene in enumerate(script.get("scenes", []), 1):
        print(f"{i}. テロップ:「{scene.get('telop', '')}」 / 映像: {scene.get('direction', '')}")
    print("\n# 投稿キャプション案")
    print(script.get("caption", ""))
    telops = " ".join(f'--telop "{s.get("telop", "")}"' for s in script.get("scenes", []))
    print(f"\n# make-reel 用オプション\n{telops}")
    return 0


def cmd_make_reel(args: argparse.Namespace) -> int:
    spec = ReelSpec(
        image_paths=args.images,
        output_path=args.output,
        seconds_per_image=args.seconds,
        audio_path=args.audio,
        telops=args.telop if args.telop else None,
    )
    path = build_reel(spec)
    print(f"✅ リールを生成しました: {path} ({spec.total_seconds:.1f}秒)")
    return 0


def cmd_run(args: argparse.Namespace) -> int:
    settings = load_settings()
    cfg = load_config()
    brand = Brand.load()
    queue = PostQueue(args.queue).load()
    gen = _generator(settings, brand)
    now = _local_now(cfg)
    due = queue.due_items(now)
    if not due:
        print(f"⏸  公開対象の投稿はありません（{now:%Y-%m-%d %H:%M} JST 時点）。")
        return 0

    processed = process_due(
        queue, _client(settings), settings.public_media_base_url, gen,
        now=now, brand=brand,
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
    cfg = load_config()
    limit = args.limit or int(cfg.get("report", {}).get("media_limit", 12))
    path = write_report(_client(settings), out_dir=args.out, media_limit=limit)
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
    g.add_argument("--pillar", help="投稿の柱 ID（brand.yaml の pillars.id）", default="")
    g.set_defaults(func=cmd_generate)

    i = sub.add_parser("ideas", help="投稿ネタを AI でブレインストーム")
    i.add_argument("theme", help="テーマ、または投稿の柱 ID（例: styling）")
    i.add_argument("--count", type=int, default=5)
    i.set_defaults(func=cmd_ideas)

    pl = sub.add_parser("plan", help="来週分の投稿プラン雛形を生成")
    pl.add_argument("--write", action="store_true", help="キューに直接追加する")
    pl.add_argument("--queue", default=QUEUE_PATH_DEFAULT, help="キュー YAML パス")
    pl.add_argument("--ai", action="store_true", help="AI でネタを具体化する")
    pl.set_defaults(func=cmd_plan)

    rs = sub.add_parser("reel-script", help="リール台本（テロップ+キャプション）を生成")
    rs.add_argument("topic", help="リールの題材")
    rs.add_argument("--scenes", type=int, default=5, help="シーン数")
    rs.set_defaults(func=cmd_reel_script)

    r = sub.add_parser("make-reel", help="画像からリール動画を生成")
    r.add_argument("images", nargs="+", help="入力画像（順番に表示）")
    r.add_argument("-o", "--output", required=True, help="出力 mp4 パス")
    r.add_argument("--seconds", type=float, default=2.5, help="1枚あたりの表示秒数")
    r.add_argument("--audio", help="BGM 音声ファイル", default=None)
    r.add_argument(
        "--telop", action="append", default=[],
        help="画像ごとのテロップ（画像の数だけ繰り返し指定）",
    )
    r.set_defaults(func=cmd_make_reel)

    run = sub.add_parser("run", help="予約時刻を過ぎた投稿を公開")
    run.add_argument("--queue", default=QUEUE_PATH_DEFAULT, help="キュー YAML パス")
    run.set_defaults(func=cmd_run)

    rep = sub.add_parser("report", help="分析レポートを生成")
    rep.add_argument("--out", default="reports", help="出力ディレクトリ")
    rep.add_argument("--limit", type=int, default=None, help="集計する投稿数")
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
    except ReelGenerationError as e:
        print(f"⚠️  リール生成エラー: {e}", file=sys.stderr)
        return 4


if __name__ == "__main__":
    raise SystemExit(main())
