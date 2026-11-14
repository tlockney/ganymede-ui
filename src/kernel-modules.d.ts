declare module 'virtual:kernel-modules' {
  /** cdp-kernel's import specifier -> the path the app serves it at (scripts/kernel-modules.ts). */
  const modules: { readonly [specifier: string]: string };
  export default modules;
}
