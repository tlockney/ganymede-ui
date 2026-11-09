// The headless script runner's engine (#69, a spike). Swift's side, in
// JavaScriptCore, is apple/Tests/GanymedeTests/ScriptRunnerTests.swift.
import { describe, expect, it, vi } from 'vitest';
import { decodeBase64, encodeBase64, installPolyfills, makeFetch } from './polyfills';
import { program, run, toJavaScript } from './engine';

describe('base64', () => {
  it('round-trips every length and byte', () => {
    for (let n = 0; n < 8; n++) {
      const bytes = Uint8Array.from({ length: n }, (_, i) => (i * 97 + 200) & 255);
      const text = encodeBase64(bytes);
      expect(text).toBe(Buffer.from(bytes).toString('base64'));
      expect(Array.from(decodeBase64(text))).toEqual(Array.from(bytes));
    }
  });
});

describe('toJavaScript', () => {
  it('strips types and keeps JavaScript as it is', () => {
    expect(toJavaScript('const n: number = 1')).toBe('const n = 1');
    expect(toJavaScript('const n: number = 1', 'javascript')).toBe('const n: number = 1');
  });
});

describe('program', () => {
  it('joins cells in order', () => {
    expect(program({ sources: ['let a = 1', 'a += 1'] })).toBe('var a = 1\n;\na += 1');
  });

  it('lets a later cell declare a name again', async () => {
    expect(
      await run({ sources: ['const a = 1', 'const a = 2\nlet b = a', 'let b = 3\nreturn a + b'] }),
    ).toEqual({ ok: true, value: '5' });
  });

  it('rejects imports, naming the cell', () => {
    expect(() => program({ sources: ['1', "import x from 'y'"] })).toThrow(
      /cell 2: import and export/,
    );
  });
});

describe('run', () => {
  it('returns a value as text, with top-level await', async () => {
    expect(
      await run({ sources: ['const n: number = await Promise.resolve(41)', 'return n + 1'] }),
    ).toEqual({ ok: true, value: '42' });
    expect(await run({ sources: ["return 'plain'"] })).toEqual({ ok: true, value: 'plain' });
    expect(await run({ sources: ['return { a: [1] }'] })).toEqual({ ok: true, value: '{"a":[1]}' });
  });

  it('reports errors without rejecting', async () => {
    expect(await run({ sources: ["throw new RangeError('far')"] })).toEqual({
      ok: false,
      error: 'RangeError: far',
    });
    expect((await run({ sources: ['const = 1'], language: 'javascript' })).ok).toBe(false);
  });
});

describe('installPolyfills', () => {
  it('decodes large base64 with atob', () => {
    const g: Record<string, unknown> = {};
    installPolyfills(g as never);
    const bytes = Uint8Array.from({ length: 300_000 }, (_, i) => i & 255);
    const text = (g.atob as (t: string) => string)(Buffer.from(bytes).toString('base64'));
    expect(text.length).toBe(300_000);
    expect(text.charCodeAt(257)).toBe(1);
  });

  it("adds timers over the host's, and fires them by id", () => {
    const started: Array<[number, number]> = [];
    const g: Record<string, unknown> = {
      __ganymedeSetTimer: (id: number, ms: number) => started.push([id, ms]),
    };
    installPolyfills(g as never);
    const fired = vi.fn();
    (g.setTimeout as (f: () => void, ms: number) => number)(fired, 25);
    expect(started).toHaveLength(1);
    expect(started[0][1]).toBe(25);
    (g.__ganymedeFire as (id: number) => void)(started[0][0]);
    expect(fired).toHaveBeenCalledOnce();
  });

  it('keeps the console methods it does not route', () => {
    const table = () => 'table';
    const g: Record<string, unknown> = { __ganymedeLog: () => {}, console: { log() {}, table } };
    installPolyfills(g as never);
    expect((g.console as { table: unknown }).table).toBe(table);
  });

  it('routes console to the host', () => {
    const lines: string[] = [];
    const g: Record<string, unknown> = {
      __ganymedeLog: (level: string, text: string) => lines.push(`${level}: ${text}`),
      // JavaScriptCore's own, which only Web Inspector sees.
      console: { log: () => {} },
    };
    installPolyfills(g as never);
    (g.console as Console).log('n', 2, { a: 1 });
    expect(lines).toEqual(['log: n 2 {"a":1}']);
  });
});

describe('fetch', () => {
  it('sends header values as strings, from a plain object or a Headers', async () => {
    const sent: Record<string, unknown>[] = [];
    const fetch = makeFetch(async request => {
      sent.push(JSON.parse(request) as Record<string, unknown>);
      return JSON.stringify({ status: 200, statusText: 'OK', url: 'u', headers: {}, body: '' });
    });
    await fetch('https://x.test/', { headers: { 'X-Retry': 1 } });
    await fetch('https://x.test/', { headers: new Map([['x-a', 'b']]) });
    expect(sent.map(r => r.headers)).toEqual([{ 'X-Retry': '1' }, { 'x-a': 'b' }]);
  });

  it('rejects when its signal aborts during the call', async () => {
    installPolyfills({} as never);
    const fetch = makeFetch(() => new Promise<string>(() => {}));
    const controller = new AbortController();
    const call = fetch('https://x.test/', { signal: controller.signal as never });
    controller.abort(new Error('stop'));
    await expect(call).rejects.toThrow('stop');
  });

  it('sends the request as JSON and reads the base64 body', async () => {
    let sent: Record<string, unknown> = {};
    const fetch = makeFetch(async request => {
      sent = JSON.parse(request) as Record<string, unknown>;
      return JSON.stringify({
        status: 201,
        statusText: 'created',
        url: 'https://x.test/',
        headers: { 'Content-Type': 'application/json' },
        body: encodeBase64(new TextEncoder().encode('{"ok":true}')),
      });
    });
    const response = await fetch('https://x.test/', { method: 'POST', body: 'hi' });
    expect(sent).toMatchObject({ url: 'https://x.test/', method: 'POST', body: 'aGk=' });
    expect(response.ok).toBe(true);
    expect(response.headers.get('content-type')).toBe('application/json');
    expect(await response.json()).toEqual({ ok: true });
  });

  it('turns a host error into a TypeError', async () => {
    const fetch = makeFetch(async () => JSON.stringify({ error: 'offline' }));
    await expect(fetch('https://x.test/')).rejects.toThrow(TypeError);
  });
});
