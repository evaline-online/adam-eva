"""Adam & Eva — markdown transcript storage."""

from __future__ import annotations

from datetime import datetime
from pathlib import Path

from .config import Config
from .dialogue import DialogueResult


def slug(text: str, limit: int = 48) -> str:
    keep = "".join(ch if ch.isalnum() or ch in "-_" else " " for ch in text).strip()
    words = keep.split()
    return "-".join(words[:8]).lower()[:limit] or "topic"


def save_transcript(cfg: Config, result: DialogueResult) -> Path:
    out_dir = cfg.transcripts_dir
    out_dir.mkdir(parents=True, exist_ok=True)
    stamp = datetime.now().strftime("%Y%m%d-%H%M%S")
    name = f"adam-eva_{stamp}_{slug(result.topic)}.md"
    path = out_dir / name

    esc = lambda text: text.replace("[", "\\[").replace("]", "\\]").replace("|", "\\|")  # noqa: E731
    lines = [
        "# Adam & Eva — Dialogue",
        "",
        f"**Topic:** {result.topic}",
        f"**Date:** {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}",
        f"**Rounds:** {max(t.round for t in result.turns) if result.turns else 0}",
        f"**Duration:** {result.duration_ms / 1000:.1f} s",
        "",
        "---",
        "",
    ]
    for t in result.turns:
        lines.append(f"## Round {t.round} — {t.speaker} (*{t.persona.title}*)")
        lines.append("")
        lines.append(esc(t.content))
        lines.append("")

    if result.synthesis:
        lines.append("---")
        lines.append("")
        lines.append("## Joint Conclusion (Arbiter)")
        lines.append("")
        lines.append(esc(result.synthesis))
        lines.append("")

    path.write_text("\n".join(lines), encoding="utf-8")
    return path