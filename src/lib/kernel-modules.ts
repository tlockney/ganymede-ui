import modules from 'virtual:kernel-modules';
import { duckdbModules, loadDuckdbFiles } from './duckdb-files';

// As the page loads, so the first kernel usually finds them mapped.
void loadDuckdbFiles();

/**
 * The browser kernel's `modules` option: the chart libraries jupyter.chart
 * imports and DuckDB's module, served by the app
 * (scripts/kernel-modules.ts), so charts draw with no network
 * (ganymede#747), and DuckDB's wasm and worker once the page has them
 * cached (duckdb-files.ts). Absolute, as the kernel's Worker resolves
 * them against its own base.
 */
export function kernelModules(): { [specifier: string]: string } {
  return {
    ...Object.fromEntries(
      Object.entries(modules).map(([specifier, url]) => [
        specifier,
        new URL(url, location.href).href,
      ]),
    ),
    ...duckdbModules(),
  };
}
