import { ServerConnection } from '@jupyterlab/services';
import { describe, expect, it, vi } from 'vitest';
import { initialParams, parseParams, runWithParams } from './run';

const settings = (fetch: typeof globalThis.fetch) =>
  ServerConnection.makeSettings({ baseUrl: 'http://h/', fetch });
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

describe('run with parameters', () => {
  it('takes a JSON object, and empty as {}', () => {
    expect(parseParams(' ')).toEqual({});
    expect(parseParams('{"day": "mon", "n": 2}')).toEqual({ day: 'mon', n: 2 });
    expect(() => parseParams('{day: mon}')).toThrow('aren’t JSON');
    expect(() => parseParams('[1]')).toThrow('must be a JSON object');
    expect(() => parseParams('null')).toThrow('must be a JSON object');
  });

  it('starts from the parameters `ganymede execute` recorded', () => {
    expect(initialParams(undefined)).toBe('{}');
    expect(initialParams({ host: {} })).toBe('{}');
    expect(initialParams({ params: [1] })).toBe('{}');
    expect(initialParams({ params: { day: 'mon' } })).toBe('{\n  "day": "mon"\n}');
  });

  it('posts the run and answers with its results', async () => {
    const fetch = vi.fn(async (_r: RequestInfo | URL, _i?: RequestInit) =>
      json({ path: 'r/Io.ipynb', status: 'ok', results: { total: 3 }, copy: 'runs/r/Io/x.ipynb' }),
    );
    const answer = await runWithParams(
      settings(fetch),
      'r/Io.ipynb',
      { day: 'mon' },
      { save: true },
    );
    const request = fetch.mock.calls[0]![0] as Request;
    expect(request.method).toBe('POST');
    expect(request.url).toMatch(/^http:\/\/h\/api\/notebooks\/run/);
    expect(await request.json()).toEqual({
      path: 'r/Io.ipynb',
      params: { day: 'mon' },
      save: 'copy',
    });
    expect(answer).toEqual({ status: 'ok', results: { total: 3 }, copy: 'runs/r/Io/x.ipynb' });

    fetch.mockResolvedValueOnce(json({ status: 'error', results: {}, error: 'NameError: x' }));
    const failed = await runWithParams(settings(fetch), 'Io.ipynb', {}, { save: false });
    expect(await (fetch.mock.calls[1]![0] as Request).json()).toEqual({
      path: 'Io.ipynb',
      params: {},
    });
    expect(failed).toEqual({ status: 'error', results: {}, error: 'NameError: x' });
  });

  it('says what went wrong before the run, and when the server has no run', async () => {
    const fetch = vi.fn(async () =>
      json({ message: 'no kernelspec named python3', reason: null }, 400),
    );
    await expect(runWithParams(settings(fetch), 'Io.ipynb', {}, { save: false })).rejects.toThrow(
      'no kernelspec named python3',
    );
    // jupyter_server: no such route.
    fetch.mockResolvedValueOnce(json({ message: 'Not Found' }, 404));
    await expect(runWithParams(settings(fetch), 'Io.ipynb', {}, { save: false })).rejects.toThrow(
      'It needs Ganymede',
    );
    fetch.mockResolvedValueOnce(new Response('<html>', { status: 404 }));
    await expect(runWithParams(settings(fetch), 'Io.ipynb', {}, { save: false })).rejects.toThrow(
      'It needs Ganymede',
    );
    fetch.mockResolvedValueOnce(json({ unexpected: true }));
    await expect(runWithParams(settings(fetch), 'Io.ipynb', {}, { save: false })).rejects.toThrow(
      'It needs Ganymede',
    );
  });
});
