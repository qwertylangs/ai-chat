from openai import OpenAI

from app.config import settings


def build_openai_client() -> OpenAI:
    """Клиент, указывающий на OpenRouter: его API совместим с OpenAI."""
    return OpenAI(
        base_url="https://openrouter.ai/api/v1",
        api_key=settings.openrouter_api_key,
        default_headers={
            "HTTP-Referer": settings.http_referer,
            "X-Title": settings.site_title,
        },
    )