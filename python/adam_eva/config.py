"""Adam & Eva — module config loader with environment overrides."""

from __future__ import annotations

import json
import os
from copy import deepcopy
from pathlib import Path

DEFAULT_CONFIG_PATH = Path(__file__).resolve().parent.parent / "config.json"

DEFAULTS = {
    "language": "ru",
    "rounds": 3,
    "opener": "eva",
    "llm": {
        "base_url": "http://127.0.0.1:20128/v1",
        "api_key": "omniroute-token",
        "model_eva": "omni/cf-mistral-small-3.1",
        "model_adam": "omni/cf-qwen2.5-coder-32b",
        "model_synthesizer": "omni/cf-llama-3.3-70b",
        "temperature": 0.7,
        "max_tokens": 700,
    },
    "voice": {
        "enabled": False,
        "speak_live": False,
        "save_audio": True,
        "rate": "+0%",
        "volume": "+0%",
        "voices": {
            "ru": {"eva": "ru-RU-SvetlanaNeural", "adam": "ru-RU-DmitryNeural"},
            "uk": {"eva": "uk-UA-PolinaNeural", "adam": "uk-UA-OstapNeural"},
            "en": {"eva": "en-US-AriaNeural", "adam": "en-US-GuyNeural"},
        },
    },
    "transcripts_dir": "transcripts",
    "audio_dir": "audio",
}


def _deep_key(data: dict, key: str, default):
    cur = data
    for part in key.split("."):
        if not isinstance(cur, dict) or part not in cur:
            return default
        cur = cur[part]
    return cur


class Config:
    def __init__(self, path: str | Path = DEFAULT_CONFIG_PATH) -> None:
        self.path = Path(path)
        self.data = deepcopy(DEFAULTS)
        if self.path.exists():
            try:
                with open(self.path, encoding="utf-8") as fh:
                    self.merge(self.data, json.load(fh))
            except json.JSONDecodeError:
                pass
        self.apply_env()

    @staticmethod
    def merge(base: dict, override: dict) -> None:
        for key, value in override.items():
            if isinstance(value, dict) and isinstance(base.get(key), dict):
                Config.merge(base[key], value)
            else:
                base[key] = value

    def apply_env(self) -> None:
        env = os.environ
        if env.get("ADAM_EVA_LANGUAGE"):
            self.data["language"] = env["ADAM_EVA_LANGUAGE"]
        for key in ("LLM_BASE_URL", "LLM_API_KEY", "MODEL_EVA", "MODEL_ADAM", "MODEL_SYNTH", "ROUNDS"):
            env_key = f"ADAM_EVA_{key}"
            if env.get(env_key):
                self.data["llm"][key.lower()] = env[env_key] if key != "LLM_BASE_URL" else env[env_key]
        if env.get("ADAM_EVA_ROUNDS"):
            self.data["rounds"] = int(env["ADAM_EVA_ROUNDS"])

    @property
    def language(self) -> str:
        return str(self.data.get("language", "ru"))

    @property
    def rounds(self) -> int:
        return max(1, min(int(self.data.get("rounds", 3)), 9))

    @property
    def opener(self) -> str:
        return str(self.data.get("opener", "eva"))

    @property
    def llm(self) -> dict:
        return self.data.get("llm", {})

    @property
    def voice(self) -> dict:
        return self.data.get("voice", {})

    @property
    def transcripts_dir(self) -> Path:
        return Path(self.data.get("transcripts_dir", "transcripts"))

    @property
    def audio_dir(self) -> Path:
        return Path(self.data.get("audio_dir", "audio"))