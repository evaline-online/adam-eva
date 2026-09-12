"""adam_eva — two AI personalities (Adam & Eva) debating any topic by text and voice.

Standalone module. The user passes a topic; Eva (frontend/UX/brand) and Adam
(backend/production/security) discuss it over several rounds in their assigned
roles, optionally speaking via Edge-TTS and saving a markdown transcript.
"""

from .config import Config
from .dialogue import DialogueEngine, DialogueResult, Turn
from .llm import LlmClient, LlmError
from .personas import ADAM, EVA, Persona

__all__ = [
    "Config",
    "DialogueEngine",
    "DialogueResult",
    "Turn",
    "LlmClient",
    "LlmError",
    "ADAM",
    "EVA",
    "Persona",
]

__version__ = "1.0.0"