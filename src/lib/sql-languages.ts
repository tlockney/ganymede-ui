import type { IEditorLanguage } from '@jupyterlab/codemirror';

// Kept apart from sql-highlight.ts so lang-sql stays out of the main chunk:
// it is imported when a language loads, as JupyterLab loads lang-sql.

/** The default languages that can hold `sql` template strings. */
const WITH_SQL_TEMPLATES = new Set(['Javascript', 'TypeScript', 'JSX', 'TSX']);

/**
 * JupyterLab's default languages, with `sql` templates in JavaScript and
 * TypeScript highlighted as SQL, and a "DuckDB SQL" language (#708).
 */
export function withDuckdbSql(defaults: readonly IEditorLanguage[]): IEditorLanguage[] {
  const out = defaults.map(spec => {
    if (!WITH_SQL_TEMPLATES.has(spec.name) || !spec.load) return spec;
    const load = spec.load.bind(spec);
    return {
      ...spec,
      async load() {
        const [support, sql] = await Promise.all([
          load(),
          // Without the SQL chunk (an old page after a deploy), the
          // language still loads, with its templates plain.
          import('./sql-highlight').catch(() => undefined),
        ]);
        return sql ? sql.withSqlTemplates(support) : support;
      },
    };
  });
  out.push({
    name: 'DuckDB SQL',
    displayName: 'DuckDB SQL',
    alias: ['duckdb'],
    mime: 'text/x-duckdb',
    extensions: [],
    async load() {
      return (await import('./sql-highlight')).duckdbSql();
    },
  });
  return out;
}
