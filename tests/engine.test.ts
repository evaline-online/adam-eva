import assert from 'node:assert/strict';
import { test } from 'node:test';

import { AdamEvaEngine } from '../src/engine.ts';
import { StubLlmClient } from '../src/llm.ts';
import type { LlmMessage } from '../src/llm.ts';

function recordingClient() {
  const calls: Array<{ model: string; messages: LlmMessage[] }> = [];
  const client = new StubLlmClient((model, content) => {
    calls.push({ model, messages: [{ role: 'user', content }] });
    return `stub-${model}`;
  });
  return { client, calls };
}

test('dialogue (eva-adam): eva opens, adam replies, two turns per round', async () => {
  const { client } = recordingClient();
  const engine = new AdamEvaEngine({ llm: client, defaultMode: 'dialogue', defaultOrdering: 'eva-adam' });
  const result = await engine.run({ mode: 'dialogue', ordering: 'eva-adam', prompt: 'Новый сайт', rounds: 2, withSynthesis: false });

  assert.equal(result.rounds, 2);
  assert.equal(result.turns.length, 4);
  assert.equal(result.turns[0].name, 'Eva');
  assert.equal(result.turns[0].kind, 'opening');
  assert.equal(result.turns[1].name, 'Adam');
  assert.equal(result.turns[1].kind, 'reply');
  assert.equal(result.turns[2].name, 'Eva');
  assert.equal(result.turns[3].name, 'Adam');
});

test('dialogue (adam-eva): adam opens first', async () => {
  const { client } = recordingClient();
  const engine = new AdamEvaEngine({ llm: client });
  const result = await engine.run({ mode: 'dialogue', ordering: 'adam-eva', prompt: 'Бэкенд', rounds: 1, withSynthesis: false });

  assert.equal(result.turns[0].name, 'Adam');
  assert.equal(result.turns[0].kind, 'opening');
  assert.equal(result.turns[1].name, 'Eva');
});

test('interview (eva-adam): eva asks questions, adam answers', async () => {
  const { client } = recordingClient();
  const engine = new AdamEvaEngine({ llm: client });
  const result = await engine.run({ mode: 'interview', ordering: 'eva-adam', prompt: 'Интервью о производстве', rounds: 2, withSynthesis: false });

  assert.equal(result.mode, 'interview');
  assert.equal(result.rounds, 2);
  assert.equal(result.turns.length, 4);

  const kinds = result.turns.map((t) => t.kind);
  assert.deepEqual(kinds, ['question', 'answer', 'question', 'answer']);
  assert.equal(result.turns[0].name, 'Eva');
  assert.equal(result.turns[1].name, 'Adam');
  assert.equal(result.turns[2].name, 'Eva');
  assert.equal(result.turns[3].name, 'Adam');
});

test('interview (adam-eva): adam interviews eva', async () => {
  const { client } = recordingClient();
  const engine = new AdamEvaEngine({ llm: client });
  const result = await engine.run({ mode: 'interview', ordering: 'adam-eva', prompt: 'Интервью о UX', rounds: 1, withSynthesis: false });

  assert.equal(result.turns[0].name, 'Adam');
  assert.equal(result.turns[0].kind, 'question');
  assert.equal(result.turns[1].name, 'Eva');
  assert.equal(result.turns[1].kind, 'answer');
});

test('synthesis is produced when not disabled', async () => {
  const { client } = recordingClient();
  const engine = new AdamEvaEngine({ llm: client });
  const result = await engine.run({ mode: 'dialogue', ordering: 'eva-adam', prompt: 'Тема', rounds: 1, withSynthesis: true });

  assert.ok(result.synthesis, 'synthesis should be present');
});

test('synthesis is skipped when withSynthesis=false', async () => {
  const { client } = recordingClient();
  const engine = new AdamEvaEngine({ llm: client });
  const result = await engine.run({ mode: 'dialogue', ordering: 'eva-adam', prompt: 'Тема', rounds: 1, withSynthesis: false });

  assert.equal(result.synthesis, undefined);
});

test('rounds are clamped to 1..9', async () => {
  const { client } = recordingClient();
  const engine = new AdamEvaEngine({ llm: client });
  const result = await engine.run({ mode: 'dialogue', ordering: 'eva-adam', prompt: 'Тема', rounds: 99, withSynthesis: false });
  assert.equal(result.rounds, 9);
  assert.equal(result.turns.length, 18);
});

test('model selection uses defaults when not provided', async () => {
  const { client, calls } = recordingClient();
  const engine = new AdamEvaEngine({ llm: client });
  await engine.run({ mode: 'dialogue', ordering: 'eva-adam', prompt: 'Тема', rounds: 1, withSynthesis: false });

  assert.ok(calls.length >= 2);
  assert.ok(calls[0].model.includes('eva') || calls[0].model.includes('mistral'));
  assert.ok(calls[1].model.includes('adam') || calls[1].model.includes('qwen'));
});