## 2026-11-20, SQL highlighting (#708)

DuckDB SQL is highlighted in three places: the DuckDB console's input and
scrollback, `sql` template strings in JavaScript and TypeScript cells, and
Markdown fences marked `duckdb`. All of it lives in `src/lib/sql-highlight.ts`
(the module that imports `@codemirror/lang-sql`) and `src/lib/sql-languages.ts`
(registry glue, no static lang-sql import).

`duckdbDialect` is `SQLDialect.define` over PostgreSQL's spec with DuckDB's
extra keywords (`qualify`, `pivot`, `summarize`, `asof`, `exclude`, ...) and
types (`hugeint`, `uhugeint`, `struct`, `map`, ...); the lists are
space-separated strings appended to the PostgreSQL ones. `withSqlTemplates`
re-configures a JavaScript `LRLanguage` with `parseMixed`: a `TemplateString`
whose parent is a `TaggedTemplateExpression` and whose tag ends in the
identifier `sql` (`sql`, `jupyter.sql`, `x.y.sql`, `sql<Row>`; not `sqlx` or
`foo.sqlite`) mounts the DuckDB parser over the text between the backticks,
skipping each `Interpolation` child so `${...}` stays JavaScript. The closing
backtick is left out only when the template is terminated, so an unterminated
one still highlights and doesn't throw.

`jupyterlab.ts` passes the default languages through `withDuckdbSql`, which
wraps `load` of Javascript, TypeScript, JSX and TSX and adds "DuckDB SQL"
(alias `duckdb`, mime `text/x-duckdb`). Both import `sql-highlight` on demand,
as JupyterLab lazy-loads lang-sql, so it stays out of the entry chunk: the
build puts it in its own chunk, which the service worker precaches, so
the console highlights offline. Rendered Markdown fences go through `languages.highlight`
(the language's parser), so ` ```ts ` fences with `sql` templates and
` ```duckdb ` fences get it too. ` ```sql ` still uses JupyterLab's
standard SQL, unchanged.

The console's scrollback is read-only text, so `highlightSqlInto` runs
`highlightCode` with `jupyterHighlightStyle` and builds spans (no
`dangerouslySetInnerHTML`); colors follow the `--jp-mirror-editor-*`
variables, as in a cell. The input editor gets `duckdbSql()` and
`syntaxHighlighting(jupyterHighlightStyle)`.

`@codemirror/lang-sql` 6.10.0, `@codemirror/lang-javascript` 6.2.5,
`@lezer/common` 1.5.3 and `@lezer/highlight` 1.2.5 are now direct
dependencies (exact versions, as the repo pins). They were already in the tree
through `@jupyterlab/codemirror`; `package-lock.json` changed only by
declaring them, and no package was added.

Tests: `sql-highlight.test.ts` (tag forms that match and don't, interpolation,
unterminated templates, dialect keywords, the static highlighter, the registry
and Markdown-fence path) and `DuckdbConsole.test.tsx` (input and scrollback).
