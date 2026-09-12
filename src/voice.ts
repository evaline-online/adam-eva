/**
 * Adam & Eva — voice output via Microsoft Edge-TTS (free, no keys).
 *
 * Voice synthesis is delegated to a tiny Python bridge (voice_bridge.py) that
 * wraps the `edge_tts` package. The bridge reads a JSON payload on stdin and
 * writes an MP3 file; this keeps the TypeScript plugin free of native deps.
 */

import { execFileSync, spawn } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { PersonaId } from './types.ts';
import type { VoiceConfig } from './config.ts';

export interface SpeakOptions {
  voice?: string;
  rate?: string;
  volume?: string;
  shellPath?: string;
}

const BRIDGE_PATH = resolve(dirname(fileURLToPath(import.meta.url)), '..', 'voice_bridge.py');

/** Run the Python bridge, feeding `payload` on stdin and awaiting exit. */
function runBridge(python: string, payload: string): Promise<void> {
  return new Promise((resolveBridge, rejectBridge) => {
    const child = spawn(python, [BRIDGE_PATH], { stdio: ['pipe', 'pipe', 'pipe'] });
    let stderr = '';
    let stdout = '';
    child.stderr.setEncoding('utf8');
    child.stderr.on('data', (chunk: string) => { stderr += chunk; });
    child.stdout.setEncoding('utf8');
    child.stdout.on('data', (chunk: string) => { stdout += chunk; });
    child.on('error', (err) => rejectBridge(err));
    child.on('close', (code) => {
      if (code !== 0) {
        rejectBridge(new Error(`bridge exited with code ${code}: ${(stderr || stdout).trim()}`));
      } else {
        resolveBridge();
      }
    });
    child.stdin.write(payload);
    child.stdin.end();
  });
}

export function voiceFor(language: string, config: VoiceConfig, personaId: PersonaId): string {
  const table = config.voices[language] ?? config.voices.ru;
  const fallback = personaId === 'eva' ? 'ru-RU-SvetlanaNeural' : 'ru-RU-DmitryNeural';
  return table?.[personaId] ?? fallback;
}

export interface SpeakResult {
  path: string;
  voice: string;
  durationMs: number;
}

/**
 * Synthesize `text` for `personaId` into `outPath` (an .mp3 file).
 * `shellPath` overrides the interpreter used to run the bridge (default: python3).
 */
export async function speakToFile(
  language: string,
  config: VoiceConfig,
  personaId: PersonaId,
  text: string,
  outPath: string,
  opts: SpeakOptions = {}
): Promise<SpeakResult> {
  const voice = opts.voice ?? voiceFor(language, config, personaId);
  const started = Date.now();
  const payload = JSON.stringify({
    text,
    voice,
    rate: opts.rate ?? config.rate,
    volume: opts.volume ?? config.volume,
    out_path: outPath,
  });
  const python = opts.shellPath ?? 'python3';
  try {
    await runBridge(python, payload);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    throw new Error(`Edge-TTS bridge failed: ${message}`);
  }
  return { path: outPath, voice, durationMs: Date.now() - started };
}

/** Best-effort playback of an mp3 via ffplay/mpv/afplay (silently skips if none available). */
export async function playAudio(path: string): Promise<void> {
  const candidates: Array<[string, string[]]> = [
    ['ffplay', ['-nodisp', '-autoexit', '-loglevel', 'quiet', path]],
    ['mpv', [path]],
    ['afplay', [path]],
  ];
  for (const [bin, args] of candidates) {
    try {
      execFileSync(bin, args, { stdio: 'ignore' });
      return;
    } catch {
      // try next player
    }
  }
}