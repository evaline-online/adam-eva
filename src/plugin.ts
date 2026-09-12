/**
 * AdamEvaPlugin — the adam-eva capability exposed as a self-contained plugin.
 *
 * Hosts (evaline-chat, evabot-backend, ConsiliumPlugin-style managers) register
 * it via their Plugin API; it wires the AdamEvaEngine to commands and HTTP
 * routes without importing host code.
 */

import { AdamEvaEngine } from './engine.ts';
import type { AdamEvaEngineDeps } from './engine.ts';
import type { AdamEvaMode, AdamEvaOrdering, AdamEvaResult } from './types.ts';
import type { Plugin, PluginContext, PluginManifest } from './plugin-contract.ts';

export interface AdamEvaPluginOptions {
  engine?: AdamEvaEngine;
  engineDeps?: AdamEvaEngineDeps;
  defaultMode?: AdamEvaMode;
  defaultOrdering?: AdamEvaOrdering;
  defaultRounds?: number;
}

export interface AdamEvaRequest {
  topic: string;
  mode?: AdamEvaMode;
  ordering?: AdamEvaOrdering;
  rounds?: number;
  language?: string;
}

const ADAM_EVA_VERSION = '2.0.0';

export class AdamEvaPlugin implements Plugin {
  public readonly manifest: PluginManifest;
  private readonly engine: AdamEvaEngine;
  private defaultOrdering: AdamEvaOrdering;
  private defaultRounds: number;
  private ctx?: PluginContext;

  constructor(opts: AdamEvaPluginOptions = {}) {
    this.engine = opts.engine ?? new AdamEvaEngine(opts.engineDeps ?? {});
    this.defaultOrdering = opts.defaultOrdering ?? 'eva-adam';
    this.defaultRounds = opts.defaultRounds ?? 3;

    this.manifest = {
      id: 'adam-eva',
      name: 'Adam & Eva Deliberation',
      version: ADAM_EVA_VERSION,
      description:
        'Two-AI deliberation plugin: Eva (frontend/UX/brand) and Adam (backend/production/security) discuss or interview on a given topic, with optional Edge-TTS voice and joint-arbiter synthesis.',
      author: 'eva-line',
      enabled: true,
      category: 'ai',
    };
  }

  public async initialize(ctx: PluginContext): Promise<void> {
    this.ctx = ctx;

    if (typeof ctx.config?.default_rounds === 'number') {
      this.defaultRounds = Math.max(1, Math.min(Math.round(ctx.config.default_rounds), 9));
    }
    if (typeof ctx.config?.default_ordering === 'string' && (ctx.config.default_ordering === 'eva-adam' || ctx.config.default_ordering === 'adam-eva')) {
      this.defaultOrdering = ctx.config.default_ordering;
    }

    ctx.registerCommand('adam-eva', (args: string) => this.handleCommand(args), 'Run the Adam-Eva deliberation: /adam-eva <topic> [mode=dialogue|interview] [ordering=eva-adam|adam-eva]');
    ctx.registerCommand('adam', (args: string) => this.handleCommand(args), 'Alias for /adam-eva');
    ctx.registerCommand('interview', (args: string) => this.handleCommand(`--mode interview ${args}`), 'Run an Adam-Eva interview: /interview <topic>');

    ctx.registerRoute('POST', '/api/adam-eva', async (params: { body?: unknown }) => {
      const request = parseRequest(params.body);
      return this.run(request);
    });

    ctx.logger?.info?.(`[adam-eva] plugin "${this.manifest.id}" initialized (mode, ordering configurable per request).`);
  }

  public async shutdown(): Promise<void> {
    this.ctx = undefined;
  }

  public async healthCheck(): Promise<{ status: 'healthy' | 'degraded' | 'down'; message?: string }> {
    return { status: 'healthy', message: 'Adam-Eva engine ready.' };
  }

  public setDefaultOrdering(ordering: AdamEvaOrdering): void {
    this.defaultOrdering = ordering;
  }

  public getDefaultOrdering(): AdamEvaOrdering {
    return this.defaultOrdering;
  }

  public async run(request: AdamEvaRequest): Promise<AdamEvaResult> {
    if (!request || typeof request.topic !== 'string' || !request.topic.trim()) {
      throw new Error('AdamEvaPlugin: "topic" is required (non-empty string).');
    }
    return this.engine.run({
      mode: request.mode ?? 'dialogue',
      ordering: request.ordering ?? this.defaultOrdering,
      prompt: request.topic.trim(),
      rounds: request.rounds ?? this.defaultRounds,
      language: request.language,
    });
  }

  private async handleCommand(args: string): Promise<string> {
    const parsed = parseRequestArgs(args);
    const result = await this.run(parsed);
    return formatResult(result);
  }
}

function parseRequest(body: unknown): AdamEvaRequest {
  if (typeof body !== 'object' || body === null) return { topic: '' };
  const record = body as Record<string, unknown>;
  return {
    topic: typeof record.topic === 'string' ? record.topic : '',
    mode: record.mode === 'interview' ? 'interview' : record.mode === 'dialogue' ? 'dialogue' : undefined,
    ordering: record.ordering === 'adam-eva' ? 'adam-eva' : record.ordering === 'eva-adam' ? 'eva-adam' : undefined,
    rounds: typeof record.rounds === 'number' ? record.rounds : undefined,
    language: typeof record.language === 'string' ? record.language : undefined,
  };
}

function parseRequestArgs(args: string): AdamEvaRequest {
  const pieces = args.trim().split(/\s+/).filter(Boolean);
  const request: AdamEvaRequest = { topic: '' };
  const flags: string[] = [];
  for (let i = 0; i < pieces.length; i += 1) {
    const piece = pieces[i];
    if (piece === '--mode' || piece === '--ordering' || piece === '--rounds' || piece === '--lang') {
      flags.push(piece, pieces[i + 1] ?? '');
      i += 1;
    } else {
      request.topic = request.topic ? `${request.topic} ${piece}` : piece;
    }
  }
  request.topic = request.topic.trim();
  for (let i = 0; i < flags.length; i += 2) {
    const key = flags[i];
    const value = flags[i + 1];
    if (key === '--mode' && (value === 'interview' || value === 'dialogue')) request.mode = value;
    else if (key === '--ordering' && (value === 'eva-adam' || value === 'adam-eva')) request.ordering = value;
    else if (key === '--rounds') {
      const num = Number(value);
      if (Number.isFinite(num)) request.rounds = num;
    } else if (key === '--lang') request.language = value;
  }
  return request;
}

export function formatResult(result: AdamEvaResult): string {
  const lines: string[] = ['', `Mode: ${result.mode} | Ordering: ${result.ordering} | Rounds: ${result.rounds}`, '-'.repeat(72)];
  for (const turn of result.turns) {
    lines.push(`», ${turn.name} (Round ${turn.round}, ${turn.kind}):`);
    lines.push(turn.content);
    lines.push('');
  }
  if (result.synthesis) {
    lines.push('-'.repeat(72));
    lines.push('Arbiter:');
    lines.push(result.synthesis);
  }
  return lines.join('\n');
}