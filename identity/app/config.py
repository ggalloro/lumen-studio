import os
from dataclasses import dataclass
from pathlib import Path

SERVICE_DIR = Path(__file__).resolve().parent.parent


@dataclass(frozen=True)
class Settings:
    token_secret: str
    internal_token: str
    data_dir: Path
    token_ttl_hours: int = 12

    @property
    def db_path(self) -> Path:
        return self.data_dir / "users.db"


def load_settings() -> Settings:
    data_dir = Path(os.environ.get("DATA_DIR", "./data"))
    if not data_dir.is_absolute():
        data_dir = SERVICE_DIR / data_dir
    return Settings(
        token_secret=os.environ.get("TOKEN_SECRET", "dev-secret-change-me"),
        internal_token=os.environ.get("INTERNAL_TOKEN", "dev-internal-token"),
        data_dir=data_dir,
    )
