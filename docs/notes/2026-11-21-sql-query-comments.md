## 2026-11-21, comments before a `jupyter.sql.query(…)` query (#766)

#744 highlights the first argument of ``jupyter.sql.query(`…`)`` as
DuckDB SQL by checking that the template's previous sibling in the Lezer
tree is `(`. A comment between them, such as a `// note` line above a
long query, is a sibling too, so the query stayed one string.
`isSqlQueryArgument` now steps back past `LineComment` and `BlockComment`
nodes before looking for `(` and before looking for the callee, and past
the `?.` of an optional call, ``jupyter.sql.query?.(`…`)``.

Tests: `sql-highlight.test.ts` adds a line comment, a block comment, a
comment before the argument list and an optional call to the forms that
highlight (each fails without the change), and a later argument after a
comment and an optional call on another object to the forms that stay
plain.
