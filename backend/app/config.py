from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        case_sensitive=True,
    )

    APP_ENV: str = "development"  # development | production

    DATABASE_URL: str = "postgresql+psycopg2://calendar_user:calendar_pass@localhost:5432/calendar"
    JWT_SECRET: str = "CHANGE_THIS_TO_A_LONG_RANDOM_STRING"
    JWT_ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 60 * 24

    CORS_ORIGINS: str = "http://localhost:1420,http://127.0.0.1:1420,http://localhost:5173,http://127.0.0.1:5173"
    TRUSTED_HOSTS: str = "localhost,127.0.0.1"

    ENABLE_AUTO_SCHEMA_CREATE: bool = True
    ALLOW_CREATE_FIRST_ADMIN: bool = True
    FIRST_ADMIN_BOOTSTRAP_TOKEN: str = ""

    AVATAR_MAX_BYTES: int = 5 * 1024 * 1024
    PROFILE_DOC_MAX_BYTES: int = 10 * 1024 * 1024
    LIBRARY_DOC_MAX_BYTES: int = 20 * 1024 * 1024

    def list_from_csv(self, value: str) -> list[str]:
        return [x.strip() for x in (value or "").split(",") if x.strip()]

    @property
    def cors_origins_list(self) -> list[str]:
        return self.list_from_csv(self.CORS_ORIGINS)

    @property
    def trusted_hosts_list(self) -> list[str]:
        return self.list_from_csv(self.TRUSTED_HOSTS)

    @property
    def is_production(self) -> bool:
        return self.APP_ENV.lower() == "production"


settings = Settings()
