## 2026-11-20, SQL in `jupyter.sql.query(…)` (#744)

#708 highlights a template string tagged `sql` as DuckDB SQL. A query
written as a call, ``jupyter.sql.query(`…`)``, stayed one string. Now a
template string that is the first argument of a call to `<…>sql.query`
(`jupyter.sql.query`, with or without type arguments) is parsed as SQL
too, through the same `parseMixed` overlay that skips each
`Interpolation`. `isSqlQueryArgument` reads the Lezer tree: the template's
parent is an `ArgList` and its previous sibling is `(`, and the callee
(under an `InstantiationExpression` for `query<Row>(`) is a
`MemberExpression` ending in `.query` whose object ends in `sql`, by the
same rule as a tag. A later argument, another method, another object, a
bare `query(` and a template nested inside the argument stay plain.

The overlay already treats the pieces between interpolations as one SQL
text, so `'${FROM}'` stays one string with the interpolation in
JavaScript colours, and SQL resumes after it; the new test checks that.

Tests: `sql-highlight.test.ts` (the call forms that match and don't, and
the issue's second example token by token). Checked by hand in the app
with a notebook holding both examples, in light and dark.
