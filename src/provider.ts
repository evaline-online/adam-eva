/**
 * AdamEvaProvider — exposes the AdamEvaEngine under the evaline-chat
 * AgentProvider structural contract (see evaline-chat/src/core/ChatEngine.ts),
 * so hosts can register it as a chat provider bot (bot:adam-eva) without
 * importing evaline-chat itself.
 */

import { AdamEvaEngine } from './engine.ts';
import type { AdamEvaEngineDeps } from './engine.ts';
import type { AdamEvaMode, AdamEvaOrdering, AdamEvaProviderLike, Turn } from './types.ts';

export interface AdamEvaProviderOptions {
  engine?: AdamEvaEngine;
  engineDeps?: AdamEvaEngineDeps;
  defaultMode?: AdamEvaMode;
  defaultOrdering?: AdamEvaOrdering;
  defaultRounds?: number;
  defaultLanguage?: string;
}

export class AdamEvaProvider implements AdamEvaProviderLike {
  readonly id = 'adam-eva';
  readonly name = 'Adam & Eva Deliberation';
  private readonly engine: AdamEvaEngine;
  private mode: AdamEvaMode;
  private ordering: AdamEvaOrdering;
  private rounds: number;
  private language?: string;

  constructor(opts: AdamEvaProviderOptions = {}) {
    this.engine = opts.engine ?? new AdamEvaEngine(opts.engineDeps ?? {});
    this.mode = opts.defaultMode ?? 'dialogue';
    this.ordering = opts.defaultOrdering ?? 'eva-adam';
    this.rounds = opts.defaultRounds ?? 3;
    this.language = opts.defaultLanguage;
  }

  public getMode(): AdamEvaMode {
    return this.mode;
  }

  public setMode(mode: string): void {
    if (mode === 'interview' || mode === 'dialogue') {
      this.mode = mode;
    }
  }

  public setOrdering(ordering: AdamEvaOrdering): void {
    this.ordering = ordering;
  }

  public getOrdering(): AdamEvaOrdering {
    return this.ordering;
  }

  public getRounds(): number {
    return this.rounds;
  }

  public setRounds(rounds: number): void {
    this.rounds = Math.max(1, Math.min(Math.round(rounds), 9));
  }

  public async send(input: { readonly sessionId: string; readonly text: string; readonly history?: readonly unknown[] }): Promise<{ readonly content: string; readonly mode?: string; readonly turns?: Turn[] }> {
    const result = await this.engine.run({
      mode: this.mode,
      ordering: this.ordering,
      prompt: input.text,
      rounds: this.rounds,
      language: this.language,
    });
    const fallback = result.turns.at(-1)?.content;
    return {
      content: result.synthesis ?? fallback ?? 'No output produced.',
      mode: result.mode,
      turns: result.turns,
    };
  }
}