#!/usr/bin/env python3
"""Adam & Eva — Edge-TTS voice bridge.

Reads a JSON payload on stdin:
    {"text": "...", "voice": "ru-RU-SvetlanaNeural",
     "rate": "+0%", "volume": "+0%", "out_path": "/abs/path.mp3"}
and synthesizes the text into out_path using Microsoft Edge-TTS (free, no keys).

Used by the TypeScript adam-eva plugin via `src/voice.ts`. Exit code 0 on success.
"""

from __future__ import annotations

import asyncio
import json
import sys
from pathlib import Path

import edge_tts


async def synthesize(payload: dict) -> None:
    text = str(payload.get("text", "")).strip()
    if not text:
        raise ValueError("Empty 'text' field.")
    voice = str(payload.get("voice", "ru-RU-SvetlanaNeural"))
    rate = str(payload.get("rate", "+0%"))
    volume = str(payload.get("volume", "+0%"))
    out_path = Path(str(payload.get("out_path", "")))
    if not out_path.name:
        raise ValueError("Empty 'out_path' field.")
    out_path.parent.mkdir(parents=True, exist_ok=True)
    communicator = edge_tts.Communicate(text, voice=voice, rate=rate, volume=volume)
    await communicator.save(str(out_path))


def main() -> int:
    try:
        raw = sys.stdin.read() or "{}"
        payload = json.loads(raw)
        asyncio.run(synthesize(payload))
        return 0
    except Exception as exc:  # noqa: BLE001
        print(f"[voice-bridge] error: {exc}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())