from dataclasses import dataclass

from openai.types import CompletionUsage


@dataclass(frozen=True)
class TokenCount:
    prompt: int
    completion: int
    total: int


def count_tokens(
    usage: CompletionUsage | None, history: list[dict], reply: str, chars_per_token: int
) -> TokenCount:
    """Токены из usage провайдера; без него — оценка по числу символов."""
    if usage:
        return TokenCount(usage.prompt_tokens, usage.completion_tokens, usage.total_tokens)
    prompt = sum(len(m["content"]) for m in history) // chars_per_token
    completion = len(reply) // chars_per_token
    return TokenCount(prompt, completion, prompt + completion)
