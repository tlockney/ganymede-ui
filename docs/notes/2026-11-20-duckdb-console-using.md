## 2026-11-20, DuckDB console reads the file after USING (#738)

`fileReferences` in `src/lib/duckdb-console.ts` missed a file named right
after `USING`: `delete from t using 'b.csv' b where ...` and
`merge into t using 'x.csv' s on ...`, which DuckDB reads as a table. The
console ran the statement without giving DuckDB the file, so it failed.
`afterFrom` now also accepts a string whose previous word is `using`.

`join u using (id)` is unaffected, since a string never directly follows
`using` there, and `select 'using', 'a.csv'` reads nothing, since a string
is not the keyword. Unit tests cover all four. The real-engine test now runs
a `DELETE ... USING` and a `MERGE INTO ... USING` over files named nowhere
else (the pinned duckdb-wasm 1.32.0 supports MERGE); with the fix removed,
both the unit test and the real-engine test fail.

The console is released, so docs/apps.md needs no Unreleased note.
