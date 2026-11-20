import { describe, expect, it, vi } from 'vitest';
import { LanguageSupport, StreamLanguage } from '@codemirror/language';
import type { IEditorLanguage } from '@jupyterlab/codemirror';

// Without the SQL chunk (#708), JavaScript and TypeScript still load.
vi.mock('./sql-highlight', () => {
  throw new Error('chunk gone');
});

const { withDuckdbSql } = await import('./sql-languages');

describe('withDuckdbSql without the SQL chunk', () => {
  it('loads TypeScript as it was', async () => {
    const plain = new LanguageSupport(StreamLanguage.define({ token: s => (s.next(), null) }));
    const spec: IEditorLanguage = {
      name: 'TypeScript',
      mime: 'application/typescript',
      load: async () => plain,
    };
    const [wrapped] = withDuckdbSql([spec]);
    await expect(wrapped!.load!()).resolves.toBe(plain);
  });
});
