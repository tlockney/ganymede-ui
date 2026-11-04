/**
 * The sample notebook (#214): a short TypeScript tour, with Markdown, a
 * table and a plot, that first-run onboarding copies into the folder
 * through the contents API. It uses only cdp-kernel's `jupyter.md` and
 * `jupyter.svg`, so it needs no packages and runs on every cdp-kernel
 * target, in the page or on a server.
 */
import type { Contents, KernelSpec } from '@jupyterlab/services';
import { lookUp } from './rename';

/** The sample's file name; another copy gets a number (`Ganymede Tour 2.ipynb`). */
export const SAMPLE_NAME = 'Ganymede Tour.ipynb';

/** How many numbered names to try before giving up. */
const MAX_COPIES = 100;

type Kernelspec = { name: string; display_name: string; language: string };

/**
 * cdp-kernel's browser kernel (`CDP_KERNEL_SPEC` in `cdp-kernel.ts`), named
 * here so this module doesn't pull the kernel into the main bundle.
 */
const CDP_BROWSER: Kernelspec = {
  name: 'cdp-browser',
  display_name: 'TypeScript (cdp-kernel)',
  language: 'typescript',
};

type Cell = { cell_type: 'markdown' | 'code'; source: string };

const CELLS: Cell[] = [
  {
    cell_type: 'markdown',
    source: [
      '# A tour of Ganymede',
      '',
      'This notebook runs TypeScript on cdp-kernel. Select a code cell and press',
      '**Shift-Enter** to run it, or use **Run All** to run them all. Edit any',
      'cell and run it again: the notebook is yours.',
    ].join('\n'),
  },
  {
    cell_type: 'code',
    source: [
      'const moons = [',
      '  { name: "Io", radiusKm: 1821.6, orbitDays: 1.769 },',
      '  { name: "Europa", radiusKm: 1560.8, orbitDays: 3.551 },',
      '  { name: "Ganymede", radiusKm: 2634.1, orbitDays: 7.155 },',
      '  { name: "Callisto", radiusKm: 2410.3, orbitDays: 16.689 },',
      '];',
      'moons.map(m => m.name).join(", ");',
    ].join('\n'),
  },
  {
    cell_type: 'markdown',
    source: [
      '## A table',
      '',
      '`jupyter.md` renders Markdown from a template string, so a table is a',
      'few lines of text built from the data.',
    ].join('\n'),
  },
  {
    cell_type: 'code',
    source: [
      'const rows = moons.map(m => `| ${m.name} | ${m.radiusKm.toFixed(1)} | ${m.orbitDays} |`);',
      'jupyter.md`',
      '| Moon | Radius (km) | Orbit (days) |',
      '| :--- | ---: | ---: |',
      '${rows.join("\\n")}',
      '`;',
    ].join('\n'),
  },
  {
    cell_type: 'markdown',
    source: [
      '## A plot',
      '',
      '`jupyter.svg` shows SVG, enough for a bar chart with no library.',
    ].join('\n'),
  },
  {
    cell_type: 'code',
    source: [
      'const largest = Math.max(...moons.map(m => m.radiusKm));',
      'const bars = moons.map((m, i) => {',
      '  const y = i * 36;',
      '  const w = (m.radiusKm / largest) * 240;',
      '  return `<text x="0" y="${y + 19}" font-size="13" fill="#888">${m.name}</text>',
      '    <rect x="80" y="${y}" width="${w.toFixed(1)}" height="28" rx="4" fill="#4f7cac"/>',
      '    <text x="${(86 + w).toFixed(1)}" y="${y + 19}" font-size="12" fill="#888">${m.radiusKm} km</text>`;',
      '});',
      'jupyter.svg`<svg xmlns="http://www.w3.org/2000/svg" width="400" height="${moons.length * 36}">${bars.join("")}</svg>`;',
    ].join('\n'),
  },
  {
    cell_type: 'markdown',
    source: [
      '## Next',
      '',
      'Press **H** outside a cell for the keyboard shortcuts. New notebooks go',
      'in the folder the sidebar shows.',
    ].join('\n'),
  },
];

/**
 * The kernel the sample asks for: a TypeScript one the backend has (its
 * default if that is one, then cdp-kernel's), else cdp-kernel's browser
 * kernel, which the pane then shows as not installed with Pick a Kernel.
 * Never a kernel in another language, where every cell would fail.
 */
export function sampleKernel(specs?: KernelSpec.ISpecModels | null): Kernelspec {
  const all = Object.values(specs?.kernelspecs ?? {}).flatMap(k => (k ? [k] : []));
  const isTs = (k: KernelSpec.ISpecModel) => k.language.toLowerCase() === 'typescript';
  const byDefault = all.find(k => k.name === specs?.default);
  const pick =
    (byDefault && isTs(byDefault) ? byDefault : undefined) ??
    all.find(k => isTs(k) && k.name.startsWith('cdp-')) ??
    all.find(isTs) ??
    CDP_BROWSER;
  return { name: pick.name, display_name: pick.display_name, language: pick.language };
}

/** The sample as an nbformat 4 notebook, asking for `kernelspec`. */
export function sampleNotebook(kernelspec: Kernelspec = CDP_BROWSER) {
  return {
    nbformat: 4,
    nbformat_minor: 5,
    metadata: {
      kernelspec: {
        name: kernelspec.name,
        display_name: kernelspec.display_name,
        language: kernelspec.language,
      },
      language_info: { name: 'typescript' },
    },
    cells: CELLS.map((c, i) => ({
      id: `tour-${i + 1}`,
      cell_type: c.cell_type,
      metadata: {},
      source: c.source,
      ...(c.cell_type === 'code' ? { outputs: [], execution_count: null } : {}),
    })),
  };
}

/** The first of `name`, `name 2`, `name 3`… that is free in `dir`. */
export async function freePath(
  contents: Contents.IManager,
  dir: string,
  name: string = SAMPLE_NAME,
): Promise<string> {
  const stem = name.replace(/\.ipynb$/, '');
  for (let n = 1; n <= MAX_COPIES; n++) {
    const file = n === 1 ? name : `${stem} ${n}.ipynb`;
    const path = dir ? `${dir}/${file}` : file;
    if (!(await lookUp(contents, path))) return path;
  }
  throw new Error(`There are already ${MAX_COPIES} copies of “${stem}” here.`);
}

/**
 * Writes a copy of the sample into `dir` under a free name, through the
 * contents API, and returns its path. An earlier copy, perhaps edited, is
 * left as it is; only two windows copying at the same moment could pick
 * the same name, and then the later save wins.
 */
export async function copySample(
  contents: Contents.IManager,
  dir: string,
  specs?: KernelSpec.ISpecModels | null,
): Promise<string> {
  const path = await freePath(contents, dir);
  await contents.save(path, {
    type: 'notebook',
    format: 'json',
    content: sampleNotebook(sampleKernel(specs)),
  });
  return path;
}
