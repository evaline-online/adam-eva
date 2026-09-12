/**
 * adam-eva — self-contained plugin contract.
 *
 * Mirror of the host backend's plugin-system types with zero host imports, so
 * any plugin manager (evaline-chat, evabot-backend) can host AdamEvaPlugin.
 */

export interface PluginContext {
  config: Record<string, unknown>;
  logger: { debug: (msg: string, ...args: unknown[]) => void; info: (msg: string, ...args: unknown[]) => void; warn: (msg: string, ...args: unknown[]) => void; error: (msg: string, ...args: unknown[]) => void };
  eventBus: PluginEventBus;
  registerRoute: (method: string, path: string, handler: Function) => void;
  registerCommand: (command: string, handler: Function, help?: string) => void;
  getStorage: (name: string) => PluginStorage;
}

export interface PluginManifest {
  id: string;
  name: string;
  version: string;
  description: string;
  author?: string;
  dependencies?: string[];
  enabled: boolean;
  category: 'core' | 'ai' | 'data' | 'security' | 'integration';
}

export interface Plugin {
  manifest: PluginManifest;
  initialize(context: PluginContext): Promise<void>;
  shutdown(): Promise<void>;
  healthCheck?(): Promise<{ status: 'healthy' | 'degraded' | 'down'; message?: string }>;
}

export class PluginError extends Error {
  public readonly pluginId: string;
  public readonly cause?: Error;

  constructor(pluginId: string, message: string, cause?: Error) {
    super(`[${pluginId}] ${message}`);
    this.name = 'PluginError';
    this.pluginId = pluginId;
    this.cause = cause;
  }
}

export type PluginEventHandler = (data: unknown) => void | Promise<void>;

export interface PluginEventBus {
  on(event: string, handler: PluginEventHandler): void;
  off(event: string, handler: PluginEventHandler): void;
  emit(event: string, data: unknown): Promise<void>;
  clear(): void;
}

export class InMemoryPluginEventBus implements PluginEventBus {
  private handlers: Map<string, Set<PluginEventHandler>> = new Map();

  public on(event: string, handler: PluginEventHandler): void {
    if (!this.handlers.has(event)) {
      this.handlers.set(event, new Set());
    }
    this.handlers.get(event)!.add(handler);
  }

  public off(event: string, handler: PluginEventHandler): void {
    this.handlers.get(event)?.delete(handler);
  }

  public async emit(event: string, data: unknown): Promise<void> {
    const handlers = this.handlers.get(event);
    if (!handlers) return;
    await Promise.all(Array.from(handlers).map((h) => Promise.resolve(h(data))));
  }

  public clear(): void {
    this.handlers.clear();
  }
}

export interface PluginStorage {
  get(key: string): unknown;
  set(key: string, value: unknown): void;
  remove(key: string): void;
  all(): Record<string, unknown>;
}