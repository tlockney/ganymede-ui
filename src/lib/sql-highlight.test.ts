import '../test/notebook-env';
import { describe, expect, it } from 'vitest';
import { javascript } from '@codemirror/lang-javascript';
import { highlightCode, classHighlighter } from '@lezer/highlight';
import { EditorLanguageRegistry } from '@jupyterlab/codemirror';
import { duckdbSql, highlightSqlInto, withSqlTemplates } from './sql-highlight';
import { withDuckdbSql } from './sql-languages';

/** The text of each token the highlighter marks as a SQL keyword or type, in order. */
function sqlTokens(language: { parser: { parse(s: string): never } }, code: string): string[] {
  const out: string[] = [];
  highlightCode(
    code,
    language.parser.parse(code),
    classHighlighter,
    (text, classes) => {
      if (/tok-(keyword|typeName)/.test(classes) && text.trim()) out.push(text);
    },
    () => {},
  );
  return out;
}

const ts = () => withSqlTemplates(javascript({ typescript: true })).language;
const keywords = (code: string) => sqlTokens(ts() as never, code);

describe('SQL in template strings', () => {
  it.each([
    ['jupyter.sql', 'await jupyter.sql`select a from t`'],
    ['a bare tag', 'const r = sql`select a from t`'],
    ['a type argument', 'const r = sql<Row>`select a from t`'],
    ['a deeper member', 'const r = x.y.sql`select a from t`'],
  ])('highlights SQL after %s', (_, code) => {
    expect(keywords(code)).toEqual(expect.arrayContaining(['select', 'from']));
  });

  it.each([
    ['another tag', 'jupyter.md`select a from t`'],
    ['a longer name', 'foo.sqlite`select a from t`'],
    ['a prefix', 'sqlx`select a from t`'],
    ['an untagged template', 'const s = `select a from t`'],
    ['a call, not a tag', 'sql(`select a from t`)'],
  ])('leaves %s alone', (_, code) => {
    expect(keywords(code)).not.toContain('select');
  });

  it('leaves an interpolation to JavaScript', () => {
    const code = 'sql`select ${from} from t where x = ${select + 1}`';
    const found = keywords(code);
    expect(found.filter(w => w === 'from')).toHaveLength(1);
    expect(found).not.toContain('select + 1');
    // `select` inside the second interpolation is a JavaScript name, not a keyword.
    expect(found.filter(w => w === 'select')).toHaveLength(1);
  });

  it('keeps SQL after a nested template in an interpolation', () => {
    expect(keywords('sql`select ${a`x`} from t`')).toEqual(expect.arrayContaining(['from']));
  });

  it('does not throw on an unterminated template, and still highlights it', () => {
    expect(() => keywords('sql`select a from')).not.toThrow();
    expect(keywords('sql`select a from')).toEqual(expect.arrayContaining(['select', 'from']));
    expect(() => keywords('sql`')).not.toThrow();
    expect(() => keywords('sql`select ${')).not.toThrow();
  });

  it('does not highlight the closing backtick as SQL', () => {
    expect(keywords('sql`select 1`; x.from = 1')).toEqual(['select']);
  });
});

describe('DuckDB dialect', () => {
  it('knows DuckDB keywords and types', () => {
    const found = sqlTokens(duckdbSql().language as never, 'select * exclude (a) from t qualify x');
    expect(found).toEqual(expect.arrayContaining(['select', 'exclude', 'from', 'qualify']));
    expect(sqlTokens(duckdbSql().language as never, 'cast(a as uhugeint)')).toContain('uhugeint');
  });

  it('highlightSqlInto keeps the text and marks keywords', () => {
    const el = document.createElement('pre');
    const code = "select 1 as n, 'a b' -- note\nfrom t\npivot t on k";
    highlightSqlInto(el, code);
    expect(el.textContent).toBe(code);
    const spans = [...el.querySelectorAll('span')];
    expect(spans.length).toBeGreaterThan(3);
    // Colors come from the notebook's highlight style: classes, not inline.
    expect(spans.every(s => !s.getAttribute('style'))).toBe(true);
    expect(spans.find(s => s.textContent === 'select')?.className).toMatch(/\S/);
    expect(spans.map(s => s.textContent)).toEqual(expect.arrayContaining(['select', 'pivot']));
  });

  it('highlightSqlInto replaces earlier content and handles empty input', () => {
    const el = document.createElement('pre');
    highlightSqlInto(el, 'select 1');
    highlightSqlInto(el, '');
    expect(el.textContent).toBe('');
  });
});

describe('language registry', () => {
  const registry = new EditorLanguageRegistry();
  for (const l of withDuckdbSql(EditorLanguageRegistry.getDefaultLanguages())) {
    registry.addLanguage(l);
  }

  it('resolves duckdb by alias and mime', async () => {
    const spec = registry.findBest('duckdb');
    expect(spec?.name).toBe('DuckDB SQL');
    expect(registry.findBest('text/x-duckdb')?.name).toBe('DuckDB SQL');
    expect(await registry.getLanguage('duckdb')).toBeTruthy();
  });

  it.each(['typescript', 'ts', 'javascript', 'js', 'jsx', 'tsx'])(
    '%s fences mount SQL in sql templates',
    async name => {
      const spec = registry.findBest(name)!;
      const support = await spec.load!();
      expect(sqlTokens(support.language as never, 'jupyter.sql`select a from t`')).toContain(
        'select',
      );
    },
  );

  it('renders a fence through languages.highlight', async () => {
    const el = document.createElement('div');
    await registry.highlight('sql`select 1`', registry.findBest('ts'), el);
    expect(el.querySelector('.cm-line, span')).toBeTruthy();
    const kw = [...el.querySelectorAll('span')].map(s => s.textContent);
    expect(kw).toContain('select');
    const plain = document.createElement('div');
    await registry.highlight('foo`select 1`', registry.findBest('ts'), plain);
    expect([...plain.querySelectorAll('span')].map(s => s.textContent)).not.toContain('select');
  });

  it('leaves the standard SQL language as JupyterLab has it', () => {
    const defaults = EditorLanguageRegistry.getDefaultLanguages();
    const ours = withDuckdbSql(defaults).find(l => l.name === 'SQL')!;
    expect(ours.load).toBe(defaults.find(l => l.name === 'SQL')!.load);
    expect(registry.findBest('sql')?.name).toBe('SQL');
  });
});
