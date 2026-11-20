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

/** Each highlighted token as [classes, text], in order. */
function classed(
  language: { parser: { parse(s: string): never } },
  code: string,
): [string, string][] {
  const out: [string, string][] = [];
  highlightCode(
    code,
    language.parser.parse(code),
    classHighlighter,
    (text, classes) => {
      if (classes && text.trim()) out.push([classes, text]);
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

  it.each([
    ['jupyter.sql.query', 'await jupyter.sql.query(`select a from t`)'],
    ['a type argument', 'await jupyter.sql.query<Row>(`select a from t`)'],
    ['more arguments', 'await jupyter.sql.query(\n  `select a from t`,\n  opts,\n)'],
  ])('highlights the first argument of %s', (_, code) => {
    expect(keywords(code)).toEqual(expect.arrayContaining(['select', 'from']));
  });

  it.each([
    ['a later argument', 'jupyter.sql.query(q, `select a from t`)'],
    ['another method', 'jupyter.sql.run(`select a from t`)'],
    ['another object', 'jupyter.md.query(`select a from t`)'],
    ['a bare query call', 'query(`select a from t`)'],
    ['a template inside an argument', 'jupyter.sql.query(f(`select a from t`))'],
  ])('leaves %s of a query call alone', (_, code) => {
    expect(keywords(code)).not.toContain('select');
  });

  it('colors keywords, strings, numbers and comments, with ${…} inside a string', () => {
    const code = [
      'await jupyter.sql.query(`',
      '  create or replace table meter_rows as',
      '  select start, rate::double as rate -- per hour',
      "  from read_parquet('s3://${BUCKET}/x/s=${SENSOR}/*.parquet')",
      "  where d between date '${FROM}' - 2 and date '${TO}' + 1`);",
      'const after = 1;',
    ].join('\n');
    const tokens = classed(ts() as never, code);
    const of = (kind: string) => tokens.filter(([c]) => c.includes(kind)).map(([, t]) => t);
    expect(of('tok-keyword')).toEqual(
      expect.arrayContaining(['create', 'replace', 'table', 'select', 'from', 'where']),
    );
    expect(of('tok-keyword')).toEqual(expect.arrayContaining(['between', 'and', 'const']));
    expect(of('tok-typeName')).toEqual(['double', 'date', 'date']);
    expect(of('tok-comment')).toContain('-- per hour');
    expect(of('tok-number')).toEqual(expect.arrayContaining(['2', '1']));
    // Each string's pieces are strings, the interpolations are not, and the
    // SQL after a quoted `${FROM}` goes on.
    expect(of('tok-string')).toEqual(expect.arrayContaining(["'s3://", '/x/s=', "/*.parquet'"]));
    expect(of('tok-string').filter(t => t === "'")).toHaveLength(4);
    expect(of('tok-string').join('')).not.toMatch(/BUCKET|SENSOR|FROM|TO/);
    expect(tokens.find(([, t]) => t === 'SENSOR')?.[0]).toMatch(/tok-variableName/);
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
