import modules from 'virtual:kernel-modules';

/**
 * The browser kernel's `modules` option: the chart libraries jupyter.chart
 * imports, served by the app (scripts/kernel-modules.ts), so charts draw
 * with no network (ganymede#747). Absolute, as the kernel's Worker
 * resolves them against its own base.
 */
export function kernelModules(): { [specifier: string]: string } {
  return Object.fromEntries(
    Object.entries(modules).map(([specifier, url]) => [
      specifier,
      new URL(url, location.href).href,
    ]),
  );
}
