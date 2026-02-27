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

    # Optional S3-compatible object storage (Cloudflare R2, AWS S3, etc.)
    R2_ENDPOINT: str = ""
    R2_BUCKET: str = ""
    R2_ACCESS_KEY_ID: str = ""
    R2_SECRET_ACCESS_KEY: str = ""
    R2_REGION: str = "auto"

    # SMTP + password reset
    EMAIL_PROVIDER: str = "smtp"  # smtp | brevo
    SMTP_HOST: str = ""
    SMTP_PORT: int = 587
    SMTP_USERNAME: str = ""
    SMTP_PASSWORD: str = ""
    SMTP_USE_TLS: bool = True
    SMTP_USE_SSL: bool = False
    SMTP_FROM_EMAIL: str = ""
    BREVO_API_KEY: str = ""
    BREVO_API_URL: str = "https://api.brevo.com/v3/smtp/email"
    BREVO_FROM_EMAIL: str = ""
    BREVO_FROM_NAME: str = "Smart Planning Calendar"
    FRONTEND_BASE_URL: str = "http://localhost:5173"
    PASSWORD_RESET_TOKEN_EXPIRE_MINUTES: int = 60

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

    @property
    def r2_enabled(self) -> bool:
        return bool(
            self.R2_ENDPOINT
            and self.R2_BUCKET
            and self.R2_ACCESS_KEY_ID
            and self.R2_SECRET_ACCESS_KEY
        )


settings = Settings()
