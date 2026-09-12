/**
 * Adam & Eva — CLI runner (dialogue + interview modes, optional Edge-TTS voice).
 *
 * Usage:
 *   npm run cli -- "Тема для обсуждения" [--mode dialogue|interview] [--ordering eva-adam|adam-eva] [--rounds N] [--lang ru] [--voice] [--live] [--no-synth]
 */

import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { loadConfig } from './config.ts';
import type { PluginConfig } from './config.ts';
import { AdamEvaEngine, sanitizeMode, sanitizeOrdering, clampRounds } from './engine.ts';
import { HttpLlmClient, LlmError } from './llm.ts';
import { saveTranscript } from './transcript.ts';
import { playAudio, speakToFile } from './voice.ts';
import type { AdamEvaMode, AdamEvaOrdering, AdamEvaResult, Turn } from './types.ts';

interface CliArgs {
  topic?: string;
  mode: AdamEvaMode;
  ordering: AdamEvaOrdering;
  rounds: number;
  lang?: string;
  voice: boolean;
  live: boolean;
  no_synth: boolean;
  configPath: string;
  modelEva?: string;
  modelAdam?: string;
  modelSynth?: string;
}

function parseArgs(argv: string[]): CliArgs {
  const args: CliArgs = { mode: 'dialogue', ordering: 'eva-adam', rounds: 3, voice: false, live: false, no_synth: false, configPath: 'config.json' };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    const next = (): string | undefined => {
      i += 1;
      return argv[i];
    };
    switch (arg) {
      case '--mode':
        args.mode = sanitizeMode((next() ?? 'dialogue') as AdamEvaMode);
        break;
      case '--ordering':
        args.ordering = sanitizeOrdering((next() ?? 'eva-adam') as AdamEvaOrdering);
        break;
      case '--rounds':
        args.rounds = clampRounds(Number(next() ?? 3));
        break;
      case '--lang':
        args.lang = next();
        break;
      case '--voice':
        args.voice = true;
        break;
      case '--live':
        args.live = true;
        args.voice = true;
        break;
      case '--no-voice':
        args.voice = false;
        args.live = false;
        break;
      case '--no-synth':
        args.no_synth = true;
        break;
      case '--config':
        args.configPath = next() ?? 'config.json';
        break;
      case '--model-eva':
        args.modelEva = next();
        break;
      case '--model-adam':
        args.modelAdam = next();
        break;
      case '--model-synth':
        args.modelSynth = next();
        break;
      case '--help':
      case '-h':
        printHelp();
        process.exit(0);
        break;
      default:
        if (arg.startsWith('-')) break;
        args.topic = args.topic ? `${args.topic} ${arg}` : arg;
        break;
    }
  }
  return args;
}

function printHelp(): void {
  console.log(`adam-eva v2.0.0 — Adam & Eva two-AI deliberation
Usage: node src/cli.ts "<topic>" [options]

Options:
  --mode <dialogue|interview>   Mode (default: dialogue)
  --ordering <eva-adam|adam-eva> Leader / who interviews (default: eva-adam)
  --rounds <1-9>                Number of rounds
  --lang <ru|uk|en|pl|ro|de>    Language
  --voice                       Save each reply as MP3 (Edge-TTS)
  --live                        Play replies immediately
  --no-voice                    Disable voice
  --no-synth                    Skip the joint-arbiter conclusion
  --config <path>               Config JSON path (default: config.json)
  --model-eva / --model-adam / --model-synth  Override models
`);
}

function effectiveConfig(args: CliArgs, base: PluginConfig): PluginConfig {
  const config = structuredClone(base);
  config.mode = args.mode;
  config.ordering = args.ordering;
  config.rounds = args.rounds;
  if (args.lang) config.language = args.lang;
  if (args.live) {
    config.voice.enabled = true;
    config.voice.speak_live = true;
  } else if (args.voice) {
    config.voice.enabled = true;
    config.voice.speak_live = false;
  }
  if (args.modelEva) config.llm.model_eva = args.modelEva;
  if (args.modelAdam) config.llm.model_adam = args.modelAdam;
  if (args.modelSynth) config.llm.model_synthesizer = args.modelSynth;
  return config;
}

async function speakTurn(cfg: PluginConfig, turn: Turn, stamp: string, outDir: string, live: boolean): Promise<string | undefined> {
  const outPath = resolve(outDir, `adam-eva_${stamp}_${String(turn.round).padStart(2, '0')}_${turn.personaId}.mp3`);
  await speakToFile(cfg.language, cfg.voice, turn.personaId, turn.content, outPath);
  if (live) await playAudio(outPath);
  return outPath;
}

function displayResult(result: AdamEvaResult, cfg: PluginConfig, synth: boolean, audioClips: string[]): void {
  console.log();
  console.log(`Тема: ${result.prompt}`);
    console.log(`Режим: ${result.mode} | Язык: ${cfg.language} | Раунды: ${result.rounds} | Порядок: ${result.ordering}`);
    console.log('-'.repeat(72));
    for (const turn of result.turns) {
      console.log();
      console.log(`▶ ${turn.name} (Round ${turn.round}, ${turn.kind}) — ${turn.durationMs} ms`);
      console.log(turn.content);
    }
    if (result.synthesis) {
      console.log();
      console.log('='.repeat(72));
      console.log('▶ Совместный вывод арбитра');
    console.log('='.repeat(72));
    console.log(result.synthesis);
  }
  const transcript = saveTranscript(result, { transcriptsDir: cfg.transcripts_dir });
  console.log();
  console.log(`Стенограмма: ${transcript}`);
  if (audioClips.length) {
    console.log('Аудио:');
    for (const path of audioClips) console.log(`  - ${path}`);
  }
  void synth;
}

async function main(): Promise<number> {
  const args = parseArgs(process.argv.slice(2));
  const base = loadConfig(resolve(args.configPath));
  if (!args.topic) {
    process.stdout.write('Тема для обсуждения Адама и Евы > ');
    const line = await readLine();
    args.topic = line.trim();
  }
  if (!args.topic) {
    console.log('Пустая тема. Выход.');
    return 1;
  }

  const cfg = effectiveConfig(args, base);
  const llm = new HttpLlmClient({
    baseUrl: cfg.llm.base_url,
    apiKey: cfg.llm.api_key,
    temperature: cfg.llm.temperature,
    maxTokens: cfg.llm.max_tokens,
  });
  const engine = new AdamEvaEngine({
    llm,
    defaultMode: cfg.mode,
    defaultOrdering: cfg.ordering,
    defaultLanguage: cfg.language,
    temperature: cfg.llm.temperature,
    maxTokens: cfg.llm.max_tokens,
  });

  const outDir = resolve(cfg.audio_dir);
  mkdirSync(outDir, { recursive: true });
  const stamp = isoStamp();
  const audioClips: string[] = [];
  const voiceEnabled = cfg.voice.enabled;

  const onTurn = async (turn: Turn): Promise<void> => {
    if (!voiceEnabled) return;
    try {
      const path = await speakTurn(cfg, turn, stamp, outDir, cfg.voice.speak_live);
      if (path) audioClips.push(path);
    } catch (err) {
      console.log(`[voice error: ${err instanceof Error ? err.message : String(err)}]`);
    }
  };

  try {
    const result = await engine.run({
      mode: cfg.mode,
      ordering: cfg.ordering,
      prompt: args.topic,
      rounds: cfg.rounds,
      language: cfg.language,
      withSynthesis: !args.no_synth,
      onTurn,
    });
    displayResult(result, cfg, !args.no_synth, audioClips);
  } catch (err) {
    if (err instanceof LlmError) {
      console.error(`\n[llm error] ${err.message}`);
      return 2;
    }
    throw err;
  }
  return 0;
}

function readLine(): Promise<string> {
  return new Promise((resolvePromise) => {
    process.stdin.resume();
    let data = '';
    process.stdin.setEncoding('utf-8');
    process.stdin.on('data', (chunk) => {
      data += String(chunk);
      if (data.includes('\n')) {
        process.stdin.pause();
        resolvePromise(data);
      }
    });
  });
}

function isoStamp(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`;
}

process.exitCode = await main();