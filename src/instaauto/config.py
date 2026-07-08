"""設定と認証情報の読み込み.

優先順位: 環境変数 > .env ファイル。
config.yaml は投稿方針など「秘密でない設定」を保持します。
"""

from __future__ import annotations

import os
from dataclasses import dataclass
from pathlib import Path
from typing import Any

import yaml

try:
    from dotenv import load_dotenv
except ImportError:  # dotenv は任意
    load_dotenv = None

REPO_ROOT = Path(__file__).resolve().parents[2]
DEFAULT_CONFIG_PATH = REPO_ROOT / "config" / "config.yaml"
EXAMPLE_CONFIG_PATH = REPO_ROOT / "config" / "config.example.yaml"


class ConfigError(RuntimeError):
    """必須の設定が欠けているときに送出."""


@dataclass
class Settings:
    """実行時に必要な認証情報とパラメータ."""

    ig_user_id: str
    access_token: str
    graph_api_version: str
    public_media_base_url: str
    anthropic_api_key: str
    content_model: str

    @property
    def has_ai(self) -> bool:
        return bool(self.anthropic_api_key)


def _require(name: str, value: str | None) -> str:
    if not value:
        raise ConfigError(
            f"環境変数 {name} が未設定です。.env.example を参考に設定してください。"
        )
    return value


def load_settings(env_file: str | os.PathLike[str] | None = None) -> Settings:
    """環境変数（および .env）から認証情報を読み込む."""
    if load_dotenv is not None:
        # 明示指定があればそれを、なければリポジトリ直下の .env を読む
        load_dotenv(env_file or (REPO_ROOT / ".env"), override=False)

    return Settings(
        ig_user_id=_require("IG_USER_ID", os.getenv("IG_USER_ID")),
        access_token=_require("IG_ACCESS_TOKEN", os.getenv("IG_ACCESS_TOKEN")),
        graph_api_version=os.getenv("GRAPH_API_VERSION", "v21.0"),
        public_media_base_url=os.getenv("PUBLIC_MEDIA_BASE_URL", "").rstrip("/"),
        anthropic_api_key=os.getenv("ANTHROPIC_API_KEY", ""),
        content_model=os.getenv("CONTENT_MODEL", "claude-sonnet-5"),
    )


def load_config(path: str | os.PathLike[str] | None = None) -> dict[str, Any]:
    """config.yaml（無ければ config.example.yaml）を読み込む."""
    config_path = Path(path) if path else DEFAULT_CONFIG_PATH
    if not config_path.exists():
        config_path = EXAMPLE_CONFIG_PATH
    if not config_path.exists():
        return {}
    with open(config_path, encoding="utf-8") as f:
        return yaml.safe_load(f) or {}
