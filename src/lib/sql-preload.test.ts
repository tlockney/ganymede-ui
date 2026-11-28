import { describe, expect, it, vi } from 'vitest';
import { SQL_FILES_ANNOUNCE, SQL_FILES_CALLS } from './sql-files-protocol';
import {
  installSqlFiles,
  type PreloadComm,
  type PreloadCommApi,
  type PreloadCommMessage,
  type PreloadCommSendOptions,
  type PreloadSql,
  type SqlPreloadJupyter,
} from './sql-preload';

function fakeSql() {
  const registered: { name: string; bytes: Uint8Array }[] = [];
  const ranQueries: { text: string; params: unknown[] }[] = [];
  const loads: { name: string; source: unknown }[] = [];
  let closes = 0;

  const rawMarker = Symbol('raw');
  const rawValues = new WeakMap<object, string>();

  const sqlFn = (async (strings: TemplateStringsArray, ...values: unknown[]) => {
    let text = strings[0] ?? '';
    const params: unknown[] = [];
    for (let i = 0; i < values.length; i++) {
      const v = values[i];
      if (v && typeof v === 'object' && rawValues.has(v)) {
        text += rawValues.get(v)!;
      } else {
        text += '?';
        params.push(v);
      }
      text += strings[i + 1] ?? '';
    }
    ranQueries.push({ text, params });
    return {};
  }) as unknown as PreloadSql;

  sqlFn.query = vi.fn(async (text: string, params: unknown[] = []) => {
    ranQueries.push({ text, params });
    return {};
  });
  sqlFn.raw = (text: string) => {
    const frag = { [rawMarker]: text };
    rawValues.set(frag, text);
    return frag;
  };
  sqlFn.load = vi.fn(async (name: string, source: unknown) => {
    loads.push({ name, source });
  });
  sqlFn.close = vi.fn(async () => {
    closes++;
  });
  sqlFn.connection = vi.fn(async () => ({
    bindings: {
      registerFileBuffer: vi.fn(async (name: string, bytes: Uint8Array) => {
        // Store a copy before simulating buffer detachment like DuckDB wasm postMessage.
        registered.push({ name, bytes: bytes.slice() });
      }),
    },
  }));

  return {
    sql: sqlFn,
    registered,
    ranQueries,
    loads,
    get closes() {
      return closes;
    },
  };
}

interface PairedFrontend {
  sendFromFrontend: (data: Record<string, unknown>, buffers?: Uint8Array[]) => void;
  closeFromFrontend: () => void;
}

function fakeComms(onAnnounce?: (comm: PreloadComm, frontend: PairedFrontend) => void) {
  const targets = new Map<
    string,
    (comm: PreloadComm, msg: PreloadCommMessage) => void | Promise<void>
  >();
  const announcements: { target: string; data: Record<string, unknown> }[] = [];
  const sentToFrontend: { data: Record<string, unknown>; options?: PreloadCommSendOptions }[] = [];

  const acceptFromFrontend = (targetName: string): PairedFrontend => {
    let msgHandler: ((m: PreloadCommMessage) => void | Promise<void>) | undefined;
    let closeHandler: ((m: PreloadCommMessage) => void | Promise<void>) | undefined;
    let closed = false;
    const kernelEnd: PreloadComm = {
      id: `comm-${Math.random()}`,
      targetName,
      get closed() {
        return closed;
      },
      send(data = {}, options) {
        if (!closed) sentToFrontend.push({ data, options });
      },
      close() {
        closed = true;
      },
      onMsg(handler) {
        msgHandler = handler;
      },
      onClose(handler) {
        closeHandler = handler;
      },
    };
    void targets.get(targetName)?.(kernelEnd, { data: {}, metadata: {}, buffers: [] });
    return {
      sendFromFrontend(data, buffers = []) {
        void msgHandler?.({ data, metadata: {}, buffers });
      },
      closeFromFrontend() {
        closed = true;
        void closeHandler?.({ data: {}, metadata: {}, buffers: [] });
      },
    };
  };

  const api: PreloadCommApi = {
    open(targetName, data = {}) {
      announcements.push({ target: targetName, data });
      let closed = false;
      const announceComm: PreloadComm = {
        id: 'announce',
        targetName,
        get closed() {
          return closed;
        },
        send() {},
        close() {
          closed = true;
        },
        onMsg() {},
        onClose() {},
      };
      if (targetName === SQL_FILES_ANNOUNCE && onAnnounce) {
        queueMicrotask(() => onAnnounce(announceComm, acceptFromFrontend(SQL_FILES_CALLS)));
      }
      return announceComm;
    },
    registerTarget(targetName, handler) {
      targets.set(targetName, handler);
    },
  };

  return { api, announcements, sentToFrontend };
}

describe('installSqlFiles preload', () => {
  it('announces on sql.load for a local file, registers owned bytes, and forwards load', async () => {
    const fake = fakeSql();
    const csv = new TextEncoder().encode('moon,km\nIo,1821\n');
    // Slice out of a larger buffer to verify exact offset copying.
    const backing = new Uint8Array(csv.length + 10);
    backing.set(csv, 4);
    const sliced = backing.subarray(4, 4 + csv.length);

    let channel: PairedFrontend | undefined;
    const comms = fakeComms((_announce, fe) => {
      channel = fe;
    });
    const jupyter: SqlPreloadJupyter = { sql: fake.sql, comm: comms.api };
    installSqlFiles(jupyter);

    const pending = jupyter.sql!.load('moons', 'Moons & "More".csv');
    await vi.waitFor(() => expect(comms.sentToFrontend).toHaveLength(1));
    const req = comms.sentToFrontend[0].data;
    expect(req).toMatchObject({ op: 'read', path: 'Moons & "More".csv' });
    channel!.sendFromFrontend({ id: req.id, names: ['Moons & "More".csv'] }, [sliced]);
    await pending;

    expect(fake.registered).toHaveLength(1);
    expect(fake.registered[0].name).toBe('Moons & "More".csv');
    expect(new TextDecoder().decode(fake.registered[0].bytes)).toBe('moon,km\nIo,1821\n');
    expect(fake.loads).toEqual([{ name: 'moons', source: 'Moons & "More".csv' }]);

    // Re-running sql.load re-reads fresh bytes using the existing calls comm (no second announce).
    const second = jupyter.sql!.load('moons', 'Moons & "More".csv');
    await vi.waitFor(() => expect(comms.sentToFrontend).toHaveLength(2));
    expect(comms.announcements).toHaveLength(1);
    const req2 = comms.sentToFrontend[1].data;
    channel!.sendFromFrontend({ id: req2.id, names: ['Moons & "More".csv'] }, [
      new TextEncoder().encode('moon,km\nEuropa,1560\n'),
    ]);
    await second;
    expect(new TextDecoder().decode(fake.registered[1].bytes)).toBe('moon,km\nEuropa,1560\n');
  });

  it('skips comm for row arrays, URLs, absolute/glob paths, and queries without files', async () => {
    const fake = fakeSql();
    const comms = fakeComms();
    const jupyter: SqlPreloadJupyter = { sql: fake.sql, comm: comms.api };
    installSqlFiles(jupyter);

    await jupyter.sql!.load('moons', [{ moon: 'Io' }]);
    await jupyter.sql!.load('remote', 'https://example.com/moons.csv');
    await jupyter.sql!.load('abs', '/tmp/moons.csv');
    await jupyter.sql!.load('glob', 'data/*.csv');
    await jupyter.sql!`select ${1} as one`;
    await jupyter.sql!.query('select 2 as two');

    expect(comms.announcements).toHaveLength(0);
    expect(fake.loads).toHaveLength(4);
    expect(fake.ranQueries).toHaveLength(2);
  });

  it('fetches files referenced in jupyter.sql, sql.raw, and sql.query, caching until sql.close', async () => {
    const fake = fakeSql();
    let channel: PairedFrontend | undefined;
    const comms = fakeComms((_announce, fe) => {
      channel = fe;
    });
    const jupyter: SqlPreloadJupyter = { sql: fake.sql, comm: comms.api };
    installSqlFiles(jupyter);

    const q1 = jupyter.sql!`select * from 'a.csv'`;
    await vi.waitFor(() => expect(comms.sentToFrontend).toHaveLength(1));
    expect(comms.sentToFrontend[0].data).toMatchObject({
      op: 'sql',
      sql: "select * from 'a.csv'",
      loaded: [],
    });
    channel!.sendFromFrontend({ id: comms.sentToFrontend[0].data.id, names: ['a.csv'] }, [
      new TextEncoder().encode('x\n1\n'),
    ]);
    await q1;

    // A second query passes loaded: ['a.csv'].
    const pathLit = "'b.parquet'";
    const q2 = jupyter.sql!`select * from ${jupyter.sql!.raw(pathLit)} join 'a.csv' using (x)`;
    await vi.waitFor(() => expect(comms.sentToFrontend).toHaveLength(2));
    expect(comms.sentToFrontend[1].data).toMatchObject({
      op: 'sql',
      sql: "select * from 'b.parquet' join 'a.csv' using (x)",
      loaded: ['a.csv'],
    });
    channel!.sendFromFrontend({ id: comms.sentToFrontend[1].data.id, names: ['b.parquet'] }, [
      new TextEncoder().encode('PAR1'),
    ]);
    await q2;

    // Closing DuckDB resets the cache so 'a.csv' must be re-registered on next query.
    await jupyter.sql!.close();
    const q3 = jupyter.sql!.query("select * from 'a.csv'");
    await vi.waitFor(() => expect(comms.sentToFrontend).toHaveLength(3));
    expect(comms.sentToFrontend[2].data).toMatchObject({ op: 'sql', loaded: [] });
    channel!.sendFromFrontend({ id: comms.sentToFrontend[2].data.id, skip: true });
    await q3;
  });

  it('rejects on server error without running DuckDB, and lets skip or timeout fall through', async () => {
    const fake = fakeSql();
    let channel: PairedFrontend | undefined;
    const comms = fakeComms((_announce, fe) => {
      channel = fe;
    });
    const jupyter: SqlPreloadJupyter = { sql: fake.sql, comm: comms.api };
    installSqlFiles(jupyter);

    const errLoad = jupyter.sql!.load('big', 'big.csv');
    await vi.waitFor(() => expect(comms.sentToFrontend).toHaveLength(1));
    channel!.sendFromFrontend({ id: comms.sentToFrontend[0].data.id, error: 'big.csv is 12 MB' });
    await expect(errLoad).rejects.toThrow('big.csv is 12 MB');
    expect(fake.loads).toHaveLength(0);

    const skipLoad = jupyter.sql!.load('manual', 'manual.csv');
    await vi.waitFor(() => expect(comms.sentToFrontend).toHaveLength(2));
    channel!.sendFromFrontend({ id: comms.sentToFrontend[1].data.id, skip: true });
    await skipLoad;
    expect(fake.registered).toHaveLength(0);
    expect(fake.loads).toEqual([{ name: 'manual', source: 'manual.csv' }]);

    // Standalone kernel without frontend times out quickly and falls through.
    const fakeNoFe = fakeSql();
    const silentComms = fakeComms();
    const standalone: SqlPreloadJupyter = { sql: fakeNoFe.sql, comm: silentComms.api };
    installSqlFiles(standalone, { timeoutMs: 10 });
    await standalone.sql!.load('moons', 'moons.csv');
    expect(fakeNoFe.loads).toEqual([{ name: 'moons', source: 'moons.csv' }]);
  });

  it('aborts an in-flight read when jupyter.signal aborts', async () => {
    const fake = fakeSql();
    const controller = new AbortController();
    const comms = fakeComms(() => {});
    const jupyter: SqlPreloadJupyter = {
      sql: fake.sql,
      comm: comms.api,
      get signal() {
        return controller.signal;
      },
    };
    installSqlFiles(jupyter);

    const p = jupyter.sql!.load('moons', 'moons.csv');
    await vi.waitFor(() => expect(comms.sentToFrontend).toHaveLength(1));
    controller.abort(new DOMException('Interrupted', 'AbortError'));
    await expect(p).rejects.toThrow(/Interrupted/);
    expect(fake.loads).toHaveLength(0);
  });
});
