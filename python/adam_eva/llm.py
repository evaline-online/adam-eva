"""Adam & Eva — LLM client (OpenAI-compatible: OmniRoute LiteLLM daemon / OpenRouter)."""

from __future__ import annotations

import json
import re
from typing import Any
from urllib import error, request

from .config import Config


class LlmError(RuntimeError):
    pass


def _strip_think(text: str) -> str:
    text = re.sub(r"<thinking>.*?</thinking>", "", text, flags=re.S)
    text = re.sub(r"^<\|?start\|?>?\s*", "", text)
    return text.strip()


def _extract_content(data: dict[str, Any]) -> str:
    try:
        content = data["choices"][0]["message"]["content"]
    except (KeyError, IndexError, TypeError) as exc:
        raise LlmError(f"Malformed LLM response: {str(data)[:300]}") from exc
    if not content:
        raise LlmError(f"Empty LLM response: {str(data)[:300]}")
    return _strip_think(content)


class LlmClient:
    def __init__(self, cfg: Config, base_url: str | None = None, api_key: str | None = None) -> None:
        self.cfg = cfg
        self.base_url = (base_url or cfg.data.get("llm", {}).get("base_url") or "http://127.0.0.1:20128/v1").rstrip("/")
        self.api_key = api_key or cfg.data.get("llm", {}).get("api_key") or ""
        self.temperature = float(cfg.data.get("llm", {}).get("temperature", 0.7))
        self.max_tokens = int(cfg.data.get("llm", {}).get("max_tokens", 700))

    def generate(
        self,
        model: str,
        system_prompt: str,
        user_prompt: str,
        temperature: float | None = None,
        max_tokens: int | None = None,
    ) -> str:
        payload: dict[str, Any] = {
            "model": model,
            "temperature": self.temperature if temperature is None else temperature,
            "max_tokens": self.max_tokens if max_tokens is None else max_tokens,
            "messages": [
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": user_prompt},
            ],
        }
        body = json.dumps(payload).encode("utf-8")
        req = request.Request(
            f"{self.base_url}/chat/completions",
            data=body,
            headers={
                "Content-Type": "application/json",
                "Authorization": f"Bearer {self.api_key}",
            },
            method="POST",
        )
        try:
            with request.urlopen(req, timeout=180) as resp:
                data: dict[str, Any] = json.loads(resp.read().decode("utf-8"))
        except error.HTTPError as exc:
            detail = exc.read().decode("utf-8", errors="replace")[:400]
            raise LlmError(f"HTTP {exc.code} from {self.base_url}: {detail}") from exc
        except error.URLError as exc:
            raise LlmError(f"Cannot reach {self.base_url}: {exc.reason}") from exc
        return _extract_content(data)

    def model_for(self, persona: str) -> str:
        llm = self.cfg.data.get("llm", {})
        if persona == "adam":
            return llm.get("model_adam") or "omni/cf-qwen2.5-coder-32b"
        if persona == "synth":
            return llm.get("model_synthesizer") or "omni/cf-llama-3.3-70b"
        return llm.get("model_eva") or "omni/cf-mistral-small-3.1"