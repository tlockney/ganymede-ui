// The files the app serves for the browser kernel's TypeScript (#668).
import { describe, expect, it } from 'vitest';
import { esnextLibFiles, kernelTypescript, servedFiles } from './kernel-typescript.ts';

describe('kernel-typescript', () => {
  it('follows lib references from lib.esnext.d.ts, once each', () => {
    const libs = {
      'lib.esnext.d.ts': '/// <reference lib="es2024" />\n/// <reference lib="ESNext.Array" />',
      'lib.es2024.d.ts': '/// <reference lib="es5" />',
      'lib.esnext.array.d.ts': '/// <reference lib="es5" />',
      'lib.es5.d.ts': '/// <reference lib="decorators" />',
      'lib.decorators.d.ts': '',
    };
    expect(esnextLibFiles(name => libs[name])).toEqual([
      'lib.decorators.d.ts',
      'lib.es2024.d.ts',
      'lib.es5.d.ts',
      'lib.esnext.array.d.ts',
      'lib.esnext.d.ts',
    ]);
  });

  it('serves TypeScript, the ES libs and the runtime types, not lib.dom', () => {
    const names = [...servedFiles().keys()];
    const ts = names.find(n => n.endsWith('/typescript.js'));
    expect(ts).toMatch(/^typescript-6\.\d+\.\d+\/typescript\.js$/);
    const libs = names.filter(n => n.includes('/lib/'));
    expect(libs).toContain(ts.replace('typescript.js', 'lib/lib.es5.d.ts'));
    expect(libs).toContain(ts.replace('typescript.js', 'lib/lib.decorators.d.ts'));
    expect(libs.length).toBeGreaterThan(80);
    expect(names.some(n => /lib\.(dom|webworker)/.test(n))).toBe(false);
    expect(names).toContainEqual(
      expect.stringMatching(/^cdp-kernel-[\d.]+\/runtime\/display\.d\.mts$/),
    );
    expect(names.filter(n => n.includes('/runtime/')).every(n => n.endsWith('.d.mts'))).toBe(true);
  });

  it('gives the URLs under the base, and emits the files only when a page uses them', () => {
    const plugin = kernelTypescript();
    plugin.configResolved({ base: '/app/' });
    const emitted = [];
    const context = { emitFile: f => emitted.push(f.fileName) };
    plugin.generateBundle.call(context);
    expect(emitted).toEqual([]);
    const code = plugin.load(plugin.resolveId('virtual:kernel-typescript'));
    const urls = JSON.parse(code.replace(/^export default /, '').replace(/;$/, ''));
    expect(urls.module).toMatch(/^\/app\/kernel-typescript\/typescript-6[\d.]+\/typescript\.js$/);
    expect(urls.libs).toMatch(/^\/app\/kernel-typescript\/typescript-6[\d.]+\/lib\/$/);
    expect(urls.runtimeTypes).toMatch(/^\/app\/kernel-typescript\/cdp-kernel-[\d.]+\/runtime\/$/);
    plugin.generateBundle.call(context);
    expect(emitted).toContain(`kernel-typescript/${urls.module.split('/').slice(-2).join('/')}`);
    expect(emitted.length).toBe(servedFiles().size);
  });
});
