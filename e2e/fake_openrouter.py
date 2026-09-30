"""Стаб OpenRouter для e2e: отдаёт фиксированный ответ SSE-чанками в формате OpenAI."""

import json
import time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

PORT = 8931
REPLY = "Это ответ стаба OpenRouter."
TOTAL_TOKENS = 300  # e2e: TOKEN_LIMIT=1000 → лимит кончается после 4-го ответа


def chunk(content: str) -> dict:
    return {
        "id": "chatcmpl-stub",
        "object": "chat.completion.chunk",
        "created": int(time.time()),
        "model": "stub/model",
        "choices": [{"index": 0, "delta": {"content": content}, "finish_reason": None}],
    }


class Handler(BaseHTTPRequestHandler):
    def do_GET(self):  # проба готовности от Playwright
        self.send_response(200)
        self.end_headers()
        self.wfile.write(b"ok")

    def do_POST(self):
        self.rfile.read(int(self.headers.get("Content-Length", 0)))
        self.send_response(200)
        self.send_header("Content-Type", "text/event-stream")
        self.end_headers()
        for i, word in enumerate(REPLY.split()):
            text = word if i == 0 else " " + word
            self.wfile.write(f"data: {json.dumps(chunk(text))}\n\n".encode())
            self.wfile.flush()
        usage = {**chunk(""), "choices": [],
                 "usage": {"prompt_tokens": 200, "completion_tokens": 100, "total_tokens": TOTAL_TOKENS}}
        self.wfile.write(f"data: {json.dumps(usage)}\n\n".encode())
        self.wfile.write(b"data: [DONE]\n\n")
        self.wfile.flush()

    def log_message(self, *args):
        pass


if __name__ == "__main__":
    ThreadingHTTPServer(("127.0.0.1", PORT), Handler).serve_forever()
