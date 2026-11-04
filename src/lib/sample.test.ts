import { describe, expect, it, vi } from 'vitest';
import type { Contents, KernelSpec } from '@jupyterlab/services';
import { SAMPLE_NAME, copySample, freePath, sampleKernel, sampleNotebook } from './sample';

/** A contents manager over the files at `existing`. */
function contents(existing: string[] = []) {
  const files = new Set(existing);
  return {
    get: vi.fn(async (path: string) => {
      if (!files.has(path)) throw new Error(`Could not find file with path ${path}`);
      return { path, name: path.split('/').pop(), type: 'notebook' };
    }),
    save: vi.fn(async (path: string) => {
      files.add(path);
      return { path };
    }),
  };
}
const manager = (c: ReturnType<typeof contents>) => c as unknown as Contents.IManager;

const spec = (name: string, language: string) => ({
  name,
  display_name: name.toUpperCase(),
  language,
  argv: [],
  resources: {},
});

describe('freePath', () => {
  it('uses the sample’s name in the folder when it is free', async () => {
    expect(await freePath(manager(contents()), '')).toBe(SAMPLE_NAME);
    expect(await freePath(manager(contents()), 'moons')).toBe(`moons/${SAMPLE_NAME}`);
  });

  it('numbers the name when a copy is already there', async () => {
    const c = contents(['moons/Ganymede Tour.ipynb', 'moons/Ganymede Tour 2.ipynb']);
    expect(await freePath(manager(c), 'moons')).toBe('moons/Ganymede Tour 3.ipynb');
  });

  it('passes on errors other than nothing there', async () => {
    const c = contents();
    c.get.mockRejectedValue(Object.assign(new Error('Forbidden'), { response: { status: 403 } }));
    await expect(freePath(manager(c), '')).rejects.toThrow('Forbidden');
  });
});

describe('sampleKernel', () => {
  it('prefers the default kernel when it runs TypeScript', () => {
    const specs = {
      default: 'cdp-node',
      kernelspecs: { 'cdp-node': spec('cdp-node', 'typescript'), deno: spec('deno', 'typescript') },
    } as KernelSpec.ISpecModels;
    expect(sampleKernel(specs).name).toBe('cdp-node');
  });

  it('picks cdp-kernel’s TypeScript kernel over a Python default', () => {
    const specs = {
      default: 'python3',
      kernelspecs: {
        python3: spec('python3', 'python'),
        'cdp-browser': spec('cdp-browser', 'typescript'),
      },
    } as KernelSpec.ISpecModels;
    expect(sampleKernel(specs)).toEqual({
      name: 'cdp-browser',
      display_name: 'CDP-BROWSER',
      language: 'typescript',
    });
  });

  it('falls back to the default, then to cdp-kernel’s browser kernel', () => {
    const python = {
      default: 'python3',
      kernelspecs: { python3: spec('python3', 'python') },
    } as KernelSpec.ISpecModels;
    expect(sampleKernel(python).name).toBe('python3');
    expect(sampleKernel(undefined).name).toBe('cdp-browser');
  });
});

describe('sampleNotebook', () => {
  it('is a short tour with Markdown, a table and a plot', () => {
    const nb = sampleNotebook();
    expect(nb.nbformat).toBe(4);
    expect(nb.metadata.kernelspec.language).toBe('typescript');
    expect(nb.cells.length).toBeLessThanOrEqual(8);
    const code = nb.cells.filter(c => c.cell_type === 'code').map(c => c.source);
    expect(code.some(s => s.includes('jupyter.md`'))).toBe(true);
    expect(code.some(s => s.includes('jupyter.svg`'))).toBe(true);
    // Unique ids, as nbformat 4.5 wants.
    expect(new Set(nb.cells.map(c => c.id)).size).toBe(nb.cells.length);
  });
});

describe('copySample', () => {
  it('saves the sample into the folder through the contents API', async () => {
    const c = contents();
    const path = await copySample(manager(c), 'moons');
    expect(path).toBe('moons/Ganymede Tour.ipynb');
    expect(c.save).toHaveBeenCalledWith('moons/Ganymede Tour.ipynb', {
      type: 'notebook',
      format: 'json',
      content: sampleNotebook(),
    });
  });

  it('leaves an earlier copy alone and writes the next free name', async () => {
    const c = contents(['Ganymede Tour.ipynb']);
    expect(await copySample(manager(c), '')).toBe('Ganymede Tour 2.ipynb');
    expect(await copySample(manager(c), '')).toBe('Ganymede Tour 3.ipynb');
    expect(c.save.mock.calls.map(([p]) => p)).toEqual([
      'Ganymede Tour 2.ipynb',
      'Ganymede Tour 3.ipynb',
    ]);
  });
});
