declare module 'virtual:kernel-modules' {
  /** cdp-kernel's import specifier -> the path the app serves it at (scripts/kernel-modules.ts). */
  const modules: { readonly [specifier: string]: string };
  export default modules;
}

declare module 'virtual:kernel-typescript' {
  /** Where the app serves TypeScript 6, its lib files and cdp-kernel's runtime types (#668). */
  const urls: { module: string; libs: string; runtimeTypes: string };
  export default urls;
}

declare module 'virtual:sql-preload' {
  /** Worker preload registering local data files with DuckDB wasm (#678). */
  const url: string;
  export default url;
}
