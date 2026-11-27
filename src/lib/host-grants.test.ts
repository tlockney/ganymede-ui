import { describe, expect, it } from 'vitest';
import { ServerConnection } from '@jupyterlab/services';
import {
  NoGrantsRoute,
  describePaths,
  hostGrantsAvailable,
  hostWants,
  loadHostGrants,
  missingWants,
  pathsText,
  textPaths,
} from './host-grants';
import type { Backend, BackendConfig } from './backends';

describe('host grants', () => {
  it('reads what a notebook asks for and ignores anything else', () => {
    expect(hostWants({ host: { wants: ['notebooks.run', 3, 'self.edit'] } })).toEqual([
      'notebooks.run',
      'self.edit',
    ]);
    expect(hostWants(undefined)).toEqual([]);
    expect(hostWants({ host: { wants: 'notebooks.run' } })).toEqual([]);
  });

  it('names what a notebook asks for that its grant does not give', () => {
    const defaults = { read: [''], edit_self: true, run: [] };
    const wants = ['notebooks.read', 'notebooks.run', 'self.edit', 'secrets.get'];
    // The defaults read and edit but don't run; an unknown method can't be granted.
    expect(missingWants(wants, { path: 'a.ipynb', grant: {}, defaults })).toEqual([
      'notebooks.run',
    ]);
    // The notebook's own keys replace the defaults.
    expect(
      missingWants(wants, {
        path: 'a.ipynb',
        grant: { read: [], run: ['reports'], edit_self: false },
        defaults,
      }),
    ).toEqual(['notebooks.read', 'self.edit']);
    expect(missingWants([], { path: 'a.ipynb', grant: {}, defaults })).toEqual([]);
  });

  it('turns path lists into lines and back, with / for the root', () => {
    expect(pathsText(['', 'journal'])).toBe('/\njournal');
    expect(textPaths(' /journal/ \n\n/\njournal\nreports')).toEqual(['journal', '', 'reports']);
    expect(describePaths([])).toBe('none');
    expect(describePaths(['journal', ''])).toBe('every notebook');
    expect(describePaths(['journal', 'reports'])).toBe('journal, reports');
  });

  it("is available on a Ganymede server that runs the kernels, this device's or a machine's", () => {
    const b = (config: Backend['config']) => ({ config }) as Backend;
    expect(hostGrantsAvailable(b({ kind: 'ganymede', url: '', token: '' }))).toBe(true);
    expect(hostGrantsAvailable(b({ kind: 'ganymede', url: '', token: '', kernels: 'page' }))).toBe(
      false,
    );
    // A connected machine's own settings (#868): its window edits them
    // through the app's mount, which forwards api/host/grants (ganymede#973).
    expect(hostGrantsAvailable(b({ kind: 'ganymede', url: '', token: '', machine: 'm1' }))).toBe(
      true,
    );
    expect(
      hostGrantsAvailable(
        b({ kind: 'ganymede', url: '', token: '', machine: 'm1', kernels: 'page' }),
      ),
    ).toBe(false);
    expect(hostGrantsAvailable(b({ kind: 'browser' }))).toBe(false);
    expect(hostGrantsAvailable(undefined)).toBe(false);
  });

  // The app's own mount answers a JSON 404 for api/host/grants when its
  // bundled Ganymede predates ganymede#973: that is "no settings", in the
  // words of whichever side is missing them (#868). The page opens
  // Notebook Access on that answer, so the error says so.
  describe('a 404 with no message of its own', () => {
    const notFound = async () =>
      new Response(JSON.stringify({ message: 'Not Found', reason: null }), { status: 404 });
    const backend = (config: BackendConfig, fetch: typeof globalThis.fetch) =>
      ({
        config,
        services: {
          contents: {
            serverSettings: ServerConnection.makeSettings({ baseUrl: 'http://x/', fetch }),
          },
        },
      }) as unknown as Backend;

    it('says a machine needs a newer app', async () => {
      const machine = backend({ kind: 'ganymede', url: '', token: '', machine: 'm1' }, notFound);
      await expect(loadHostGrants(machine, 'a.ipynb')).rejects.toThrow(NoGrantsRoute);
      await expect(loadHostGrants(machine, 'a.ipynb')).rejects.toThrow(
        'Notebook access on a connected machine needs a newer version of this app.',
      );
    });

    it('says a server needs a newer Ganymede', async () => {
      const server = backend({ kind: 'ganymede', url: '', token: '' }, notFound);
      await expect(loadHostGrants(server, 'a.ipynb')).rejects.toThrow(NoGrantsRoute);
      await expect(loadHostGrants(server, 'a.ipynb')).rejects.toThrow(
        'This server has no notebook access settings. They need a newer Ganymede.',
      );
    });

    it('keeps any other answer in its own words', async () => {
      const answer = (status: number, body: string) =>
        backend(
          { kind: 'ganymede', url: '', token: '', machine: 'm1' },
          async () => new Response(body, { status }),
        );
      // Another 404 is the answer's own (a notebook that isn't there), and
      // so is a failure that isn't the missing route: neither is
      // `NoGrantsRoute`, so a machine's window keeps Notebook Access dimmed.
      const missing = answer(404, JSON.stringify({ message: 'No such notebook' }));
      await expect(loadHostGrants(missing, 'a.ipynb')).rejects.toThrow('No such notebook');
      await expect(loadHostGrants(missing, 'a.ipynb')).rejects.not.toBeInstanceOf(NoGrantsRoute);
      const failed = answer(500, 'not json');
      await expect(loadHostGrants(failed, 'a.ipynb')).rejects.toThrow('The server answered 500.');
      await expect(loadHostGrants(failed, 'a.ipynb')).rejects.not.toBeInstanceOf(NoGrantsRoute);
    });
  });
});
