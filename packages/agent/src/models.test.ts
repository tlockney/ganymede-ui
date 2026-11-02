// @vitest-environment node
import { afterEach, describe, expect, it, vi } from 'vitest';
import { modelIds, modelsFor, testModel } from './models';
import { DEFAULT_SETTINGS, keyOnly, type AgentSettings } from './settings';

const local: AgentSettings = {
  enabled: true,
  provider: 'local',
  model: 'llama3.1',
  baseUrl: 'http://localhost:11434/v1',
};

/** An OpenAI-compatible server's streamed reply, saying `text`. */
function chatStream(text: string): Response {
  const chunk = (delta: object, finish: string | null = null) =>
    `data: ${JSON.stringify({
      id: 'c1',
      object: 'chat.completion.chunk',
      created: 0,
      model: 'llama3.1',
      choices: [{ index: 0, delta, finish_reason: finish }],
    })}\n\n`;
  const body = chunk({ role: 'assistant', content: text }) + chunk({}, 'stop') + 'data: [DONE]\n\n';
  return new Response(body, { headers: { 'content-type': 'text/event-stream' } });
}

afterEach(() => vi.unstubAllGlobals());

describe('modelsFor', () => {
  it('offers the chosen provider only', () => {
    const models = modelsFor(DEFAULT_SETTINGS, keyOnly('anthropic', ''));
    expect(models.getModel('anthropic', DEFAULT_SETTINGS.model)).toBeDefined();
    expect(models.getModels('openai')).toEqual([]);
  });

  it('makes a local server one model at its base URL', () => {
    const model = modelsFor(local, keyOnly('local', '')).getModel('local', 'llama3.1');
    expect(model?.baseUrl).toBe('http://localhost:11434/v1');
    expect(model?.api).toBe('openai-completions');
  });
});

describe('modelIds', () => {
  it('lists the default model of each hosted provider', () => {
    for (const [provider, model] of [
      ['anthropic', 'claude-sonnet-5-5'],
      ['openai', 'gpt-5.5'],
      ['google', 'gemini-3.5-flash'],
    ] as const) {
      expect(modelIds({ ...DEFAULT_SETTINGS, provider, model }, keyOnly(provider, ''))).toContain(
        model,
      );
    }
  });

  it('lists nothing for a local server', () => {
    expect(modelIds(local, keyOnly('local', ''))).toEqual([]);
  });
});

describe('testModel', () => {
  it('reaches a local server without a key', async () => {
    const fetch = vi.fn(async (_url: string | URL | Request, _init?: RequestInit) =>
      chatStream('OK'),
    );
    vi.stubGlobal('fetch', fetch);
    const result = await testModel(local, keyOnly('local', ''));
    expect(result).toEqual({ ok: true, message: 'llama3.1 answered.' });
    const [url, init] = fetch.mock.calls[0]!;
    expect(String(url instanceof Request ? url.url : url)).toBe(
      'http://localhost:11434/v1/chat/completions',
    );
    const headers = new Headers(url instanceof Request ? url.headers : init?.headers);
    expect(headers.get('authorization')).toBe('Bearer none');
  });

  it("sends a local server's key when there is one", async () => {
    const fetch = vi.fn(async (_url: string | URL | Request, _init?: RequestInit) =>
      chatStream('OK'),
    );
    vi.stubGlobal('fetch', fetch);
    await testModel(local, keyOnly('local', 'sk-local'));
    const [url, init] = fetch.mock.calls[0]!;
    const headers = new Headers(url instanceof Request ? url.headers : init?.headers);
    expect(headers.get('authorization')).toBe('Bearer sk-local');
  });

  it('reports a failed request', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('{"error":{"message":"bad key"}}', { status: 401 })),
    );
    const result = await testModel(local, keyOnly('local', 'sk-wrong'));
    expect(result.ok).toBe(false);
    expect(result.message).not.toBe('');
  });

  it('explains a request the browser blocked', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new TypeError('Failed to fetch');
      }),
    );
    const result = await testModel(local, keyOnly('local', ''));
    expect(result).toEqual({
      ok: false,
      message:
        "Couldn't reach localhost:11434: it isn't running, or it doesn't let this page call it (CORS).",
    });
  });

  it('refuses a blank or non-http server URL without sending anything', async () => {
    const fetch = vi.fn(async () => chatStream('OK'));
    vi.stubGlobal('fetch', fetch);
    for (const baseUrl of ['', '  ', 'file:///etc', 'localhost:11434']) {
      const result = await testModel({ ...local, baseUrl }, keyOnly('local', 'sk-local'));
      expect(result.ok).toBe(false);
      expect(result.message).toMatch(/server URL/);
    }
    expect(fetch).not.toHaveBeenCalled();
  });

  it('reports a model the provider does not have', async () => {
    const result = await testModel(
      { ...DEFAULT_SETTINGS, enabled: true, model: 'no-such-model' },
      keyOnly('anthropic', 'sk'),
    );
    expect(result).toEqual({ ok: false, message: 'anthropic has no model no-such-model.' });
  });
});
