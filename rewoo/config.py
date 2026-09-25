"""Runtime configuration.

Everything has a sensible default so `python -m rewoo` works with zero setup.
Environment variables (or a `.env` file in the working directory) override defaults.
User-facing preferences (budgets, approval mode, providers...) live in the database
and are edited from the Settings screen — see `rewoo.settings`.
"""
from __future__ import annotations

import os
from dataclasses import dataclass, field
from pathlib import Path


def _load_dotenv(path: Path) -> None:
    """Tiny .env loader (no dependency). Existing env vars always win."""
    if not path.exists():
        return
    for raw in path.read_text(encoding="utf-8").splitlines():
        line = raw.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, _, value = line.partition("=")
        key = key.strip()
        value = value.strip().strip('"').strip("'")
        if key and key not in os.environ:
            os.environ[key] = value


@dataclass
class Config:
    data_dir: Path = field(default_factory=lambda: Path("data"))
    host: str = "127.0.0.1"
    port: int = 8787
    public_url: str = ""
    google_client_id: str = ""
    google_client_secret: str = ""

    @property
    def db_path(self) -> Path:
        return self.data_dir / "rewoo.db"

    @property
    def upload_dir(self) -> Path:
        return self.data_dir / "uploads"

    @property
    def base_url(self) -> str:
        return (self.public_url or f"http://{self.host}:{self.port}").rstrip("/")

    @classmethod
    def from_env(cls, env_file: str = ".env") -> "Config":
        _load_dotenv(Path(env_file))
        cfg = cls(
            data_dir=Path(os.environ.get("REWOO_DATA_DIR", "data")),
            host=os.environ.get("REWOO_HOST", "127.0.0.1"),
            port=int(os.environ.get("REWOO_PORT", "8787")),
            public_url=os.environ.get("REWOO_PUBLIC_URL", ""),
            google_client_id=os.environ.get("GOOGLE_CLIENT_ID", ""),
            google_client_secret=os.environ.get("GOOGLE_CLIENT_SECRET", ""),
        )
        cfg.data_dir.mkdir(parents=True, exist_ok=True)
        cfg.upload_dir.mkdir(parents=True, exist_ok=True)
        return cfg
