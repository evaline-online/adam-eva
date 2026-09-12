/**
 * LLM abstraction for adam-eva.
 *
 * The engine never talks to a concrete provider — hosts (evaline-chat,
 * evabot-backend) inject their own implementation. Mirrors the LlmClient
 * contract of evaline-consilium so existing clients can be reused as-is.
 */

import type { PersonaId } from './types.ts';

export interface LlmMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface LlmGenerationOptions {
  temperature?: number;
  maxOutputTokens?: number;
  systemInstruction?: string;
  apiKey?: string;
  signal?: AbortSignal;
}

/** Minimal LLM client contract required by the AdamEvaEngine. */
export interface LlmClient {
  generateContent(
    model: string,
    messages: LlmMessage[] | string,
    options?: LlmGenerationOptions
  ): Promise<string>;
}

/**
 * Pseudo-LlmClient used when the host did not inject a real provider.
 * Emits a deterministic stub so the engine remains testable and never
 * crashes on a missing backend. Real deployments MUST pass a real client.
 */
export class StubLlmClient implements LlmClient {
  private readonly responder?: (model: string, prompt: string) => string;

  constructor(responder?: (model: string, prompt: string) => string) {
    this.responder = responder;
  }

  public async generateContent(
    model: string,
    messages: LlmMessage[] | string,
    options?: LlmGenerationOptions
  ): Promise<string> {
    const content = Array.isArray(messages)
      ? messages.map((m) => `${m.role}: ${m.content}`).join('\n')
      : messages;
    const temperature = options?.temperature ?? 0.5;
    if (this.responder) {
      return this.responder(model, content);
    }
    return (
      `[stub:${model}] Your-message: ${content.slice(0, 200)} ` +
      `(temperature=${temperature}). Configure an LlmClient to enable real generation.`
    );
  }
}

export interface HttpLlmClientOptions {
  baseUrl?: string;
  apiKey?: string;
  temperature?: number;
  maxTokens?: number;
  timeoutMs?: number;
}

/**
 * OpenAI-compatible HTTP client (OmniRoute LiteLLM daemon / OpenRouter).
 * Uses global fetch (Node 18+). Parses chat.completions responses.
 */
export class HttpLlmClient implements LlmClient {
  private readonly baseUrl: string;
  private readonly apiKey: string;
  private readonly temperature: number;
  private readonly maxTokens: number;
  private readonly timeoutMs: number;

  constructor(opts: HttpLlmClientOptions = {}) {
    this.baseUrl = (opts.baseUrl ?? 'http://127.0.0.1:20128/v1').replace(/\/+$/, '');
    this.apiKey = opts.apiKey ?? 'omniroute-token';
    this.temperature = opts.temperature ?? 0.7;
    this.maxTokens = opts.maxTokens ?? 700;
    this.timeoutMs = opts.timeoutMs ?? 180_000;
  }

  public async generateContent(
    model: string,
    messages: LlmMessage[] | string,
    options?: LlmGenerationOptions
  ): Promise<string> {
    const normalized: LlmMessage[] = Array.isArray(messages)
      ? messages
      : [{ role: 'user', content: messages }];

    if (options?.systemInstruction) {
      normalized.unshift({ role: 'system', content: options.systemInstruction });
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    if (options?.signal) {
      options.signal.addEventListener('abort', () => controller.abort(), { once: true });
    }

    let resp: Response;
    try {
      resp = await fetch(`${this.baseUrl}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${options?.apiKey ?? this.apiKey}`,
        },
        body: JSON.stringify({
          model,
          temperature: options?.temperature ?? this.temperature,
          max_tokens: options?.maxOutputTokens ?? this.maxTokens,
          messages: normalized,
        }),
        signal: controller.signal,
      });
    } catch (err) {
      const reason = err instanceof Error ? err.message : String(err);
      throw new LlmError(`Cannot reach ${this.baseUrl}: ${reason}`);
    } finally {
      clearTimeout(timer);
    }

    if (!resp.ok) {
      const detail = (await resp.text()).slice(0, 400);
      throw new LlmError(`HTTP ${resp.status} from ${this.baseUrl}: ${detail}`);
    }

    const data = (await resp.json()) as unknown;
    return extractContent(data);
  }
}

export class LlmError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'LlmError';
  }
}

function extractContent(data: unknown): string {
  let content: unknown;
  try {
    const choices = (data as { choices?: unknown[] }).choices ?? [];
    content = (choices[0] as { message?: { content?: unknown } } | undefined)?.message?.content;
  } catch {
    throw new LlmError(`Malformed LLM response: ${JSON.stringify(data).slice(0, 300)}`);
  }
  if (typeof content !== 'string' || !content.trim()) {
    throw new LlmError(`Empty LLM response: ${JSON.stringify(data).slice(0, 300)}`);
  }
  return stripThink(content);
}

/** Strip <thinking>…</thinking> blocks and leading start tags some models emit. */
export function stripThink(text: string): string {
  let out = text.replace(/<thinking>[\s\S]*?<\/thinking>/g, '');
  out = out.replace(/^\s*(\|?start\|?>)?\s*/i, '');
  return out.trim();
}

export function defaultModelFor(persona: PersonaId): string {
  return persona === 'adam' ? 'omni/cf-qwen2.5-coder-32b' : 'omni/cf-mistral-small-3.1';
}

export function defaultSynthesizerModel(): string {
  return 'omni/cf-llama-3.3-70b';
}