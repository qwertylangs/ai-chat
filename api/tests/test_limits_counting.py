from openai.types import CompletionUsage

from app.limits.counting import TokenCount, count_tokens


def test_uses_provider_usage_when_present():
    usage = CompletionUsage(prompt_tokens=10, completion_tokens=5, total_tokens=15)

    assert count_tokens(usage, [{"role": "user", "content": "x" * 400}], "y", 4) == TokenCount(10, 5, 15)


def test_estimates_by_chars_without_usage():
    history = [{"role": "user", "content": "a" * 40}, {"role": "assistant", "content": "b" * 20}]

    assert count_tokens(None, history, "c" * 8, 4) == TokenCount(prompt=15, completion=2, total=17)
