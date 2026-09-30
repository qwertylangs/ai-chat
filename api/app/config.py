from pydantic import NonNegativeInt, PositiveInt
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """Настройки приложения. Читаются из переменных окружения и файла .env (в корне api/)."""

    openrouter_api_key: str = "sk-or-v1-mock-key"
    openrouter_base_url: str = "https://openrouter.ai/api/v1"  # e2e подменяют на стаб
    openrouter_model: str = "openai/gpt-4o"
    http_referer: str = "http://localhost:5173"  # HTTP-Referer для OpenRouter
    site_title: str = "ai-chat"                  # X-Title для OpenRouter

    jwt_secret: str = "dev-secret-please-change"
    jwt_expire_minutes: int = 60 * 24 * 7  # 7 дней, без refresh-логики

    database_url: str = "sqlite:///./chat.db"

    token_limit: NonNegativeInt = 1000  # на пользователя за окно; маленький, чтобы ловить за 2-3 промпта
    token_limit_period_minutes: PositiveInt = 1440  # 1440 → сброс в 00:00 UTC
    token_estimate_chars_per_token: PositiveInt = 4  # если провайдер не вернул usage

    model_config = SettingsConfigDict(env_file=".env")


settings = Settings()