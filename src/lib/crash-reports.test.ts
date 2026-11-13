import { describe, expect, it, vi } from 'vitest';
import type { Event } from '@sentry/browser';
import {
  appFile,
  crashReportsSetting,
  saveCrashReports,
  scrubEvent,
  scrubText,
  startCrashReports,
} from './crash-reports';

const ORIGIN = 'http://127.0.0.1:8888';

function event(frames: { filename?: string; function?: string }[], value = 'boom'): Event {
  return {
    exception: {
      values: [{ type: 'TypeError', value, stacktrace: { frames } }],
    },
    request: {
      url: `${ORIGIN}/?path=/Users/thomas/secret.ipynb`,
      headers: { 'User-Agent': 'UA/1.0', Referer: `${ORIGIN}/x` },
    },
    breadcrumbs: [{ message: 'print(secret)' }],
    extra: { cell: 'x = 1' },
    user: { ip_address: '10.0.0.1' },
    server_name: 'laptop.local',
    contexts: { notebook: { path: '/Users/thomas/a.ipynb' } },
    tags: { url: `${ORIGIN}/` },
  };
}

describe('crashReportsSetting', () => {
  it('is off by default', () => {
    expect(crashReportsSetting({}, { getItem: () => null })).toEqual({
      enabled: false,
      owner: 'page',
    });
  });

  it("follows the app's choice over the page's", () => {
    expect(crashReportsSetting({ ganymedeCrashReports: false }, { getItem: () => 'on' })).toEqual({
      enabled: false,
      owner: 'app',
    });
    expect(crashReportsSetting({ ganymedeCrashReports: true }, { getItem: () => null })).toEqual({
      enabled: true,
      owner: 'app',
    });
  });

  it('saves and reads the browser choice', () => {
    saveCrashReports(true, localStorage);
    expect(crashReportsSetting({}, localStorage).enabled).toBe(true);
    saveCrashReports(false, localStorage);
    expect(crashReportsSetting({}, localStorage).enabled).toBe(false);
  });

  it('is off when storage throws', () => {
    const storage = {
      getItem: () => {
        throw new Error('blocked');
      },
    };
    expect(crashReportsSetting({}, storage).enabled).toBe(false);
  });
});

describe('startCrashReports', () => {
  it("doesn't load the SDK while off", async () => {
    const fetch = vi.spyOn(globalThis, 'fetch');
    expect(await startCrashReports({ enabled: false, owner: 'page' })).toBe(false);
    expect(fetch).not.toHaveBeenCalled();
  });
});

describe('scrubText', () => {
  it('drops origins, queries and home directories', () => {
    expect(
      scrubText(
        'Failed to fetch http://laptop.local:8888/api/contents/a.ipynb?token=abc in /Users/thomas/x',
      ),
    ).toBe('Failed to fetch /api/contents/a.ipynb in ~/x');
    expect(scrubText('at /home/dev/notes and C:\\Users\\dev\\n')).toBe('at ~/notes and ~\\n');
  });

  it('cuts long messages', () => {
    expect(scrubText('x'.repeat(1000))).toHaveLength(301);
  });
});

describe('appFile', () => {
  it("keeps the page's own files, by path", () => {
    expect(appFile(`${ORIGIN}/assets/main-abc.js`, ORIGIN)).toBe('app:///assets/main-abc.js');
  });

  it('rejects other origins and evaluated code', () => {
    expect(appFile('https://cdn.example/x.js', ORIGIN)).toBeNull();
    expect(appFile('<anonymous>', ORIGIN)).toBeNull();
    expect(appFile(undefined, ORIGIN)).toBeNull();
  });
});

describe('scrubEvent', () => {
  it('keeps only the error, its stack and the user agent', () => {
    const out = scrubEvent(
      event(
        [
          { filename: '<anonymous>', function: 'outer' },
          { filename: `${ORIGIN}/assets/main-abc.js`, function: 'render' },
        ],
        'bad path /Users/thomas/a.ipynb',
      ),
      ORIGIN,
    )!;
    expect(out.exception!.values![0]).toEqual({
      type: 'TypeError',
      value: 'bad path ~/a.ipynb',
      mechanism: undefined,
      stacktrace: {
        frames: [
          {
            filename: '<other>',
            abs_path: '<other>',
            function: 'outer',
            in_app: false,
            lineno: undefined,
            colno: undefined,
          },
          {
            filename: 'app:///assets/main-abc.js',
            abs_path: 'app:///assets/main-abc.js',
            function: 'render',
            in_app: true,
            lineno: undefined,
            colno: undefined,
          },
        ],
      },
    });
    expect(out.request).toEqual({ headers: { 'User-Agent': 'UA/1.0' } });
    for (const key of [
      'breadcrumbs',
      'extra',
      'user',
      'server_name',
      'contexts',
      'tags',
    ] as const) {
      expect(out[key]).toBeUndefined();
    }
  });

  it("drops errors thrown by code that isn't the page's", () => {
    // A notebook's JavaScript output, evaluated in the page.
    expect(
      scrubEvent(
        event([
          { filename: `${ORIGIN}/assets/main-abc.js` },
          { filename: '<anonymous>', function: 'userCode' },
        ]),
        ORIGIN,
      ),
    ).toBeNull();
    expect(scrubEvent(event([{ filename: 'https://cdn.example/x.js' }]), ORIGIN)).toBeNull();
  });

  it('drops the kernel_info_request a kernel restart cancels, which nothing awaits (#555)', () => {
    const frames = [
      { filename: `${ORIGIN}/assets/lib-abc.js`, function: 'restart' },
      { filename: `${ORIGIN}/assets/lib-abc.js`, function: 'dispose' },
    ];
    const canceled = event(
      frames,
      'Canceled future for kernel_info_request message before replies were done',
    );
    canceled.exception!.values![0].type = 'Error';
    expect(scrubEvent(canceled, ORIGIN)).toBeNull();
    const sent = (value: string, type = 'Error') => {
      const e = event(frames, value);
      e.exception!.values![0].type = type;
      return scrubEvent(e, ORIGIN);
    };
    // Another error type, the words mid-message, or another request are still sent.
    expect(
      sent('Canceled future for kernel_info_request message before replies were done', 'TypeError'),
    ).not.toBeNull();
    expect(sent('Kernel is dead: Canceled future for kernel_info_request x')).not.toBeNull();
    expect(
      sent('Canceled future for inspect_request message before replies were done'),
    ).not.toBeNull();
    // An app error caused by a canceled request is still sent: only the
    // outermost error counts (Sentry lists the cause first).
    const linked = event(frames, 'tooltip failed');
    linked.exception!.values!.unshift({
      type: 'Error',
      value: 'Canceled future for kernel_info_request message before replies were done',
      stacktrace: { frames },
    });
    expect(scrubEvent(linked, ORIGIN)).not.toBeNull();
  });

  it('drops errors with no stack and plain messages', () => {
    expect(scrubEvent(event([]), ORIGIN)).toBeNull();
    expect(scrubEvent({ message: 'hello' }, ORIGIN)).toBeNull();
  });
});
