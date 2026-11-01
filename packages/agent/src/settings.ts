// The agent's settings and API keys (ganymede-ui#165).
//
// The app imports this module up front, so it holds no Pi runtime code:
// only types from pi-ai, which the build erases. `models.ts`, which the app
// loads only once the agent is on, turns these settings into Pi's models.

import type { Credential, CredentialInfo, CredentialStore } from '@earendil-works/pi-ai';

/** Where the agent's model runs. `local` is any OpenAI-compatible server (Ollama, LM Studio). */
export type ProviderId = 'anthropic' | 'openai' | 'google' | 'local';

export interface ProviderInfo {
  id: ProviderId;
  name: string;
  /** The model picked when the person picks this provider. */
  defaultModel: string;
  /** Whether a request needs a key. A local server usually takes none. */
  needsKey: boolean;
}

export const PROVIDERS: readonly ProviderInfo[] = [
  { id: 'anthropic', name: 'Anthropic', defaultModel: 'claude-sonnet-5-5', needsKey: true },
  { id: 'openai', name: 'OpenAI', defaultModel: 'gpt-5.5', needsKey: true },
  { id: 'google', name: 'Google', defaultModel: 'gemini-3.5-flash', needsKey: true },
  { id: 'local', name: 'Local server', defaultModel: 'llama3.1', needsKey: false },
];

export function providerInfo(id: ProviderId): ProviderInfo {
  return PROVIDERS.find(p => p.id === id) ?? PROVIDERS[0]!;
}

/** Ollama's OpenAI-compatible endpoint; LM Studio's is http://localhost:1234/v1. */
export const DEFAULT_LOCAL_URL = 'http://localhost:11434/v1';

export interface AgentSettings {
  /** Off by default: nothing of the agent loads until it is on. */
  enabled: boolean;
  provider: ProviderId;
  model: string;
  /** The local server's base URL. Used only with the `local` provider. */
  baseUrl: string;
}

export const DEFAULT_SETTINGS: AgentSettings = {
  enabled: false,
  provider: 'anthropic',
  model: providerInfo('anthropic').defaultModel,
  baseUrl: DEFAULT_LOCAL_URL,
};

const SETTINGS_KEY = 'ganymede-ui:agent';
const KEY_PREFIX = 'ganymede-ui:agent-key:';

/** The browser's storage, or undefined where it throws (blocked storage, some private modes). */
function storage(kind: 'localStorage' | 'sessionStorage'): Storage | undefined {
  try {
    return globalThis[kind] ?? undefined;
  } catch {
    return undefined;
  }
}

function isProvider(value: unknown): value is ProviderId {
  return PROVIDERS.some(p => p.id === value);
}

/** The saved settings, with defaults for anything missing or malformed. */
export function loadAgentSettings(store = storage('localStorage')): AgentSettings {
  let raw: Record<string, unknown> = {};
  try {
    const parsed: unknown = JSON.parse(store?.getItem(SETTINGS_KEY) ?? '{}');
    if (parsed && typeof parsed === 'object') raw = parsed as Record<string, unknown>;
  } catch {
    // Unreadable settings: start from the defaults.
  }
  const provider = isProvider(raw.provider) ? raw.provider : DEFAULT_SETTINGS.provider;
  return {
    enabled: raw.enabled === true,
    provider,
    model:
      typeof raw.model === 'string' && raw.model ? raw.model : providerInfo(provider).defaultModel,
    baseUrl: typeof raw.baseUrl === 'string' && raw.baseUrl ? raw.baseUrl : DEFAULT_LOCAL_URL,
  };
}

const listeners = new Set<() => void>();

/** Saves the settings. They hold no secrets, so they go in `localStorage`. */
export function saveAgentSettings(settings: AgentSettings, store = storage('localStorage')): void {
  try {
    store?.setItem(SETTINGS_KEY, JSON.stringify(settings));
  } catch {
    // Storage full or blocked: the settings last as long as the page.
  }
  listeners.forEach(l => l());
}

/** Calls `listener` after each save, until the returned function is called. */
export function onAgentSettingsChange(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/**
 * API keys, one per provider, as pi-ai's `CredentialStore`, so Pi's models
 * read them when they make a request.
 *
 * A key lives in `sessionStorage` (this tab, until it closes) unless the
 * person asks to remember it, which puts it in `localStorage`. Never in
 * IndexedDB: kernels in this page run in Workers on the same origin, and a
 * Worker can open IndexedDB but has no Web Storage. The Apple apps will
 * supply a Keychain store with the same interface (ganymede-ui#166).
 */
export class BrowserCredentialStore implements CredentialStore {
  private chains = new Map<string, Promise<unknown>>();

  constructor(
    private session = storage('sessionStorage'),
    private local = storage('localStorage'),
  ) {}

  private get(store: Storage | undefined, providerId: string): Credential | undefined {
    try {
      const raw = store?.getItem(KEY_PREFIX + providerId);
      if (!raw) return undefined;
      const parsed = JSON.parse(raw) as Credential;
      return parsed && parsed.type === 'api_key' ? parsed : undefined;
    } catch {
      return undefined;
    }
  }

  /** Throws when the storage is missing or refuses the write, so a key is never lost silently. */
  private put(store: Storage | undefined, providerId: string, credential: Credential): void {
    if (!store) throw new Error('this browser blocks storage for this page');
    store.setItem(KEY_PREFIX + providerId, JSON.stringify(credential));
  }

  private remove(store: Storage | undefined, providerId: string): void {
    try {
      store?.removeItem(KEY_PREFIX + providerId);
    } catch {
      // Blocked storage holds nothing to remove.
    }
  }

  /** Runs writes for one provider one at a time, as `CredentialStore` asks. */
  private serial<T>(providerId: string, task: () => Promise<T>): Promise<T> {
    const previous = this.chains.get(providerId) ?? Promise.resolve();
    const next = previous.catch(() => {}).then(task);
    this.chains.set(
      providerId,
      next.catch(() => {}),
    );
    return next;
  }

  /** Whether the provider's key is kept in `localStorage`. */
  remembered(providerId: string): boolean {
    return this.get(this.local, providerId) !== undefined;
  }

  async read(providerId: string): Promise<Credential | undefined> {
    return this.get(this.local, providerId) ?? this.get(this.session, providerId);
  }

  async list(): Promise<readonly CredentialInfo[]> {
    const ids = new Set<string>();
    for (const store of [this.local, this.session]) {
      try {
        for (let i = 0; store && i < store.length; i++) {
          const key = store.key(i);
          if (key?.startsWith(KEY_PREFIX)) ids.add(key.slice(KEY_PREFIX.length));
        }
      } catch {
        // Blocked storage lists nothing.
      }
    }
    return [...ids].map(providerId => ({ providerId, type: 'api_key' as const }));
  }

  /** Writes back to wherever the key is now: `localStorage` if remembered, else `sessionStorage`. */
  modify(
    providerId: string,
    fn: (current: Credential | undefined) => Promise<Credential | undefined>,
  ): Promise<Credential | undefined> {
    return this.serial(providerId, async () => {
      const current = await this.read(providerId);
      const next = await fn(current);
      if (next === undefined) return current;
      this.put(this.remembered(providerId) ? this.local : this.session, providerId, next);
      return next;
    });
  }

  delete(providerId: string): Promise<void> {
    return this.serial(providerId, async () => {
      this.remove(this.local, providerId);
      this.remove(this.session, providerId);
    });
  }

  /**
   * Sets the provider's key from the Settings sheet; an empty key removes it.
   * `remember` picks `localStorage` over `sessionStorage`. The new key is
   * written first and only then taken out of the other storage, so a failed
   * write keeps the old key and rejects.
   */
  setKey(providerId: string, key: string, remember: boolean): Promise<void> {
    return this.serial(providerId, async () => {
      if (!key) {
        this.remove(this.local, providerId);
        this.remove(this.session, providerId);
        return;
      }
      const [target, other] = remember ? [this.local, this.session] : [this.session, this.local];
      this.put(target, providerId, { type: 'api_key', key });
      this.remove(other, providerId);
    });
  }
}

/** A store holding one key, unsaved: for the Settings sheet's Test button. */
export function keyOnly(providerId: string, key: string): CredentialStore {
  const credential: Credential | undefined = key ? { type: 'api_key', key } : undefined;
  return {
    read: async id => (id === providerId ? credential : undefined),
    list: async () => (credential ? [{ providerId, type: 'api_key' as const }] : []),
    modify: async (id, fn) =>
      id === providerId ? ((await fn(credential)) ?? credential) : fn(undefined),
    delete: async () => {},
  };
}

/** The page's key store, shared by the Settings sheet and the agent. */
export const credentials = new BrowserCredentialStore();

/**
 * Asks the app to show its Settings sheet. The Apple apps' Settings menu
 * item (⌘,) will send it (ganymede-ui#166).
 */
export const SHOW_SETTINGS_EVENT = 'ganymede:show-settings';
