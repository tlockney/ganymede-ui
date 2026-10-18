/**
 * What `@jupyterlab/notebook` needs from the browser just to load, which
 * jsdom lacks. Import this before anything that loads the notebook package
 * (a static import runs before the test's dynamic imports).
 */

// @lumino/dragdrop subclasses DragEvent when it loads.
globalThis.DragEvent ??= class extends MouseEvent {} as unknown as typeof DragEvent;

// @jupyterlab/notebook subclasses IntersectionObserver and ResizeObserver
// when it loads.
globalThis.ResizeObserver ??= class {
  observe() {}
  unobserve() {}
  disconnect() {}
} as unknown as typeof ResizeObserver;
globalThis.IntersectionObserver ??= class {
  observe() {}
  unobserve() {}
  disconnect() {}
  takeRecords() {
    return [];
  }
} as unknown as typeof IntersectionObserver;

// JupyterLab's web components read the color scheme when they load.
window.matchMedia ??= (media: string) =>
  ({
    media,
    matches: false,
    addEventListener() {},
    removeEventListener() {},
    addListener() {},
    removeListener() {},
  }) as unknown as MediaQueryList;
