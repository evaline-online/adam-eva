/**
 * adam-eva — runtime configuration loader with environment overrides.
 *
 * Reads a JSON config file (default ./config.json) and deep-merges it onto
 * defaults. Environment variables with the ADAM_EVA_ prefix win over the file.
 */

import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { defaultModelFor, defaultSynthesizerModel } from './llm.ts';
import type { AdamEvaMode, AdamEvaOrdering, PersonaId } from './types.ts';

export const DEFAULT_CONFIG_PATH = resolve(process.cwd(), 'config.json');

export interface LlmConfig {
  base_url: string;
  api_key: string;
  model_eva: string;
  model_adam: string;
  model_synthesizer: string;
  temperature: number;
  max_tokens: number;
}

export interface VoiceConfig {
  enabled: boolean;
  speak_live: boolean;
  save_audio: boolean;
  rate: string;
  volume: string;
  voices: Record<string, Record<PersonaId, string>>;
}

export interface PluginConfig {
  language: string;
  mode: AdamEvaMode;
  ordering: AdamEvaOrdering;
  rounds: number;
  llm: LlmConfig;
  voice: VoiceConfig;
  transcripts_dir: string;
  audio_dir: string;
}

export const CONFIG_DEFAULTS: PluginConfig = {
  language: 'ru',
  mode: 'dialogue',
  ordering: 'eva-adam',
  rounds: 3,
  llm: {
    base_url: 'http://127.0.0.1:20128/v1',
    api_key: 'omniroute-token',
    model_eva: defaultModelFor('eva'),
    model_adam: defaultModelFor('adam'),
    model_synthesizer: defaultSynthesizerModel(),
    temperature: 0.7,
    max_tokens: 700,
  },
  voice: {
    enabled: false,
    speak_live: false,
    save_audio: true,
    rate: '+0%',
    volume: '+0%',
    voices: {
      ru: { eva: 'ru-RU-SvetlanaNeural', adam: 'ru-RU-DmitryNeural' },
      uk: { eva: 'uk-UA-PolinaNeural', adam: 'uk-UA-OstapNeural' },
      en: { eva: 'en-US-AriaNeural', adam: 'en-US-GuyNeural' },
    },
  },
  transcripts_dir: 'transcripts',
  audio_dir: 'audio',
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function mergeDeep(base: Record<string, unknown>, override: unknown): void {
  if (!isRecord(override)) return;
  for (const [key, value] of Object.entries(override)) {
    if (isRecord(value) && isRecord(base[key])) {
      mergeDeep(base[key] as Record<string, unknown>, value);
    } else {
      base[key] = value;
    }
  }
}

function clampRound(value: unknown, fallback: number): number {
  const num = Number.isFinite(value) ? Number(value) : fallback;
  return Math.max(1, Math.min(Math.round(num), 9));
}

export function loadConfig(path: string = DEFAULT_CONFIG_PATH): PluginConfig {
  const data: Record<string, unknown> = structuredClone(CONFIG_DEFAULTS) as unknown as Record<string, unknown>;
  if (existsSync(path)) {
    try {
      const file = JSON.parse(readFileSync(path, 'utf-8')) as unknown;
      mergeDeep(data, file);
    } catch {
      // Ignore a broken config file; fall back to defaults.
    }
  }
  applyEnv(data);
  return sanitize(data);
}

function applyEnv(data: Record<string, unknown>): void {
  const env = process.env;
  if (env.ADAM_EVA_LANGUAGE) data.language = env.ADAM_EVA_LANGUAGE;
  if (env.ADAM_EVA_MODE) data.mode = env.ADAM_EVA_MODE as Record<string, unknown>['mode'];
  if (env.ADAM_EVA_ORDERING) data.ordering = env.ADAM_EVA_ORDERING as Record<string, unknown>['ordering'];
  if (env.ADAM_EVA_ROUNDS) data.rounds = Number(env.ADAM_EVA_ROUNDS);

  const llm = data.llm as Record<string, unknown>;
  if (env.ADAM_EVA_LLM_BASE_URL) llm.base_url = env.ADAM_EVA_LLM_BASE_URL;
  if (env.ADAM_EVA_LLM_API_KEY) llm.api_key = env.ADAM_EVA_LLM_API_KEY;
  if (env.ADAM_EVA_MODEL_EVA) llm.model_eva = env.ADAM_EVA_MODEL_EVA;
  if (env.ADAM_EVA_MODEL_ADAM) llm.model_adam = env.ADAM_EVA_MODEL_ADAM;
  if (env.ADAM_EVA_MODEL_SYNTH) llm.model_synthesizer = env.ADAM_EVA_MODEL_SYNTH;
  if (env.ADAM_EVA_TEMPERATURE) llm.temperature = Number(env.ADAM_EVA_TEMPERATURE);
  if (env.ADAM_EVA_MAX_TOKENS) llm.max_tokens = Number(env.ADAM_EVA_MAX_TOKENS);
}

function sanitize(data: Record<string, unknown>): PluginConfig {
  const llm = data.llm as unknown as LlmConfig;
  const voice = data.voice as unknown as VoiceConfig;
  return {
    language: typeof data.language === 'string' ? data.language : 'ru',
    mode: data.mode === 'interview' ? 'interview' : 'dialogue',
    ordering: data.ordering === 'adam-eva' ? 'adam-eva' : 'eva-adam',
    rounds: clampRound(data.rounds, 3),
    llm: {
      base_url: llm?.base_url ?? CONFIG_DEFAULTS.llm.base_url,
      api_key: llm?.api_key ?? CONFIG_DEFAULTS.llm.api_key,
      model_eva: llm?.model_eva ?? CONFIG_DEFAULTS.llm.model_eva,
      model_adam: llm?.model_adam ?? CONFIG_DEFAULTS.llm.model_adam,
      model_synthesizer: llm?.model_synthesizer ?? CONFIG_DEFAULTS.llm.model_synthesizer,
      temperature: Number.isFinite(llm?.temperature) ? Number(llm.temperature) : CONFIG_DEFAULTS.llm.temperature,
      max_tokens: Number.isFinite(llm?.max_tokens) ? Math.max(300, Number(llm.max_tokens)) : CONFIG_DEFAULTS.llm.max_tokens,
    },
    voice: {
      enabled: Boolean(voice?.enabled),
      speak_live: Boolean(voice?.speak_live),
      save_audio: voice?.save_audio !== false,
      rate: voice?.rate ?? '+0%',
      volume: voice?.volume ?? '+0%',
      voices: voice?.voices ?? CONFIG_DEFAULTS.voice.voices,
    },
    transcripts_dir: typeof data.transcripts_dir === 'string' ? data.transcripts_dir : 'transcripts',
    audio_dir: typeof data.audio_dir === 'string' ? data.audio_dir : 'audio',
  };
}