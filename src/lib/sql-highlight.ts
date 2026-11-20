import { LRLanguage, LanguageSupport } from '@codemirror/language';
import { PostgreSQL, SQLDialect, sql } from '@codemirror/lang-sql';
import { parseMixed } from '@lezer/common';
import type { NestedParse, Parser, SyntaxNodeRef } from '@lezer/common';
import { highlightCode } from '@lezer/highlight';
import { jupyterHighlightStyle } from '@jupyterlab/codemirror';

// SQL highlighting for DuckDB (#708): a DuckDB dialect, SQL inside
// `jupyter.sql` templates in JavaScript and TypeScript, and a static
// highlighter for the DuckDB console's scrollback. Loaded on demand (see
// sql-languages.ts), as JupyterLab itself loads lang-sql.

/** Words DuckDB has that PostgreSQL's list lacks. */
const DUCKDB_KEYWORDS =
  'qualify pivot unpivot pivot_wider pivot_longer summarize describe pragma install load ' +
  'attach detach macro exclude replace columns asof positional anti semi lambda ' +
  'tablesample reservoir bernoulli system ' +
  'force checkpoint vacuum export import database show ' +
  'returning virtual generated always ignore respect nulls';

const DUCKDB_TYPES =
  'hugeint uhugeint ubigint uinteger usmallint utinyint tinyint int1 int2 int4 int8 ' +
  'float4 float8 struct union varint bignum bit bitstring blob bytea uuid json ' +
  'interval timestamptz timestamp_s timestamp_ms timestamp_ns datetime enum ' +
  'varchar decimal';

/** PostgreSQL plus what DuckDB adds. */
export const duckdbDialect = SQLDialect.define({
  ...PostgreSQL.spec,
  keywords: `${PostgreSQL.spec.keywords ?? ''} ${DUCKDB_KEYWORDS}`,
  types: `${PostgreSQL.spec.types ?? ''} ${DUCKDB_TYPES}`,
});

export function duckdbSql(): LanguageSupport {
  return sql({ dialect: duckdbDialect });
}

/** The tag of a template string, if it ends in an identifier: `sql`, `sql<Row>`, `a.b.sql`. */
function tagName(node: SyntaxNodeRef, doc: (from: number, to: number) => string): string | null {
  let tag = node.node.prevSibling;
  if (!tag) return null;
  if (tag.name === 'InstantiationExpression') tag = tag.firstChild;
  if (!tag) return null;
  if (tag.name === 'MemberExpression') tag = tag.lastChild;
  if (!tag || (tag.name !== 'VariableName' && tag.name !== 'PropertyName')) return null;
  return doc(tag.from, tag.to);
}

/**
 * A JavaScript or TypeScript language whose template strings tagged `sql`
 * (`jupyter.sql`…``) are parsed as DuckDB SQL, `${…}` left to JavaScript.
 */
export function withSqlTemplates(support: LanguageSupport): LanguageSupport {
  const sqlParser: Parser = duckdbSql().language.parser;
  const language = (support.language as LRLanguage).configure({
    wrap: parseMixed((node, input): NestedParse | null => {
      if (node.name !== 'TemplateString') return null;
      if (tagName(node, (from, to) => input.read(from, to)) !== 'sql') return null;
      const closed = node.to - node.from > 1 && input.read(node.to - 1, node.to) === '`';
      const end = closed ? node.to - 1 : node.to;
      const overlay: { from: number; to: number }[] = [];
      let from = node.from + 1;
      for (let child = node.node.firstChild; child; child = child.nextSibling) {
        if (child.name !== 'Interpolation') continue;
        if (child.from > from) overlay.push({ from, to: Math.min(child.from, end) });
        from = child.to;
      }
      if (end > from) overlay.push({ from, to: end });
      const ranges = overlay.filter(r => r.to > r.from);
      return ranges.length ? { parser: sqlParser, overlay: ranges } : null;
    }),
  });
  return new LanguageSupport(language, support.support);
}

/** Fills `el` with `code`, highlighted as DuckDB SQL in the notebook's colors. */
export function highlightSqlInto(el: HTMLElement, code: string): void {
  el.textContent = '';
  const tree = duckdbDialect.language.parser.parse(code);
  highlightCode(
    code,
    tree,
    jupyterHighlightStyle,
    (token, classes) => {
      const span = document.createElement('span');
      span.className = classes;
      span.textContent = token;
      el.appendChild(span);
    },
    () => {
      el.appendChild(document.createTextNode('\n'));
    },
  );
}
