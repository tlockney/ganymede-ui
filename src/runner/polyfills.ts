// What a script expects that a bare JavaScriptCore context lacks (it has
// no web view, so no DOM, fetch or timers): the few web APIs the device
// package and simple scripts use. Each is installed only where missing,
// so the same code runs under Node in tests. A spike (#69, phase 4): just
// enough for share-sheet, Shortcuts and widget scripts.

/** The host functions Swift defines in the context (apple/.../ScriptRunner.swift). */
export interface RunnerHost {
  /** Starts a timer; Swift calls `__ganymedeFire(id)` after `ms`. */
  __ganymedeSetTimer?: (id: number, ms: number) => void;
  __ganymedeClearTimer?: (id: number) => void;
  /** One line of console output. */
  __ganymedeLog?: (level: string, text: string) => void;
  /** An HTTP request as JSON text; resolves with `{ status, statusText, url, headers, body: base64 }` as JSON text. */
  __ganymedeFetch?: (request: string) => Promise<string>;
}

type Global = typeof globalThis & RunnerHost & Record<string, unknown>;

const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

type NativeBase64 = {
  fromBase64?: (text: string) => Uint8Array;
  prototype: { toBase64?: () => string };
};
const native = Uint8Array as unknown as NativeBase64;

export function encodeBase64(bytes: Uint8Array): string {
  // JavaScriptCore has Uint8Array's own base64 (Safari 18.2+); the loop is for older engines.
  if (typeof native.prototype.toBase64 === 'function')
    return (bytes as unknown as { toBase64: () => string }).toBase64();
  let out = '';
  for (let i = 0; i < bytes.length; i += 3) {
    const n = (bytes[i] << 16) | ((bytes[i + 1] ?? 0) << 8) | (bytes[i + 2] ?? 0);
    out +=
      B64[(n >> 18) & 63] +
      B64[(n >> 12) & 63] +
      (i + 1 < bytes.length ? B64[(n >> 6) & 63] : '=') +
      (i + 2 < bytes.length ? B64[n & 63] : '=');
  }
  return out;
}

export function decodeBase64(text: string): Uint8Array {
  if (native.fromBase64) {
    try {
      return native.fromBase64(text);
    } catch {
      // Not strict base64: the loop below skips what it can't read.
    }
  }
  const clean = text.replace(/[^A-Za-z0-9+/]/g, '');
  const out = new Uint8Array(Math.floor((clean.length * 3) / 4));
  let o = 0;
  for (let i = 0; i < clean.length; i += 4) {
    const n =
      (B64.indexOf(clean[i]) << 18) |
      (B64.indexOf(clean[i + 1]) << 12) |
      ((B64.indexOf(clean[i + 2] ?? 'A') & 63) << 6) |
      (B64.indexOf(clean[i + 3] ?? 'A') & 63);
    if (o < out.length) out[o++] = (n >> 16) & 255;
    if (o < out.length && i + 2 < clean.length) out[o++] = (n >> 8) & 255;
    if (o < out.length && i + 3 < clean.length) out[o++] = n & 255;
  }
  return out.subarray(0, o);
}

function utf8Encode(text: string): Uint8Array {
  const out: number[] = [];
  for (const char of text) {
    let c = char.codePointAt(0)!;
    if (c >= 0xd800 && c <= 0xdfff) c = 0xfffd;
    if (c < 0x80) out.push(c);
    else if (c < 0x800) out.push(0xc0 | (c >> 6), 0x80 | (c & 63));
    else if (c < 0x10000) out.push(0xe0 | (c >> 12), 0x80 | ((c >> 6) & 63), 0x80 | (c & 63));
    else
      out.push(0xf0 | (c >> 18), 0x80 | ((c >> 12) & 63), 0x80 | ((c >> 6) & 63), 0x80 | (c & 63));
  }
  return new Uint8Array(out);
}

function utf8Decode(bytes: Uint8Array): string {
  let out = '';
  let i = 0;
  while (i < bytes.length) {
    const b = bytes[i];
    const need =
      b < 0x80
        ? 0
        : b >= 0xc2 && b < 0xe0
          ? 1
          : b >= 0xe0 && b < 0xf0
            ? 2
            : b >= 0xf0 && b < 0xf5
              ? 3
              : -1;
    let c = need <= 0 ? b : b & (0x3f >> need);
    let ok = need >= 0;
    for (let k = 1; ok && k <= need; k++) {
      const next = bytes[i + k];
      if (next === undefined || (next & 0xc0) !== 0x80) ok = false;
      else c = (c << 6) | (next & 63);
    }
    if (!ok || c > 0x10ffff || (c >= 0xd800 && c <= 0xdfff)) {
      out += '\uFFFD';
      i++;
      continue;
    }
    out += String.fromCodePoint(c);
    i += need + 1;
  }
  return out;
}

class SimpleEventTarget {
  #listeners = new Map<string, { fn: (event: { type: string }) => void; once: boolean }[]>();
  addEventListener(
    type: string,
    fn: ((event: { type: string }) => void) | null,
    options?: { once?: boolean } | boolean,
  ) {
    if (!fn) return;
    const list = this.#listeners.get(type) ?? [];
    if (!list.some(l => l.fn === fn))
      list.push({ fn, once: typeof options === 'object' && !!options.once });
    this.#listeners.set(type, list);
  }
  removeEventListener(type: string, fn: ((event: { type: string }) => void) | null) {
    const list = this.#listeners.get(type);
    if (list)
      this.#listeners.set(
        type,
        list.filter(l => l.fn !== fn),
      );
  }
  dispatchEvent(event: { type: string }): boolean {
    for (const l of [...(this.#listeners.get(event.type) ?? [])]) {
      if (l.once) this.removeEventListener(event.type, l.fn);
      try {
        l.fn.call(this, event);
      } catch (err) {
        console.error(err);
      }
    }
    return true;
  }
}

class SimpleDOMException extends Error {
  constructor(message = '', name = 'Error') {
    super(message);
    this.name = name;
  }
}

class SimpleAbortSignal extends SimpleEventTarget {
  aborted = false;
  reason: unknown = undefined;
  onabort: ((event: { type: string }) => void) | null = null;
  throwIfAborted() {
    if (this.aborted) throw this.reason;
  }
  _abort(reason: unknown) {
    if (this.aborted) return;
    this.aborted = true;
    this.reason = reason ?? new SimpleDOMException('This operation was aborted', 'AbortError');
    const event = { type: 'abort' };
    this.onabort?.(event);
    this.dispatchEvent(event);
  }
  static abort(reason?: unknown) {
    const signal = new SimpleAbortSignal();
    signal._abort(reason);
    return signal;
  }
  static timeout(ms: number) {
    const signal = new SimpleAbortSignal();
    setTimeout(
      () => signal._abort(new SimpleDOMException('The operation timed out.', 'TimeoutError')),
      ms,
    );
    return signal;
  }
  static any(signals: SimpleAbortSignal[]) {
    const signal = new SimpleAbortSignal();
    for (const s of signals) {
      if (s.aborted) {
        signal._abort(s.reason);
        return signal;
      }
    }
    for (const s of signals)
      s.addEventListener('abort', () => signal._abort(s.reason), { once: true });
    return signal;
  }
}

class SimpleAbortController {
  signal = new SimpleAbortSignal();
  abort(reason?: unknown) {
    this.signal._abort(reason);
  }
}

/** Installs what's missing on `g` (globalThis by default). */
export function installPolyfills(g: Global = globalThis as Global): void {
  const define = (name: string, value: unknown) => {
    if (g[name] === undefined)
      Object.defineProperty(g, name, { value, configurable: true, writable: true });
  };
  // JavaScriptCore has a console of its own, but it writes only to Web
  // Inspector: with the host's log, replace it.
  if (g.__ganymedeLog || g.console === undefined || typeof g.console.log !== 'function') {
    const log =
      (level: string) =>
      (...args: unknown[]) =>
        g.__ganymedeLog?.(
          level,
          args
            .map(a =>
              typeof a === 'string'
                ? a
                : a instanceof Error
                  ? `${a.name}: ${a.message}`
                  : safeJSON(a),
            )
            .join(' '),
        );
    // Only these five go to the host; JavaScriptCore's others (table, time, ...) stay.
    const base = (typeof g.console === 'object' && g.console) || {};
    Object.defineProperty(g, 'console', {
      value: {
        ...base,
        log: log('log'),
        info: log('info'),
        warn: log('warn'),
        error: log('error'),
        debug: log('debug'),
      },
      configurable: true,
      writable: true,
    });
  }
  if (g.setTimeout === undefined && g.__ganymedeSetTimer) {
    let next = 0;
    const timers = new Map<
      number,
      { fn: (...args: unknown[]) => void; args: unknown[]; every?: number }
    >();
    g.__ganymedeFire = (id: number) => {
      const timer = timers.get(id);
      if (!timer) return;
      if (timer.every === undefined) timers.delete(id);
      else g.__ganymedeSetTimer!(id, timer.every);
      timer.fn(...timer.args);
    };
    define('setTimeout', (fn: (...args: unknown[]) => void, ms = 0, ...args: unknown[]) => {
      const id = ++next;
      timers.set(id, { fn, args });
      g.__ganymedeSetTimer!(id, Math.max(0, Number(ms) || 0));
      return id;
    });
    define('setInterval', (fn: (...args: unknown[]) => void, ms = 0, ...args: unknown[]) => {
      const id = ++next;
      const every = Math.max(1, Number(ms) || 0);
      timers.set(id, { fn, args, every });
      g.__ganymedeSetTimer!(id, every);
      return id;
    });
    const clear = (id: number) => {
      timers.delete(id);
      g.__ganymedeClearTimer?.(id);
    };
    define('clearTimeout', clear);
    define('clearInterval', clear);
  }
  define('queueMicrotask', (fn: () => void) => void Promise.resolve().then(fn));
  define('btoa', (text: string) =>
    encodeBase64(Uint8Array.from(String(text), c => c.charCodeAt(0) & 255)),
  );
  define('atob', (text: string) => {
    // In slices: spreading a large array overflows the engine's argument limit.
    const bytes = decodeBase64(String(text));
    let out = '';
    for (let i = 0; i < bytes.length; i += 8192)
      out += String.fromCharCode(...bytes.subarray(i, i + 8192));
    return out;
  });
  define(
    'TextEncoder',
    class {
      readonly encoding = 'utf-8';
      encode(text = '') {
        return utf8Encode(String(text));
      }
    },
  );
  define(
    'TextDecoder',
    class {
      readonly encoding = 'utf-8';
      decode(bytes?: ArrayBuffer | ArrayBufferView) {
        if (!bytes) return '';
        const view =
          bytes instanceof ArrayBuffer
            ? new Uint8Array(bytes)
            : new Uint8Array(bytes.buffer, bytes.byteOffset, bytes.byteLength);
        return utf8Decode(view);
      }
    },
  );
  define('EventTarget', SimpleEventTarget);
  define('DOMException', SimpleDOMException);
  define('AbortSignal', SimpleAbortSignal);
  define('AbortController', SimpleAbortController);
  define('structuredClone', (value: unknown) => cloneValue(value));
  if (g.fetch === undefined && g.__ganymedeFetch) define('fetch', makeFetch(g.__ganymedeFetch));
}

function safeJSON(value: unknown): string {
  try {
    return JSON.stringify(value) ?? String(value);
  } catch {
    return String(value);
  }
}

function cloneValue(value: unknown): unknown {
  if (value === null || typeof value !== 'object') return value;
  if (value instanceof Uint8Array) return value.slice();
  if (value instanceof Date) return new Date(value.getTime());
  if (Array.isArray(value)) return value.map(cloneValue);
  return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, cloneValue(v)]));
}

interface FetchReply {
  status: number;
  statusText: string;
  url: string;
  headers: Record<string, string>;
  body: string;
}

/** `fetch` over Swift's URLSession: text or bytes bodies, the whole response read at once. */
export function makeFetch(host: (request: string) => Promise<string>) {
  return async (
    input: string | { url: string },
    init: {
      method?: string;
      headers?:
        Record<string, unknown> | { forEach(f: (value: string, name: string) => void): void };
      body?: string | Uint8Array | ArrayBuffer;
      signal?: SimpleAbortSignal;
    } = {},
  ) => {
    init.signal?.throwIfAborted();
    const url = typeof input === 'string' ? input : String(input.url);
    const body =
      init.body === undefined
        ? undefined
        : typeof init.body === 'string'
          ? encodeBase64(utf8Encode(init.body))
          : encodeBase64(init.body instanceof ArrayBuffer ? new Uint8Array(init.body) : init.body);
    const headers: Record<string, string> = {};
    const given = init.headers;
    if (given && typeof (given as { forEach?: unknown }).forEach === 'function')
      (given as { forEach(f: (value: string, name: string) => void): void }).forEach(
        (value, name) => (headers[name] = String(value)),
      );
    else for (const [name, value] of Object.entries(given ?? {})) headers[name] = String(value);
    const sent = host(JSON.stringify({ url, method: init.method ?? 'GET', headers, body }));
    // The host can't cancel a request yet, but an abort still rejects the call.
    const signal = init.signal;
    const text = signal
      ? await new Promise<string>((resolve, reject) => {
          const abort = () => reject(signal.reason);
          signal.addEventListener('abort', abort, { once: true });
          sent.then(resolve, reject).finally(() => signal.removeEventListener('abort', abort));
        })
      : await sent;
    const reply = JSON.parse(text) as FetchReply & { error?: string };
    if (reply.error) throw new TypeError(`fetch failed: ${reply.error}`);
    const bytes = decodeBase64(reply.body);
    const received = new Map(Object.entries(reply.headers).map(([k, v]) => [k.toLowerCase(), v]));
    return {
      ok: reply.status >= 200 && reply.status < 300,
      status: reply.status,
      statusText: reply.statusText,
      url: reply.url,
      headers: {
        get: (name: string) => received.get(name.toLowerCase()) ?? null,
        has: (name: string) => received.has(name.toLowerCase()),
      },
      text: async () => utf8Decode(bytes),
      json: async () => JSON.parse(utf8Decode(bytes)) as unknown,
      arrayBuffer: async () => bytes.slice().buffer,
      bytes: async () => bytes.slice(),
    };
  };
}
