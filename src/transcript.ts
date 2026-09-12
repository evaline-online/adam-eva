/**
 * Adam & Eva — markdown transcript storage (mirror of python/adam_eva/transcript.py).
 */

import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { resolve as resolvePath } from 'node:path';
import type { AdamEvaResult, Turn } from './types.ts';

export function slug(text: string, limit = 48): string {
  const keep = text.replace(/[^a-zA-Z0-9_а-яА-ЯёЁ-]/g, ' ').trim();
  const words = keep.split(/\s+/).filter(Boolean);
  return (words.slice(0, 8).join('-').toLowerCase().slice(0, limit)) || 'topic';
}

function esc(text: string): string {
  return text.replace(/\[/g, '\\[').replace(/\]/g, '\\]').replace(/\|/g, '\\|');
}

function maxRound(turns: Turn[]): number {
  return turns.reduce((max, t) => Math.max(max, t.round), 0);
}

export interface SaveTranscriptOptions {
  transcriptsDir?: string;
  title?: string;
  date?: string;
}

export function saveTranscript(result: AdamEvaResult, opts: SaveTranscriptOptions = {}): string {
  const dir = resolve(opts.transcriptsDir ?? 'transcripts');
  mkdirSync(dir, { recursive: true });
  const stamp = isoStamp();
  const name = `adam-eva_${stamp}_${slug(result.prompt)}.md`;
  const path = resolvePath(dir, name);
  const date = opts.date ?? new Date().toISOString().replace('T', ' ').slice(0, 19);

  const lines: string[] = [
    '# Adam & Eva — Deliberation',
    '',
    `**Mode:** ${result.mode} | **Ordering:** ${result.ordering}`,
    `**Topic:** ${result.prompt}`,
    `**Date:** ${date}`,
    `**Rounds:** ${maxRound(result.turns)}`,
    `**Duration:** ${(result.durationMs / 1000).toFixed(1)} s`,
    '',
    '---',
    '',
  ];

  for (const turn of result.turns) {
    lines.push(`## Round ${turn.round} — ${turn.name} (*${turn.title}*, ${turn.kind})`);
    lines.push('');
    lines.push(esc(turn.content));
    lines.push('');
  }

  if (result.synthesis) {
    lines.push('---');
    lines.push('');
    lines.push('## Joint Conclusion (Arbiter)');
    lines.push('');
    lines.push(esc(result.synthesis));
    lines.push('');
  }

  writeFileSync(path, lines.join('\n'), 'utf-8');
  return path;
}

function isoStamp(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`;
}