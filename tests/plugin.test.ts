import assert from 'node:assert/strict';
import { test } from 'node:test';

import { AdamEvaPlugin } from '../src/plugin.ts';
import { AdamEvaProvider } from '../src/provider.ts';
import { InMemoryPluginEventBus, PluginError } from '../src/plugin-contract.ts';
import type { PluginContext } from '../src/plugin-contract.ts';

class FakeStorage {
  private readonly map = new Map<string, unknown>();
  get(key: string): unknown { return this.map.get(key); }
  set(key: string, value: unknown): void { this.map.set(key, value); }
  remove(key: string): void { this.map.delete(key); }
  all(): Record<string, unknown> { return Object.fromEntries(this.map); }
}

function makeContext(): PluginContext & { commands: Map<string, unknown>; routes: Map<string, unknown> } {
  const commands = new Map<string, unknown>();
  const routes = new Map<string, unknown>();
  return {
    config: {},
    logger: { debug: () => void 0, info: () => void 0, warn: () => void 0, error: () => void 0 },
    eventBus: new InMemoryPluginEventBus(),
    registerCommand: (cmd: string, handler: unknown, help?: string) => {
      commands.set(cmd, { handler, help });
    },
    registerRoute: (method: string, path: string, handler: unknown) => {
      routes.set(`${method} ${path}`, handler);
    },
    getStorage: () => new FakeStorage(),
    commands,
    routes,
  };
}

test('plugin registers manifest with adam-eva id and ai category', async () => {
  const plugin = new AdamEvaPlugin();
  assert.equal(plugin.manifest.id, 'adam-eva');
  assert.equal(plugin.manifest.category, 'ai');
  assert.equal(plugin.manifest.enabled, true);
});

test('plugin initialize registers commands and a POST route', async () => {
  const plugin = new AdamEvaPlugin();
  const ctx = makeContext();
  await plugin.initialize(ctx);

  assert.ok(ctx.commands.has('adam-eva'));
  assert.ok(ctx.commands.has('adam'));
  assert.ok(ctx.commands.has('interview'));
  assert.ok(ctx.routes.has('POST /api/adam-eva'));
});

test('plugin run requires a topic', async () => {
  const plugin = new AdamEvaPlugin();
  await assert.rejects(() => plugin.run({ topic: '  ' }), /topic/);
});

test('plugin run returns dialogue result for a topic', async () => {
  const plugin = new AdamEvaPlugin();
  const result = await plugin.run({ topic: 'Новый продукт', mode: 'dialogue', ordering: 'eva-adam', rounds: 1 });
  assert.equal(result.mode, 'dialogue');
  assert.equal(result.ordering, 'eva-adam');
  assert.equal(result.rounds, 1);
  assert.ok(result.turns.length >= 2);
});

test('provider exposes id adam-eva and sends content', async () => {
  const provider = new AdamEvaProvider({ defaultRounds: 1 });
  assert.equal(provider.id, 'adam-eva');
  const out = await provider.send({ sessionId: 'room-1', text: 'Тема', history: [] });
  assert.ok(out.content.length > 0);
  assert.equal(out.mode, 'dialogue');
});

test('provider setMode only accepts supported modes', async () => {
  const provider = new AdamEvaProvider();
  provider.setMode('interview');
  assert.equal(provider.getMode(), 'interview');
  provider.setMode('bogus');
  assert.equal(provider.getMode(), 'interview');
});

test('PluginError carries the plugin id', () => {
  const err = new PluginError('adam-eva', 'boom');
  assert.equal(err.pluginId, 'adam-eva');
  assert.ok(err.message.includes('adam-eva'));
});