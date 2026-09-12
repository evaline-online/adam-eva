#!/usr/bin/env python3
"""Adam & Eva — CLI runner.

Usage:
  python3 cli.py "Тема для обсуждения" [--rounds 3] [--voice] [--live] [--no-synth]
  python3 cli.py                          # interactive topic prompt
"""

from __future__ import annotations

import argparse
import sys
from datetime import datetime
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

from adam_eva import Config, DialogueEngine, LlmError, Turn  # noqa: E402


def main() -> int:
    parser = argparse.ArgumentParser(prog="adam-eva", description="Adam & Eva — two-AI dialogue by text and voice")
    parser.add_argument("topic", nargs="*", default=None, help="Topic for the dialogue")
    parser.add_argument("--rounds", type=int, default=None, help="Number of dialogue rounds (1-9)")
    parser.add_argument("--lang", default=None, help="Dialogue language: ru | uk | en | pl | ro | de")
    parser.add_argument("--voice", action="store_true", help="Also speak each reply aloud via Edge-TTS")
    parser.add_argument("--live", action="store_true", help="Play audio immediately after each reply")
    parser.add_argument("--no-voice", action="store_true", help="Disable voice entirely (overrides config)")
    parser.add_argument("--no-synth", action="store_true", help="Skip the joint-arbiter conclusion")
    args = parser.parse_args()

    cfg = Config()
    if args.lang:
        cfg.data["language"] = args.lang
    if args.no_voice:
        cfg.data["voice"]["enabled"] = False
    elif args.voice or args.live:
        cfg.data["voice"]["enabled"] = True
    if args.live:
        cfg.data["voice"]["speak_live"] = True

    topic = " ".join(args.topic).strip() if args.topic else None
    if not topic:
        topic = input("Тема для обсуждения Адама и Евы > ").strip()
    if not topic:
        print("Пустая тема. Выход.")
        return 1

    engine = DialogueEngine(cfg)
    effective_rounds = cfg.rounds if args.rounds is None else max(1, min(int(args.rounds), 9))
    print()
    print(f"Тема: {topic}")
    print(f"Язык: {cfg.language} | Раунды: {effective_rounds} | Начинает: {cfg.opener}")
    print("-" * 72)

    out_dir = cfg.audio_dir
    out_dir.mkdir(parents=True, exist_ok=True)
    stamp = datetime.now().strftime("%Y%m%d-%H%M%S")
    clips: list[tuple[str, Path]] = []
    voice_enabled = bool(cfg.voice.get("enabled"))
    live_enabled = bool(cfg.voice.get("speak_live"))

    def on_turn(turn: Turn) -> None:
        print()
        print(f"▶ {turn.speaker} (Round {turn.round}) — {turn.duration_ms} ms")
        print(turn.content)
        sys.stdout.flush()
        if not voice_enabled:
            return
        from adam_eva.voice import synthesize_turn

        out_path = out_dir / f"adam-eva_{stamp}_{turn.round:02d}_{turn.persona.id}.mp3"
        try:
            synthesize_turn(cfg, turn.persona, turn.content, out_path, speak_after=live_enabled)
            clips.append((f"{turn.speaker} (Round {turn.round})", out_path))
        except Exception as exc:  # noqa: BLE001
            print(f"[voice error: {exc}]")

    try:
        result = engine.run(topic, rounds=args.rounds, on_turn=on_turn, with_synthesis=not args.no_synth)
    except LlmError as exc:
        print(f"\n[llm error] {exc}")
        return 2

    if result.synthesis:
        print()
        print("=" * 72)
        print("▶ Совместный вывод арбитра")
        print("=" * 72)
        print(result.synthesis)
        print()

    from adam_eva.transcript import save_transcript

    transcript_path = save_transcript(cfg, result)
    print(f"Стенограмма: {transcript_path}")
    if clips:
        print("Аудио:")
        for label, path in clips:
            print(f"  - {label}: {path}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())