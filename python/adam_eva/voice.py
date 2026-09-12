"""Adam & Eva — voice output via Microsoft Edge-TTS (free, no keys)."""

from __future__ import annotations

import asyncio
import shutil
import subprocess
import tempfile
from pathlib import Path

from .config import Config
from .personas import Persona


def voice_for(cfg: Config, persona: Persona) -> str:
    lang = cfg.language
    table = cfg.voice.get("voices", {}).get(lang) or cfg.voice.get("voices", {}).get("ru") or {}
    return table.get(persona.id) or ("ru-RU-SvetlanaNeural" if persona.id == "eva" else "ru-RU-DmitryNeural")


def _rate(cfg: Config) -> str:
    return str(cfg.voice.get("rate", "+0%"))


def _volume(cfg: Config) -> str:
    return str(cfg.voice.get("volume", "+0%"))


async def _synthesize_async(cfg: Config, persona: Persona, text: str, out_path: Path) -> None:
    import edge_tts

    await edge_tts.Communicate(text, voice=voice_for(cfg, persona), rate=_rate(cfg), volume=_volume(cfg)).save(str(out_path))


def speak_to_file(cfg: Config, persona: Persona, text: str, out_path: Path) -> Path:
    asyncio.run(_synthesize_async(cfg, persona, text, out_path))
    return out_path


def _play(path: Path) -> None:
    player = shutil.which("ffplay") or shutil.which("mpv") or shutil.which("afplay")
    if not player:
        return
    if Path(player).name == "ffplay":
        subprocess.run([player, "-nodisp", "-autoexit", "-loglevel", "quiet", str(path)], check=False)
    else:
        subprocess.run([player, str(path)], check=False)


def speak_live(cfg: Config, persona: Persona, text: str) -> None:
    with tempfile.TemporaryDirectory() as tmp:
        file_path = Path(tmp) / "turn.mp3"
        speak_to_file(cfg, persona, text, file_path)
        _play(file_path)


def synthesize_turn(cfg: Config, persona: Persona, text: str, out_path: Path, speak_after: bool = False) -> Path:
    speak_to_file(cfg, persona, text, out_path)
    if speak_after:
        _play(out_path)
    return out_path