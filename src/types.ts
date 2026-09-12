/**
 * adam-eva — public type contracts.
 *
 * Self-contained (zero dependencies) so the engine and plugin can be consumed
 * by any host (evaline-chat, evabot-backend, standalone CLI) without coupling.
 */

/** Deliberation modes supported by the plugin. */
export type AdamEvaMode = 'dialogue' | 'interview';

/** Mini-LLM abstraction exposed to hosts and mocks (mirrors consilium's contract). */
export type LlmProvider = 'google' | 'omniroute' | 'openrouter' | 'opencode';

/** Ordered pair deterministically decides who leads the mode. */
/** 'eva-adam' — Eva opens a dialogue / Eva is the interviewer. */
/** 'adam-eva' — Adam opens a dialogue / Adam is the interviewer. */
export type AdamEvaOrdering = 'eva-adam' | 'adam-eva';

export type PersonaId = 'eva' | 'adam';

/** Roles a participant may play within a turn sequence. */
export type TurnKind = 'opening' | 'reply' | 'question' | 'answer';

export interface Turn {
  round: number;
  personaId: PersonaId;
  name: string;
  title: string;
  kind: TurnKind;
  content: string;
  durationMs: number;
  model: string;
}

export interface AdamEvaRunOptions {
  mode: AdamEvaMode;
  ordering?: AdamEvaOrdering;
  prompt: string;
  rounds?: number;
  language?: string;
  models?: {
    eva?: string;
    adam?: string;
    synthesizer?: string;
  };
  temperature?: number;
  maxTokens?: number;
  withSynthesis?: boolean;
  systemInstruction?: string;
  apiKey?: string;
  useStub?: boolean;
  onTurn?: (turn: Turn) => void;
  signal?: AbortSignal;
}

export interface AdamEvaResult {
  mode: AdamEvaMode;
  ordering: AdamEvaOrdering;
  prompt: string;
  rounds: number;
  turns: Turn[];
  synthesis?: string;
  durationMs: number;
}

/** Structural shape of an evaline-chat AgentProvider (see evaline-chat/src/core/ChatEngine.ts). */
export interface AdamEvaProviderLike {
  readonly id: string;
  readonly name: string;
  send(input: {
    readonly sessionId: string;
    readonly text: string;
    readonly history?: readonly unknown[];
  }): Promise<{
    readonly content: string;
    readonly mode?: string;
    readonly turns?: Turn[];
  }>;
  setMode?(mode: string): void;
}