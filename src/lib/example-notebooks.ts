/**
 * The example notebooks' text by file name (#414), in one chunk that
 * `examples.ts` loads on first use.
 */
const FILES = import.meta.glob<string>('/examples/*.ipynb', {
  query: '?raw',
  import: 'default',
  eager: true,
});

export const NOTEBOOKS: Record<string, string> = Object.fromEntries(
  Object.entries(FILES).map(([path, text]) => [path.split('/').pop()!, text]),
);
