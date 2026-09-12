"""Adam & Eva — two-persona dialogue engine over K rounds with optional synthesis."""

from __future__ import annotations

import time
from dataclasses import dataclass, field
from typing import Callable

from .config import Config
from .llm import LlmClient
from .personas import ADAM, DUAL_SYNTHESIZER_PROMPT, EVA, Persona


@dataclass
class Turn:
    round: int
    persona: Persona
    content: str
    duration_ms: int = 0

    @property
    def speaker(self) -> str:
        return self.persona.name


@dataclass
class DialogueResult:
    topic: str
    turns: list[Turn] = field(default_factory=list)
    synthesis: str = ""
    duration_ms: int = 0

    @property
    def lines(self) -> list[tuple[str, str]]:
        return [(t.speaker, t.content) for t in self.turns]


class DialogueEngine:
    def __init__(self, cfg: Config, llm: LlmClient | None = None) -> None:
        self.cfg = cfg
        self.llm = llm or LlmClient(cfg)

    def _lang_directive(self, persona: Persona) -> str:
        lang = self.cfg.language
        names = {
            "ru": "Russian (русский)",
            "uk": "Ukrainian (українська)",
            "en": "English",
            "pl": "Polish (polski)",
            "ro": "Romanian (română)",
            "de": "German (Deutsch)",
        }
        human = names.get(lang, names["ru"])
        return (
            f"Respond strictly in {human}. Address your counterpart by name. No markdown headlines, "
            "no bullet lists — write flowing conversational prose of 2-4 short paragraphs, as in a live spoken "
            "debate between two AI colleagues. Keep your identity locked (female/male first person as defined)."
        )

    def _eval_prompt(self, persona: Persona, counterpart: Persona, role: str) -> str:
        system_prompt = (
            f"{persona.system_prompt}\n\n{self._lang_directive(persona)}\n\n"
            f"You are in a live dialogue with {counterpart.name} ({counterpart.title}). {role}"
        )
        return system_prompt

    def _synth_directive(self) -> str:
        lang = self.cfg.language
        names = {
            "ru": "Russian (русский)",
            "uk": "Ukrainian (українська)",
            "en": "English",
            "pl": "Polish (polski)",
            "ro": "Romanian (română)",
            "de": "German (Deutsch)",
        }
        return (
            f"Respond strictly in {names.get(lang, names['ru'])}.\n"
            "You are a NEUTRAL moderator — never impersonate Eva or Adam, never use first person. "
            "Refer to the debaters as \u201cEva\u201d and \u201cAdam\u201d in third person.\n"
            "Use exactly three short sections:\n"
            "**1. Consensus** — where Eva and Adam agreed.\n"
            "**2. Trade-offs** — open disagreements and edge cases.\n"
            "**3. Recommendation** — a single concrete proposal, with cost impact in USD ($) or EUR (\u20ac) where relevant."
        )

    def _run_one(self, persona: Persona, counterpart: Persona, user_prompt: str, role: str) -> Turn:
        started = time.monotonic()
        content = self.llm.generate(
            self.cfg.llm["model_" + persona.id],
            self._eval_prompt(persona, counterpart, role),
            user_prompt,
        )
        return Turn(round=0, persona=persona, content=content, duration_ms=int((time.monotonic() - started) * 1000))

    def run(
        self,
        topic: str,
        rounds: int | None = None,
        on_turn: Callable[[Turn], None] | None = None,
        with_synthesis: bool = True,
    ) -> DialogueResult:
        total_rounds = self.cfg.rounds if rounds is None else max(1, min(int(rounds), 9))
        result = DialogueResult(topic=topic)
        started = time.monotonic()
        history: list[str] = []

        opener_id = self.cfg.opener
        first, second = (EVA, ADAM) if opener_id == "eva" else (ADAM, EVA)

        for rnd in range(1, total_rounds + 1):
            for is_opener in (True, False):
                persona = first if is_opener else second
                counterpart = second if is_opener else first

                if rnd == 1 and is_opener:
                    user_prompt = (
                        f"Topic for discussion (given by a human):\n\"{topic}\"\n\n"
                        f"{persona.opening_rule}"
                    )
                else:
                    last = history[-1] if history else "(still awaiting the first reply)"
                    user_prompt = (
                        f"Topic for discussion (given by a human):\n\"{topic}\"\n\n"
                        f"{counterpart.name} just said:\n{last}\n\n"
                        f"Respond directly to what {counterpart.name} said: sharpen the argument, "
                        "agree or disagree with concrete reasoning, and advance the joint analysis. "
                        "Do not repeat the full topic."
                    )

                turn = self._run_one(persona, counterpart, user_prompt, "advance the discussion")
                turn.round = rnd
                history.append(f"[{persona.name}]: {turn.content}")
                result.turns.append(turn)
                if on_turn:
                    on_turn(turn)

        if with_synthesis:
            try:
                transcript = "\n\n".join(history)
                result.synthesis = self.llm.generate(
                    self.cfg.llm.get("model_synthesizer") or self.cfg.llm["model_adam"],
                    DUAL_SYNTHESIZER_PROMPT + "\n\n" + self._synth_directive(),
                    f"Dialogue transcript on topic:\n\"{topic}\"\n\n{transcript}",
                    temperature=0.3,
                    max_tokens=max(self.cfg.llm.get("max_tokens", 700), 500),
                )
            except Exception as exc:  # noqa: BLE001
                result.synthesis = f"[Synthesis skipped: {exc}]"

        result.duration_ms = int((time.monotonic() - started) * 1000)
        return result