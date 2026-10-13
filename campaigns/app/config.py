import os
from dataclasses import dataclass
from pathlib import Path

SERVICE_DIR = Path(__file__).resolve().parent.parent


@dataclass(frozen=True)
class Settings:
    token_secret: str
    internal_token: str
    data_dir: Path
    assets_url: str
    review_url: str
    brand_url: str
    rights_url: str
    http_timeout: float = 5.0

    @property
    def db_path(self) -> Path:
        return self.data_dir / "campaigns.db"


def load_settings() -> Settings:
    data_dir = Path(os.environ.get("DATA_DIR", "./data"))
    if not data_dir.is_absolute():
        data_dir = SERVICE_DIR / data_dir
    return Settings(
        token_secret=os.environ.get("TOKEN_SECRET", "dev-secret-change-me"),
        internal_token=os.environ.get("INTERNAL_TOKEN", "dev-internal-token"),
        data_dir=data_dir,
        assets_url=os.environ.get("ASSETS_URL", "http://localhost:8082").rstrip("/"),
        review_url=os.environ.get("REVIEW_URL", "http://localhost:8084").rstrip("/"),
        brand_url=os.environ.get("BRAND_URL", "http://localhost:8085").rstrip("/"),
        rights_url=os.environ.get("RIGHTS_URL", "http://localhost:8087").rstrip("/"),
    )
