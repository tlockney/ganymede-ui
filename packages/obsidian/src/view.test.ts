import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const h = vi.hoisted(() => ({
  platform: { isMacOS: true, isDesktopApp: true },
  actions: [] as { icon: string; title: string }[],
  highlight: undefined as undefined | ((el: Element) => void),
  loadPrism: undefined as unknown as () => Promise<unknown>,
  notices: [] as string[],
}));

vi.mock('obsidian', () => {
  class TFile {
    basename: string;
    constructor(public path: string) {
      this.basename = path.replace(/\.ipynb$/, '');
    }
  }
  class FileSystemAdapter {}
  class FileView {
    app: unknown;
    file: TFile | null = null;
    navigation = false;
    contentEl: HTMLElement;
    constructor(public leaf: { app: unknown }) {
      this.app = leaf.app;
      const el = document.createElement('div');
      Object.assign(el, {
        addClass: (c: string) => el.classList.add(c),
        empty: () => el.replaceChildren(),
      });
      this.contentEl = el;
    }
    onload(): void {}
    registerEvent(): void {}
    addAction(icon: string, title: string): HTMLElement {
      h.actions.push({ icon, title });
      return document.createElement('div');
    }
  }
  class Plugin {
    registerView = vi.fn();
    registerExtensions = vi.fn();
  }
  class Notice {
    constructor(message: string) {
      h.notices.push(message);
    }
  }
  return {
    FileView,
    FileSystemAdapter,
    TFile,
    Plugin,
    Notice,
    Platform: h.platform,
    loadPrism: () => h.loadPrism(),
  };
});

import { TFile } from 'obsidian';
import GanymedeNotebooksPlugin from './main.ts';
import { MODIFY_DEBOUNCE_MS, NotebookView } from './view.ts';

const tfile = (path: string) => new (TFile as unknown as new (p: string) => TFile)(path);

function notebook(source: string, cellType = 'markdown'): string {
  return JSON.stringify({
    nbformat: 4,
    metadata: { language_info: { name: 'python' } },
    cells: [{ cell_type: cellType, source, outputs: [], execution_count: 1 }],
  });
}

function deferred<T>() {
  let resolve!: (v: T) => void;
  const promise = new Promise<T>(r => (resolve = r));
  return { promise, resolve };
}

type Handler = (f: unknown) => void;

function setup() {
  const handlers: Record<string, Handler> = {};
  const cachedRead = vi.fn<(f: TFile) => Promise<string>>();
  const app = {
    vault: {
      cachedRead,
      on: (name: string, cb: Handler) => {
        handlers[name] = cb;
        return {};
      },
      adapter: {},
    },
  };
  const view = new NotebookView({ app } as never);
  view.onload();
  const file = tfile('a.ipynb');
  view.file = file as never;
  return { view, file, cachedRead, handlers };
}

beforeEach(() => {
  h.actions.length = 0;
  h.notices.length = 0;
  h.platform.isMacOS = true;
  h.platform.isDesktopApp = true;
  h.loadPrism = async () => ({ languages: { python: {} }, highlightElement: vi.fn() });
  vi.spyOn(console, 'warn').mockImplementation(() => {});
});

afterEach(() => {
  vi.useRealTimers();
});

describe('NotebookView', () => {
  it('renders the file and accepts only ipynb', async () => {
    const { view, file, cachedRead } = setup();
    cachedRead.mockResolvedValue(notebook('# Hello'));
    await view.onLoadFile(file as never);
    expect(view.contentEl.querySelector('h1')!.textContent).toBe('Hello');
    expect(view.canAcceptExtension('ipynb')).toBe(true);
    expect(view.canAcceptExtension('md')).toBe(false);
  });

  it('drops a stale render that resolves after a newer one', async () => {
    const { view, file, cachedRead } = setup();
    const first = deferred<string>();
    const second = deferred<string>();
    cachedRead.mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise);
    const a = view.onLoadFile(file as never);
    const b = view.onLoadFile(file as never);
    second.resolve(notebook('# Second'));
    await b;
    first.resolve(notebook('# First'));
    await a;
    expect(view.contentEl.textContent).toContain('Second');
    expect(view.contentEl.textContent).not.toContain('First');
  });

  it('drops a render that resolves after the file was unloaded', async () => {
    const { view, file, cachedRead } = setup();
    const d = deferred<string>();
    cachedRead.mockReturnValueOnce(d.promise);
    const load = view.onLoadFile(file as never);
    await view.onUnloadFile(file as never);
    d.resolve(notebook('# Late'));
    await load;
    expect(view.contentEl.textContent).toBe('');
  });

  it('shows a message for a notebook that cannot be parsed', async () => {
    const { view, file, cachedRead } = setup();
    cachedRead.mockResolvedValue('{"nbformat":3}');
    await view.onLoadFile(file as never);
    expect(view.contentEl.textContent).toContain('Cannot open this notebook');
    expect(view.contentEl.textContent).toContain('nbformat 4');
  });

  it('ignores a modify of another file and debounces modifies of this one', async () => {
    vi.useFakeTimers();
    const { view, file, cachedRead, handlers } = setup();
    cachedRead.mockResolvedValue(notebook('# One'));
    await view.onLoadFile(file as never);
    expect(cachedRead).toHaveBeenCalledTimes(1);

    handlers.modify(tfile('other.ipynb'));
    await vi.advanceTimersByTimeAsync(MODIFY_DEBOUNCE_MS * 2);
    expect(cachedRead).toHaveBeenCalledTimes(1);

    cachedRead.mockResolvedValue(notebook('# Two'));
    handlers.modify(file);
    await vi.advanceTimersByTimeAsync(MODIFY_DEBOUNCE_MS - 50);
    handlers.modify(file);
    await vi.advanceTimersByTimeAsync(MODIFY_DEBOUNCE_MS - 50);
    expect(cachedRead).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(100);
    expect(cachedRead).toHaveBeenCalledTimes(2);
    expect(view.contentEl.querySelector('h1')!.textContent).toBe('Two');
  });

  it('cancels a pending modify when the file is unloaded', async () => {
    vi.useFakeTimers();
    const { view, file, cachedRead, handlers } = setup();
    cachedRead.mockResolvedValue(notebook('# One'));
    await view.onLoadFile(file as never);
    handlers.modify(file);
    await view.onUnloadFile(file as never);
    await vi.advanceTimersByTimeAsync(MODIFY_DEBOUNCE_MS * 2);
    expect(cachedRead).toHaveBeenCalledTimes(1);
    expect(view.contentEl.textContent).toBe('');
  });

  it('keeps an expanded code cell open across a modify', async () => {
    vi.useFakeTimers();
    const { view, file, cachedRead, handlers } = setup();
    cachedRead.mockResolvedValue(notebook('x = 1', 'code'));
    await view.onLoadFile(file as never);
    view.contentEl.querySelector('details')!.setAttribute('open', '');
    cachedRead.mockResolvedValue(notebook('x = 2', 'code'));
    handlers.modify(file);
    await vi.advanceTimersByTimeAsync(MODIFY_DEBOUNCE_MS + 10);
    const details = view.contentEl.querySelector('details')!;
    expect(details.textContent).toContain('x = 2');
    expect(details.hasAttribute('open')).toBe(true);
  });

  it('loads Prism once per view and highlights known languages only', async () => {
    const highlightElement = vi.fn();
    const loadPrism = vi.fn(async () => ({ languages: { python: {} }, highlightElement }));
    h.loadPrism = loadPrism;
    const { view, file, cachedRead } = setup();
    cachedRead.mockResolvedValue(notebook('x = 1', 'code'));
    await view.onLoadFile(file as never);
    await view.onLoadFile(file as never);
    expect(loadPrism).toHaveBeenCalledTimes(1);
    expect(highlightElement).toHaveBeenCalledTimes(2);
  });

  it('shows plain code when Prism fails to load', async () => {
    h.loadPrism = async () => {
      throw new Error('no prism');
    };
    const { view, file, cachedRead } = setup();
    cachedRead.mockResolvedValue(notebook('x = 1', 'code'));
    await view.onLoadFile(file as never);
    expect(view.contentEl.querySelector('code')!.textContent).toBe('x = 1');
  });

  it('offers Open in Ganymede only on macOS desktop', () => {
    setup();
    expect(h.actions.map(a => a.title)).toEqual(['Show/hide all code', 'Open in Ganymede']);
    h.actions.length = 0;
    h.platform.isDesktopApp = false;
    setup();
    expect(h.actions.map(a => a.title)).toEqual(['Show/hide all code']);
  });
});

describe('GanymedeNotebooksPlugin', () => {
  it('tells the person when another plugin already opens .ipynb', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const plugin = new GanymedeNotebooksPlugin({} as never, {} as never);
    (plugin.registerExtensions as ReturnType<typeof vi.fn>).mockImplementation(() => {
      throw new Error('Attempting to register an existing file extension "ipynb"');
    });
    await plugin.onload();
    expect(h.notices).toEqual(['Ganymede Notebooks: another plugin already opens .ipynb files']);
  });

  it('registers the view and the extension', async () => {
    const plugin = new GanymedeNotebooksPlugin({} as never, {} as never);
    await plugin.onload();
    expect(plugin.registerExtensions).toHaveBeenCalledWith(['ipynb'], 'ganymede-notebook');
    expect(h.notices).toEqual([]);
  });
});
