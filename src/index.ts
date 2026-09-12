/**
 * adam-eva — public entrypoint.
 *
 * Exports the self-contained plugin contract, engine, LLM clients, personas,
 * config loader, voice bridge helpers and the chat-provider adapter.
 */

export * from './types.ts';
export * from './personas.ts';
export * from './llm.ts';
export * from './config.ts';
export * from './engine.ts';
export * from './plugin-contract.ts';
export * from './plugin.ts';
export * from './provider.ts';
export * from './voice.ts';
export * from './transcript.ts';

export const ADAM_EVA_VERSION = '2.0.0';