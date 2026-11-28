import { describe, expect, it, vi } from 'vitest';
import type { ISessionContext } from '@jupyterlab/apputils';
import { type Kernel, type KernelMessage, ServerConnection } from '@jupyterlab/services';
import type { JSONObject } from '@lumino/coreutils';
import { Signal } from '@lumino/signaling';
import { fakeBackend, fakeServices } from '../test/fakes';
import { attachSqlFiles } from './sql-files';
import { SQL_FILES_ANNOUNCE, SQL_FILES_CALLS } from './sql-files-protocol';

interface MockComm {
  commId: string;
  targetName: string;
  isDisposed: boolean;
  open: ReturnType<typeof vi.fn>;
  send: ReturnType<typeof vi.fn>;
  close: ReturnType<typeof vi.fn>;
  onMsg: (msg: KernelMessage.ICommMsgMsg) => void | PromiseLike<void>;
  onClose: (msg: KernelMessage.ICommCloseMsg) => void | PromiseLike<void>;
  subshellStarted?: Promise<void>;
  dispose: () => void;
}

function fakeKernel(
  clientId = 'client-1',
  options: { supportsSubshells?: boolean; subshellStarted?: Promise<void> } = {},
) {
  const targets = new Map<string, (comm: Kernel.IComm, msg: KernelMessage.ICommOpenMsg) => void>();
  const createdComms: MockComm[] = [];

  const kernel = {
    clientId,
    supportsSubshells: options.supportsSubshells ?? true,
    registerCommTarget(
      name: string,
      fn: (comm: Kernel.IComm, msg: KernelMessage.ICommOpenMsg) => void,
    ) {
      targets.set(name, fn);
    },
    removeCommTarget(
      name: string,
      fn: (comm: Kernel.IComm, msg: KernelMessage.ICommOpenMsg) => void,
    ) {
      if (targets.get(name) === fn) targets.delete(name);
    },
    createComm(targetName: string, commId = `comm-${createdComms.length + 1}`) {
      const c: MockComm = {
        commId,
        targetName,
        isDisposed: false,
        onMsg: () => {},
        onClose: () => {},
        open: vi.fn(),
        send: vi.fn(),
        close: vi.fn(() => {
          c.isDisposed = true;
        }),
        dispose() {
          c.isDisposed = true;
        },
        subshellStarted: options.subshellStarted ?? Promise.resolve(),
      };
      createdComms.push(c);
      return c;
    },
  } as unknown as Kernel.IKernelConnection;

  const emitAnnounce = (session = clientId) => {
    const fn = targets.get(SQL_FILES_ANNOUNCE);
    const openMsg = {
      content: { target_name: SQL_FILES_ANNOUNCE, comm_id: 'a1', data: {} },
      parent_header: { session },
    } as unknown as KernelMessage.ICommOpenMsg;
    fn?.({} as Kernel.IComm, openMsg);
  };

  return { kernel, targets, createdComms, emitAnnounce };
}

function fakeSession() {
  const holder = { session: null as { kernel: Kernel.IKernelConnection | null } | null };
  const kernelChanged = new Signal<unknown, unknown>(holder);
  const sessionChanged = new Signal<unknown, unknown>(holder);
  const session = {
    get session() {
      return holder.session;
    },
    kernelChanged,
    sessionChanged,
  } as unknown as ISessionContext;
  const setKernel = (kernel: Kernel.IKernelConnection | null) => {
    holder.session = kernel ? { kernel } : null;
    kernelChanged.emit(null);
  };
  return { session, setKernel };
}

function msg(data: JSONObject): KernelMessage.ICommMsgMsg {
  return { content: { comm_id: 'c', data } } as unknown as KernelMessage.ICommMsgMsg;
}

async function ask(comm: MockComm, data: JSONObject) {
  const before = comm.send.mock.calls.length;
  await comm.onMsg(msg(data));
  await vi.waitFor(() => expect(comm.send.mock.calls.length).toBeGreaterThan(before));
  return comm.send.mock.calls[before] as [JSONObject, JSONObject, ArrayBuffer[]];
}

describe('attachSqlFiles', () => {
  it('answers only announces from this session, reads files via backend, and sends exact ArrayBuffers', async () => {
    const { services } = fakeServices({
      '': [{ name: 'shared.csv', type: 'file', size: 12 }],
      sub: [
        { name: 'moons.csv', type: 'file', size: 14 },
        { name: 'note.txt', type: 'file', size: 5 },
      ],
    });
    Object.assign(services, {
      serverSettings: ServerConnection.makeSettings({ baseUrl: 'http://x/' }),
    });
    vi.spyOn(ServerConnection, 'makeRequest').mockImplementation(async url => {
      if (url.includes('/files/sub/moons.csv')) return new Response('name\nIo\n');
      if (url.includes('/files/shared.csv')) return new Response('k\n1\n');
      return new Response('missing', { status: 404 });
    });

    let notebookPath = 'sub/nb.ipynb';
    const { session, setKernel } = fakeSession();
    const attached = attachSqlFiles(session, fakeBackend(services), () => notebookPath);
    const fk = fakeKernel('page-1');
    setKernel(fk.kernel);

    // Foreign client announce is ignored.
    fk.emitAnnounce('other-client');
    await Promise.resolve();
    expect(fk.createdComms).toHaveLength(0);

    // Matching client gets CALLS comm opened after subshellStarted.
    fk.emitAnnounce('page-1');
    await vi.waitFor(() => expect(fk.createdComms[0]?.open).toHaveBeenCalledOnce());
    const comm = fk.createdComms[0];
    expect(comm.targetName).toBe(SQL_FILES_CALLS);

    // Local read inside notebook folder.
    const [reply1, , bufs1] = await ask(comm, { id: 1, op: 'read', path: 'moons.csv' });
    expect(reply1).toEqual({ id: 1, names: ['moons.csv'] });
    expect(bufs1).toHaveLength(1);
    expect(bufs1[0]).toBeInstanceOf(ArrayBuffer);
    expect(new TextDecoder().decode(bufs1[0])).toBe('name\nIo\n');

    // Relative .. within server root resolves to shared.csv.
    const [reply2, , bufs2] = await ask(comm, { id: 2, op: 'read', path: '../shared.csv' });
    expect(reply2).toEqual({ id: 2, names: ['../shared.csv'] });
    expect(new TextDecoder().decode(bufs2[0])).toBe('k\n1\n');

    // Path escaping server root is refused with an error.
    const [reply3] = await ask(comm, { id: 3, op: 'read', path: '../../secret.csv' });
    expect(reply3).toEqual({
      id: 3,
      error: expect.stringMatching(/outside this server’s root/),
    });

    // Missing or non-data file returns skip: true.
    const [reply4] = await ask(comm, { id: 4, op: 'read', path: 'missing.csv' });
    expect(reply4).toEqual({ id: 4, skip: true });
    const [reply5] = await ask(comm, { id: 5, op: 'read', path: 'note.txt' });
    expect(reply5).toEqual({ id: 5, skip: true });

    // `sql` op extracts file paths, skips already-loaded files, and respects updated notebook path.
    notebookPath = 'nb.ipynb';
    const [reply6, , bufs6] = await ask(comm, {
      id: 6,
      op: 'sql',
      sql: "select * from 'sub/moons.csv' join 'shared.csv' using (k)",
      loaded: ['shared.csv'],
    });
    expect(reply6).toEqual({ id: 6, names: ['sub/moons.csv'] });
    expect(new TextDecoder().decode(bufs6[0])).toBe('name\nIo\n');

    attached.dispose();
    expect(comm.close).toHaveBeenCalledOnce();
  });

  it('refuses a file over the in-app memory limit without downloading it', async () => {
    const { services } = fakeServices({
      '': [{ name: 'huge.csv', type: 'file', size: 20 * 1024 * 1024 }],
    });
    Object.assign(services, {
      serverSettings: ServerConnection.makeSettings({ baseUrl: 'http://x/' }),
    });
    const makeRequest = vi.spyOn(ServerConnection, 'makeRequest');

    const { session, setKernel } = fakeSession();
    const attached = attachSqlFiles(session, fakeBackend(services), () => 'nb.ipynb');
    const fk = fakeKernel('c1');
    setKernel(fk.kernel);
    fk.emitAnnounce('c1');
    await vi.waitFor(() => expect(fk.createdComms[0]?.open).toHaveBeenCalledOnce());

    const [reply] = await ask(fk.createdComms[0], { id: 1, op: 'read', path: 'huge.csv' });
    expect(makeRequest).not.toHaveBeenCalled();
    expect(reply).toEqual({
      id: 1,
      error: expect.stringMatching(/over the 8\.0 MB the in-app kernel loads in memory/),
    });

    attached.dispose();
  });

  it('drops the calls comm when subshell startup times out', async () => {
    const { services } = fakeServices({ '': [] });
    const { session, setKernel } = fakeSession();
    const attached = attachSqlFiles(session, fakeBackend(services), () => 'nb.ipynb', {
      subshellTimeoutMs: 10,
    });
    const fk = fakeKernel('c1', {
      supportsSubshells: true,
      subshellStarted: new Promise(() => {}),
    });
    setKernel(fk.kernel);
    fk.emitAnnounce('c1');

    await vi.waitFor(() => expect(fk.createdComms[0]?.close).toHaveBeenCalledOnce());
    expect(fk.createdComms[0].open).not.toHaveBeenCalled();

    attached.dispose();
  });
});
