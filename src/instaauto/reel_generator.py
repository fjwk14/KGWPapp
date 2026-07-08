"""リール動画の自動生成（ffmpeg ベースのスライドショー）.

複数の静止画から、Instagram リール規格（1080x1920 / 縦型）の
動画を組み立てます。任意で BGM と画像ごとの日本語テロップを重ねられます。
ffmpeg がシステムに必要です（GitHub Actions では apt で導入）。
テロップには日本語フォントが必要です（assets/fonts/ または Noto CJK）。
"""

from __future__ import annotations

import shutil
import subprocess
import tempfile
from dataclasses import dataclass
from pathlib import Path

from .config import REPO_ROOT

REEL_WIDTH = 1080
REEL_HEIGHT = 1920
DEFAULT_FPS = 30

FONT_DIR = REPO_ROOT / "assets" / "fonts"


class ReelGenerationError(RuntimeError):
    pass


@dataclass
class ReelSpec:
    """1 本のリール生成指示."""

    image_paths: list[str]
    output_path: str
    seconds_per_image: float = 2.5
    audio_path: str | None = None
    fps: int = DEFAULT_FPS
    # 画像ごとのテロップ（指定する場合は画像と同数にする）
    telops: list[str] | None = None

    @property
    def total_seconds(self) -> float:
        return self.seconds_per_image * len(self.image_paths)


def ffmpeg_available() -> bool:
    return shutil.which("ffmpeg") is not None


def find_font() -> Path | None:
    """テロップ用フォントを探す（assets/fonts 優先、次に日本語システムフォント）."""
    if FONT_DIR.exists():
        for ext in ("*.ttf", "*.otf", "*.ttc"):
            fonts = sorted(FONT_DIR.glob(ext))
            if fonts:
                return fonts[0]
    for candidate in (
        "/usr/share/fonts/opentype/noto/NotoSansCJK-Bold.ttc",
        "/usr/share/fonts/opentype/noto/NotoSansCJK-Regular.ttc",
        "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf",
    ):
        p = Path(candidate)
        if p.exists():
            return p
    return None


def _escape_drawtext(text: str) -> str:
    """ffmpeg drawtext フィルタ用のエスケープ."""
    return (
        text.replace("\\", "\\\\")
        .replace(":", "\\:")
        .replace("'", "\\'")
        .replace("%", "\\%")
    )


def _scale_pad_filter() -> str:
    """縦型キャンバスに収まるよう拡大縮小し、余白を黒で埋める."""
    return (
        f"scale={REEL_WIDTH}:{REEL_HEIGHT}:force_original_aspect_ratio=decrease,"
        f"pad={REEL_WIDTH}:{REEL_HEIGHT}:(ow-iw)/2:(oh-ih)/2:color=black,"
        f"setsar=1"
    )


def build_reel(spec: ReelSpec) -> str:
    """スライドショー形式のリールを生成し、出力パスを返す."""
    if not spec.image_paths:
        raise ReelGenerationError("画像が 1 枚も指定されていません。")
    if not ffmpeg_available():
        raise ReelGenerationError(
            "ffmpeg が見つかりません。インストールしてください "
            "(Ubuntu: sudo apt-get install -y ffmpeg)。"
        )
    for p in spec.image_paths:
        if not Path(p).exists():
            raise ReelGenerationError(f"画像が存在しません: {p}")
    if spec.telops is not None and len(spec.telops) != len(spec.image_paths):
        raise ReelGenerationError(
            f"テロップの数（{len(spec.telops)}）は画像の数（{len(spec.image_paths)}）"
            "と一致させてください。"
        )

    if spec.telops:
        return _build_reel_with_telops(spec)

    out = Path(spec.output_path)
    out.parent.mkdir(parents=True, exist_ok=True)

    # concat デマルチプレクサ用の入力リストを一時ファイルに書き出す
    with tempfile.NamedTemporaryFile(
        "w", suffix=".txt", delete=False, encoding="utf-8"
    ) as f:
        list_file = f.name
        for img in spec.image_paths:
            abs_img = str(Path(img).resolve())
            f.write(f"file '{abs_img}'\n")
            f.write(f"duration {spec.seconds_per_image}\n")
        # concat 仕様上、最後の画像はもう一度指定が必要
        f.write(f"file '{str(Path(spec.image_paths[-1]).resolve())}'\n")

    cmd: list[str] = [
        "ffmpeg", "-y",
        "-f", "concat", "-safe", "0", "-i", list_file,
    ]
    if spec.audio_path:
        if not Path(spec.audio_path).exists():
            raise ReelGenerationError(f"BGM が存在しません: {spec.audio_path}")
        cmd += ["-i", spec.audio_path]

    cmd += [
        "-vf", _scale_pad_filter(),
        "-r", str(spec.fps),
        "-c:v", "libx264",
        "-pix_fmt", "yuv420p",
        "-profile:v", "high",
    ]
    if spec.audio_path:
        cmd += ["-c:a", "aac", "-b:a", "128k", "-shortest"]
    cmd += ["-t", str(spec.total_seconds), str(out)]

    try:
        subprocess.run(cmd, check=True, capture_output=True, text=True)
    except subprocess.CalledProcessError as e:
        raise ReelGenerationError(f"ffmpeg 実行に失敗:\n{e.stderr[-800:]}") from e
    finally:
        Path(list_file).unlink(missing_ok=True)

    return str(out)


def _build_reel_with_telops(spec: ReelSpec) -> str:
    """画像ごとにテロップを焼き込んだクリップを作って連結する."""
    font = find_font()
    if font is None:
        raise ReelGenerationError(
            "テロップ用フォントが見つかりません。assets/fonts/ に日本語フォント"
            "（.ttf/.otf/.ttc）を置くか、fonts-noto-cjk をインストールしてください。"
        )

    out = Path(spec.output_path)
    out.parent.mkdir(parents=True, exist_ok=True)

    with tempfile.TemporaryDirectory() as tmpdir:
        clips: list[Path] = []
        for i, (img, telop) in enumerate(zip(spec.image_paths, spec.telops or [])):
            clip = Path(tmpdir) / f"clip{i:03d}.mp4"
            vf = _scale_pad_filter() + f",fps={spec.fps},format=yuv420p"
            if telop.strip():
                # 画面下部 1/4 に白文字 + 黒縁取りで表示（背景を選ばない）
                vf += (
                    f",drawtext=fontfile='{font}':text='{_escape_drawtext(telop)}'"
                    ":fontsize=64:fontcolor=white:borderw=4:bordercolor=black"
                    ":x=(w-text_w)/2:y=h*3/4"
                )
            _run_ffmpeg([
                "ffmpeg", "-y",
                "-loop", "1", "-t", str(spec.seconds_per_image), "-i", str(img),
                "-vf", vf,
                "-c:v", "libx264", "-pix_fmt", "yuv420p", "-profile:v", "high",
                "-an", str(clip),
            ])
            clips.append(clip)

        list_file = Path(tmpdir) / "list.txt"
        list_file.write_text(
            "".join(f"file '{c}'\n" for c in clips), encoding="utf-8"
        )

        cmd = ["ffmpeg", "-y", "-f", "concat", "-safe", "0", "-i", str(list_file)]
        if spec.audio_path:
            if not Path(spec.audio_path).exists():
                raise ReelGenerationError(f"BGM が存在しません: {spec.audio_path}")
            cmd += [
                "-i", spec.audio_path,
                "-map", "0:v", "-map", "1:a",
                "-c:v", "copy", "-c:a", "aac", "-b:a", "128k", "-shortest",
            ]
        else:
            cmd += ["-c", "copy"]
        cmd.append(str(out))
        _run_ffmpeg(cmd)

    return str(out)


def _run_ffmpeg(cmd: list[str]) -> None:
    try:
        subprocess.run(cmd, check=True, capture_output=True, text=True)
    except subprocess.CalledProcessError as e:
        stderr = e.stderr or ""
        if "No such filter: 'drawtext'" in stderr:
            raise ReelGenerationError(
                "この環境の ffmpeg はテロップ（drawtext フィルタ）に未対応です。"
                "libfreetype 有効の ffmpeg（Ubuntu: apt-get install ffmpeg）を"
                "使うか、--telop 無しで生成してください。"
            ) from e
        raise ReelGenerationError(f"ffmpeg 実行に失敗:\n{stderr[-800:]}") from e
