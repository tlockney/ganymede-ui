import type { Contents, ServiceManager, Session } from '@jupyterlab/services';
import { Signal } from '@lumino/signaling';
import { vi } from 'vitest';
import type { Backend, BackendConfig } from '../lib/backends';

type Entry = Partial<Contents.IModel> & Pick<Contents.IModel, 'name' | 'type'>;

/** A contents model as a server would list it. */
export function entry(e: Entry, dir = ''): Contents.IModel {
  const path = e.path ?? (dir ? `${dir}/${e.name}` : e.name);
  return {
    path,
    writable: true,
    created: '',
    last_modified: '',
    mimetype: '',
    content: null,
    format: null,
    ...e,
  };
}

/**
 * Just enough of a `ServiceManager` for the components: a contents manager
 * over an in-memory folder tree, a session list, and kernel specs.
 */
export function fakeServices(tree: Record<string, Entry[]> = { '': [] }) {
  const owner = {};
  const fileChanged = new Signal<unknown, Contents.IChangedArgs>(owner);
  const runningChanged = new Signal<unknown, Session.IModel[]>(owner);
  let running: Session.IModel[] = [];
  const contents = {
    fileChanged,
    get: vi.fn(async (path: string) => {
      const items = tree[path];
      if (!items) {
        // A file in a listed folder, with its `content` if the tree gives one.
        const dir = path.includes('/') ? path.slice(0, path.lastIndexOf('/')) : '';
        const file = tree[dir]?.find(i => (i.path ?? (dir ? `${dir}/${i.name}` : i.name)) === path);
        if (file) return entry(file, dir);
        // As a server answers: a 404.
        throw Object.assign(new Error(`No such directory: ${path}`), {
          response: { status: 404 },
        });
      }
      return entry({
        name: path.split('/').pop() ?? '',
        path,
        type: 'directory',
        // A listing leaves out what is in each file, as a server does.
        content: items.map(i => entry({ ...i, content: null }, path)),
      });
    }),
    save: vi.fn(async (path: string, model: Partial<Contents.IModel>) =>
      entry({ name: path, path, type: 'notebook', ...model }),
    ),
    newUntitled: vi.fn(),
    rename: vi.fn(async (_from: string, to: string) =>
      entry({ name: to.split('/').pop() ?? to, path: to, type: 'notebook' }),
    ),
  };
  const sessions = {
    runningChanged,
    running: () => running[Symbol.iterator](),
    refreshRunning: vi.fn(async () => {}),
    shutdown: vi.fn(async () => {}),
  };
  const kernelspecs = {
    ready: Promise.resolve(),
    specs: {
      default: 'python3',
      kernelspecs: {
        python3: {
          name: 'python3',
          display_name: 'Python 3',
          language: 'python',
          argv: [],
          resources: {},
        },
      },
    },
  };
  const services = { contents, sessions, kernelspecs } as unknown as ServiceManager.IManager;
  return {
    services,
    contents,
    sessions,
    tree,
    setRunning(next: Session.IModel[]) {
      running = next;
      runningChanged.emit(next);
    },
  };
}

export function fakeBackend(
  services: ServiceManager.IManager,
  config: BackendConfig = { kind: 'ganymede', url: '', token: 't' },
): Backend {
  return {
    config,
    label: config.kind === 'browser' ? 'This browser' : 'Ganymede',
    detail: config.kind === 'browser' ? 'Kernels in this page, no server' : 'local server',
    services,
  };
}
