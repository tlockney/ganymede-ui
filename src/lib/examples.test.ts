// @vitest-environment node
import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
import type { Contents, KernelSpec } from '@jupyterlab/services';
import { addExamples, copyExamples, exampleNames, examplesKernel, prepare } from './examples';
import { NOTEBOOKS } from './example-notebooks';
// The script that builds the notebooks from examples/src (#414).
// @ts-expect-error: a plain .mjs script, with no types.
import { notebookName, rebuild, serialize, sources } from '../../scripts/examples.mjs';

type Cell = {
  cell_type: string;
  source: string | string[];
  metadata: Record<string, unknown>;
  execution_count?: number | null;
  outputs?: { output_type: string }[];
};
type Notebook = {
  nbformat: number;
  metadata: { kernelspec: { name: string } };
  cells: Cell[];
};
type Source = {
  stem: string;
  cells: { cell_type: string; source: string; run?: boolean; error?: boolean }[];
};

const read = (name: string): Notebook => JSON.parse(readFileSync(`examples/${name}`, 'utf8'));

describe('the example notebooks', () => {
  const all = sources() as Source[];

  it('are built from every source, in order', () => {
    expect(exampleNames(NOTEBOOKS)).toEqual(all.map(s => notebookName(s.stem, s.cells)));
    expect(exampleNames(NOTEBOOKS)[0]).toBe('01 Start Here.ipynb');
  });

  it('match their sources (node scripts/examples.mjs --run)', () => {
    for (const { stem, cells } of all) {
      const name = notebookName(stem, cells);
      expect(readFileSync(`examples/${name}`, 'utf8'), name).toBe(
        serialize(rebuild(stem, cells, `examples/${name}`)),
      );
    }
  });

  it('keep their outputs when a cell is added before them', () => {
    const { stem, cells } = all[0];
    const path = `examples/${notebookName(stem, cells)}`;
    const added = [{ cell_type: 'markdown', source: 'New.' }, ...cells];
    const nb = rebuild(stem, added, path);
    const was = read(notebookName(stem, cells));
    expect(nb.cells.slice(1).map((c: { outputs?: unknown }) => c.outputs)).toEqual(
      was.cells.map((c: { outputs?: unknown }) => c.outputs),
    );
  });

  it('show no build-server URLs in tracebacks', () => {
    for (const name of exampleNames(NOTEBOOKS)) {
      expect(NOTEBOOKS[name], name).not.toMatch(/127\.0\.0\.1|localhost:/);
    }
  });

  it('carry the outputs of every cell that runs', () => {
    for (const { stem, cells } of all) {
      const name = notebookName(stem, cells);
      const nb = read(name);
      expect(nb.nbformat).toBe(4);
      expect(nb.metadata.kernelspec.name).toBe('cdp-browser');
      cells.forEach((cell, i) => {
        if (cell.cell_type !== 'code') return;
        const saved = nb.cells[i];
        const where = `${name}, cell ${i + 1}`;
        if (!cell.run) {
          expect(saved.execution_count, where).toBeNull();
          expect(saved.outputs, where).toEqual([]);
          return;
        }
        expect(saved.execution_count, `${where} has not run`).not.toBeNull();
        const failed = saved.outputs!.some(o => o.output_type === 'error');
        expect(failed, where).toBe(!!cell.error);
      });
    }
  });
});

const spec = (name: string, language = 'typescript') => ({
  name,
  display_name: name.toUpperCase(),
  language,
  argv: [],
  resources: {},
});

describe('examplesKernel', () => {
  it('asks for the kernel the app runs itself when there is one', () => {
    const specs = {
      default: 'cdp-node',
      kernelspecs: { 'cdp-node': spec('cdp-node'), 'cdp-browser': spec('cdp-browser') },
    } as KernelSpec.ISpecModels;
    expect(examplesKernel(specs).name).toBe('cdp-browser');
  });

  it('else a TypeScript kernel, as for the sample', () => {
    const specs = {
      default: 'python3',
      kernelspecs: { python3: spec('python3', 'python'), 'cdp-node': spec('cdp-node') },
    } as KernelSpec.ISpecModels;
    expect(examplesKernel(specs).name).toBe('cdp-node');
  });
});

describe('prepare', () => {
  it('marks code cells trusted and sets the kernel', () => {
    const text = JSON.stringify({
      metadata: { kernelspec: { name: 'cdp-browser' } },
      cells: [
        { cell_type: 'markdown', metadata: {} },
        { cell_type: 'code', metadata: { tags: ['x'] } },
      ],
    });
    const kernelspec = { name: 'cdp-node', display_name: 'Node', language: 'typescript' };
    const nb = prepare(text, kernelspec);
    expect(nb.metadata.kernelspec).toEqual(kernelspec);
    expect(nb.cells[0].metadata).toEqual({});
    expect(nb.cells[1].metadata).toEqual({ tags: ['x'], trusted: true });
  });
});

/** A contents manager over the paths at `existing`. */
function contents(existing: string[] = []) {
  const files = new Map<string, unknown>(existing.map(p => [p, null]));
  return {
    files,
    get: vi.fn(async (path: string) => {
      if (!files.has(path)) throw new Error(`Could not find file with path ${path}`);
      return { path, type: files.get(path) === null ? 'directory' : 'notebook' };
    }),
    newUntitled: vi.fn(async ({ path }: { path: string }) => {
      const made = path ? `${path}/Untitled Folder` : 'Untitled Folder';
      files.set(made, null);
      return { path: made };
    }),
    rename: vi.fn(async (from: string, to: string) => {
      files.delete(from);
      files.set(to, null);
      return { path: to };
    }),
    delete: vi.fn(async (path: string) => {
      files.delete(path);
    }),
    save: vi.fn(async (path: string, model: Partial<Contents.IModel>) => {
      files.set(path, model.content);
      return { path };
    }),
  };
}

describe('copyExamples', () => {
  it('copies every notebook into a new Examples folder', async () => {
    const c = contents();
    const first = await copyExamples(c as unknown as Contents.IManager, 'work', null);
    expect(first).toBe('work/Examples/01 Start Here.ipynb');
    expect(c.rename).toHaveBeenCalledWith('work/Untitled Folder', 'work/Examples');
    const saved = [...c.files.keys()].filter(p => p.endsWith('.ipynb'));
    expect(saved).toEqual(exampleNames(NOTEBOOKS).map(n => `work/Examples/${n}`));
    const nb = c.files.get(first) as Notebook;
    expect(
      nb.cells.filter(cell => cell.cell_type === 'code').every(cell => cell.metadata.trusted),
    ).toBe(true);
  });

  it('numbers the folder when one is already there', async () => {
    const c = contents(['Examples', 'Examples 2']);
    const first = await copyExamples(c as unknown as Contents.IManager, '', null);
    expect(first).toBe('Examples 3/01 Start Here.ipynb');
  });

  it('removes its new folder when the name is taken meanwhile', async () => {
    const c = contents();
    c.rename.mockRejectedValueOnce(new Error('File already exists: Examples'));
    await expect(copyExamples(c as unknown as Contents.IManager, '', null)).rejects.toThrow(
      'already exists',
    );
    expect(c.delete).toHaveBeenCalledWith('Untitled Folder');
    expect([...c.files.keys()]).toEqual([]);
  });
});

describe('addExamples', () => {
  it('copies the examples into Examples when it is missing', async () => {
    const c = contents();
    const folder = await addExamples(c as unknown as Contents.IManager, '', null);
    expect(folder).toBe('Examples');
    expect(c.files.has('Examples/01 Start Here.ipynb')).toBe(true);
  });

  it('copies beside a file named Examples', async () => {
    const c = contents(['Examples']);
    c.get.mockImplementation(async (path: string) => {
      if (!c.files.has(path)) throw new Error(`Could not find file with path ${path}`);
      return { path, type: path === 'Examples' ? 'file' : 'directory' };
    });
    expect(await addExamples(c as unknown as Contents.IManager, '', null)).toBe('Examples 2');
    expect(c.files.has('Examples 2/01 Start Here.ipynb')).toBe(true);
  });

  it('leaves a folder that is already there and copies nothing', async () => {
    const c = contents(['work/Examples']);
    expect(await addExamples(c as unknown as Contents.IManager, 'work', null)).toBeNull();
    expect(c.newUntitled).not.toHaveBeenCalled();
    expect(c.save).not.toHaveBeenCalled();
  });
});
