"""リール動画の自動生成（ffmpeg ベースのスライドショー）.

複数の静止画から、Instagram リール規格（1080x1920 / 縦型）の
動画を組み立てます。任意で BGM を重ねられます。
ffmpeg がシステムに必要です（GitHub Actions では apt で導入）。
"""

from __future__ import annotations

import shutil
import subprocess
import tempfile
from dataclasses import dataclass
from pathlib import Path

REEL_WIDTH = 1080
REEL_HEIGHT = 1920
DEFAULT_FPS = 30


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

    @property
    def total_seconds(self) -> float:
        return self.seconds_per_image * len(self.image_paths)


def ffmpeg_available() -> bool:
    return shutil.which("ffmpeg") is not None


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
