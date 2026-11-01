// @vitest-environment node
import { describe, expect, it } from 'vitest';
import {
  BrowserCredentialStore,
  DEFAULT_SETTINGS,
  keyOnly,
  loadAgentSettings,
  onAgentSettingsChange,
  saveAgentSettings,
} from './settings';

/** Web Storage in memory. */
class MemoryStore implements Storage {
  private items = new Map<string, string>();
  get length() {
    return this.items.size;
  }
  clear() {
    this.items.clear();
  }
  getItem(key: string) {
    return this.items.get(key) ?? null;
  }
  key(index: number) {
    return [...this.items.keys()][index] ?? null;
  }
  removeItem(key: string) {
    this.items.delete(key);
  }
  setItem(key: string, value: string) {
    this.items.set(key, String(value));
  }
}

describe('agent settings', () => {
  it('are off by default', () => {
    expect(loadAgentSettings(new MemoryStore())).toEqual(DEFAULT_SETTINGS);
    expect(DEFAULT_SETTINGS.enabled).toBe(false);
  });

  it('round-trip through storage and tell listeners', () => {
    const store = new MemoryStore();
    let told = 0;
    const stop = onAgentSettingsChange(() => told++);
    const settings = {
      enabled: true,
      provider: 'local' as const,
      model: 'qwen3',
      baseUrl: 'http://localhost:1234/v1',
    };
    saveAgentSettings(settings, store);
    stop();
    saveAgentSettings(settings, store);
    expect(loadAgentSettings(store)).toEqual(settings);
    expect(told).toBe(1);
  });

  it('fall back to defaults for malformed values', () => {
    const store = new MemoryStore();
    store.setItem('ganymede-ui:agent', JSON.stringify({ enabled: 'yes', provider: 'acme' }));
    expect(loadAgentSettings(store)).toEqual(DEFAULT_SETTINGS);
    store.setItem('ganymede-ui:agent', '{not json');
    expect(loadAgentSettings(store)).toEqual(DEFAULT_SETTINGS);
    store.setItem('ganymede-ui:agent', JSON.stringify({ provider: 'google' }));
    expect(loadAgentSettings(store).model).toBe('gemini-3.5-flash');
  });

  it('work without storage', () => {
    expect(loadAgentSettings(undefined)).toEqual(DEFAULT_SETTINGS);
    expect(() => saveAgentSettings(DEFAULT_SETTINGS, undefined)).not.toThrow();
  });
});

describe('BrowserCredentialStore', () => {
  function stores() {
    const session = new MemoryStore();
    const local = new MemoryStore();
    return { session, local, keys: new BrowserCredentialStore(session, local) };
  }

  it('keeps a key in sessionStorage unless asked to remember it', async () => {
    const { session, local, keys } = stores();
    await keys.setKey('anthropic', 'sk-session', false);
    expect(session.getItem('ganymede-ui:agent-key:anthropic')).toContain('sk-session');
    expect(local.length).toBe(0);
    expect(keys.remembered('anthropic')).toBe(false);
    expect(await keys.read('anthropic')).toEqual({ type: 'api_key', key: 'sk-session' });

    await keys.setKey('anthropic', 'sk-local', true);
    expect(session.length).toBe(0);
    expect(local.getItem('ganymede-ui:agent-key:anthropic')).toContain('sk-local');
    expect(keys.remembered('anthropic')).toBe(true);
  });

  it('removes a key set to empty, and on delete', async () => {
    const { session, local, keys } = stores();
    await keys.setKey('openai', 'sk-1', true);
    await keys.setKey('openai', '', true);
    expect(await keys.read('openai')).toBeUndefined();
    await keys.setKey('openai', 'sk-2', false);
    await keys.delete('openai');
    expect(session.length + local.length).toBe(0);
  });

  it('lists providers without their keys', async () => {
    const { keys } = stores();
    await keys.setKey('anthropic', 'sk-a', true);
    await keys.setKey('google', 'sk-g', false);
    const list = await keys.list();
    expect(list).toEqual(
      expect.arrayContaining([
        { providerId: 'anthropic', type: 'api_key' },
        { providerId: 'google', type: 'api_key' },
      ]),
    );
    expect(JSON.stringify(list)).not.toContain('sk-');
  });

  it('writes a modified key back where it lives', async () => {
    const { local, keys } = stores();
    await keys.setKey('anthropic', 'sk-old', true);
    const next = await keys.modify('anthropic', async current => {
      expect(current).toEqual({ type: 'api_key', key: 'sk-old' });
      return { type: 'api_key', key: 'sk-new' };
    });
    expect(next).toEqual({ type: 'api_key', key: 'sk-new' });
    expect(local.getItem('ganymede-ui:agent-key:anthropic')).toContain('sk-new');
    // Undefined leaves it as it was.
    expect(await keys.modify('anthropic', async () => undefined)).toEqual(next);
  });

  it('runs writes for a provider in order', async () => {
    const { keys } = stores();
    const order: number[] = [];
    await Promise.all([
      keys.modify('local', async () => {
        await new Promise(r => setTimeout(r, 10));
        order.push(1);
        return { type: 'api_key', key: 'one' };
      }),
      keys.modify('local', async current => {
        order.push(2);
        expect(current).toEqual({ type: 'api_key', key: 'one' });
        return current;
      }),
    ]);
    expect(order).toEqual([1, 2]);
  });

  it('ignores entries that are not keys', async () => {
    const { session, keys } = stores();
    session.setItem('ganymede-ui:agent-key:anthropic', 'garbage');
    expect(await keys.read('anthropic')).toBeUndefined();
  });
});

describe('keyOnly', () => {
  it('holds one key for one provider', async () => {
    const store = keyOnly('anthropic', 'sk-test');
    expect(await store.read('anthropic')).toEqual({ type: 'api_key', key: 'sk-test' });
    expect(await store.read('openai')).toBeUndefined();
    expect(await keyOnly('local', '').read('local')).toBeUndefined();
  });
});
