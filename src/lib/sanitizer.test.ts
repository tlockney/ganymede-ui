import '../test/notebook-env';
import { describe, expect, it } from 'vitest';
import { Sanitizer } from '@jupyterlab/apputils';

// package.json overrides JupyterLab's sanitize-html (~2.12.1) with a
// release that fixes its advisories. These pin down that JupyterLab's
// sanitizer still keeps safe markup and drops scripts with it.
describe('JupyterLab sanitizer with the sanitize-html override', () => {
  const sanitizer = new Sanitizer();

  it('keeps safe markup and styles', () => {
    const out = sanitizer.sanitize(
      '<b style="color: red">bold</b><table><tr><td>1</td></tr></table>',
    );
    expect(out).toContain('<b style="color:red">bold</b>');
    expect(out).toContain('<td>1</td>');
  });

  it('drops event handlers and javascript: URLs', () => {
    const out = sanitizer.sanitize(
      '<img src="x" onerror="alert(1)"><a href="javascript:alert(1)">x</a>' +
        '<form><button formaction="javascript:alert(1)">go</button></form>',
    );
    expect(out).not.toContain('onerror');
    expect(out).not.toContain('javascript:');
  });
});
