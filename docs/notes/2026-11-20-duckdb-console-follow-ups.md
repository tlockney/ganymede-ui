## 2026-11-20, DuckDB console follow-ups (#683)

Review findings on the console (#681) that were not blockers, closed in one
change.

**Which strings are files.** `filePaths` (`src/lib/duckdb-console.ts`) read
every single-quoted string that named a data file, so valid SQL such as
`where src = 'big.parquet'` or `select '../x.csv'` was refused or read a
file it never used. It now reads a string only where DuckDB does: the table
right after `FROM` or any `JOIN`, a table after a comma in a `FROM` list, the
name after `describe`, `summarize`, `show`, `pivot`, `unpivot`,
`pivot_wider` or `pivot_longer`, and the first argument (or a list that
is the first argument, `read_csv(['a.csv', 'b.csv'])`) of a `read_*`,
`parquet_*` or `sniff_csv` function. It runs over the lexer's pieces (so
comments and `"names"` are never files; `E'...'` and `$$...$$` strings are,
as DuckDB reads them as file names, checked against the real engine),
flattened to words, punctuation and strings, with one frame per open
parenthesis or bracket, holding an "in a FROM list" flag and whether it
opens a file function's arguments: `FROM` sets it, `SELECT`, `WHERE`,
`GROUP`, `ORDER` and the like clear it, and a `(` starts a fresh level. That
is what tells `from x, 'c.csv'` (a file) from `select a, 'c.csv'`,
`in (1, 'c.csv')` and `group by a, 'c.csv'` (values). `IS DISTINCT FROM
'a.csv'` is a comparison, not a table: it neither sets nor clears the flag, so
`join u on t.x is distinct from u.x, 'a.csv'` still reads a.csv. Left as a known gap:
`extract(... from 'x')` and `trim(... from 'x')` read their string as a file
if it ends in `.csv` and so on, which no real query does.

**Streaming a result.** The console took the whole Arrow table of a result
and showed 10,000 rows of it, so `select * from range(100000000)` could end
the page on an iPhone. `Engine` (`parquet.ts`) has an optional `stream`: it
runs `connection.send(sql, true)` (duckdb-wasm 1.32, `allowStreamResult`,
so DuckDB doesn't materialise the result first), reads batches until they
hold more than the row cap, then stops reading. It does not call
`cancelSent()`: after `send()` returns that does nothing (it returns false),
so the `break` out of the read loop is what stops it, and DuckDB drops the
open result when the next statement runs. `takeBatches`
does the reading (tested with a counting reader, and through `openEngine` with a fake
module: `send(sql, true)`, no batch pulled past the cap) for both the browser engine and the Node test engine.
`fromStream` makes the batches one result for `resultTable`, which then
carries `more` and the bar says "more than 10,000 rows · showing the first
10,000". A result that ends within the cap is read whole and its count is
exact; a cut-off one counts only what was read (a few batches past the cap).
Every statement kind goes through `stream` when the engine has one (a
`create`'s `Count` row, `describe`, `show`, an empty result): the real-engine
test runs all of the console's statements that way. Two details of the Arrow
reader: its `schema` exists only after `open()`, and is gone once the stream
ends, so `takeBatches` takes it before reading. The `describe` the console
asks first still goes through `query` (it is small). An engine without
`stream` (the component tests' stand-in) falls back to `query` as before.
The real-engine test runs the blocking Node build, which, unlike the worker,
has no separate memory to save, so it asserts that fewer rows than the whole
result came out (`total` under 50,000 for a 50,000-row result), not a memory
size.

**One type map.** `plainType` and `quoteName` in the console were copies of
helpers in `parquet.ts`, and the type maps disagreed. `columnFor`
(`parquet.ts`) is now the one map, with an optional column reference so the
console reads columns by position (`#1`): integers up to 64 bits including
`UBIGINT` read as they are (Arrow gives a bigint, shown as a number while it
fits), `HUGEINT` and `UHUGEINT` as text, `DECIMAL(p,s)` of up to 18 digits (DuckDB's 64-bit decimals, such as
`DECIMAL(18,2)` money, which the Parquet view showed as numbers before) as
a double, rounded to double precision, so they sort and filter as numbers,
and a wider one as exact text, sorting as text, everything else without a plain value
(`DATE`, timestamps, lists, ...) as DuckDB's text. A list of decimals
(`DECIMAL(3,2)[]`) is not a decimal: the old `startsWith('DECIMAL')` cast it
to a double and failed. Where the old values were wrong: Parquet's `UBIGINT`
was text (now a number while it fits), its decimals past 18 digits were inexact
doubles (now exact text, so a `DECIMAL(38,1)` column such as `i * 1.5` shows
as text, not numbers), and the console left a `DATE` and a small `DECIMAL`
to its own formatter (now cast in SQL like the rest, with the same text).
`cellOf` keeps its date and decimal cases for a statement that couldn't be
described and runs as written.

**Escape strings.** The lexer reads `E'it\'s; here'` (and `e'...'`) with
backslash escapes, as one string; a normal `'a\'` is still the string `a\`.
An `e` that ends a longer word (`name'a\'`) is not a prefix.

**Repeated column names.** DuckDB names a column of a repeated name `x_1`,
`x_2` and skips a name that is taken (`x, x, x_1` is `x, x_1, x_1_1`; names
differing only in case count as the same); the console had `x`, `x_2`.
`distinctNames` does what DuckDB does, checked against the real engine.

**Tests that were missing.** `DuckdbConsole.test.tsx` covers three guards
that had none, each shown to fail without it: a result or an engine failure
that arrives after the console's engine was replaced (a new backend) is
dropped (`session.current !== started`, twice), an engine that starts after
it was replaced neither becomes the console's session nor ends the starting
line (`!gone` in the start handler), the starting line is gone once
DuckDB failed to start (`!fatal`), and ↓ leaves the cursor alone on all but
the last line of a recalled input or with a selection. The component mock of
`parquet.ts` is now partial (`importOriginal`), since the console imports
more of it. A delete that fails keeps the console open: `file-actions.test.ts`
(`onMoved` is not called) and `App.test.tsx` (the console is the same mount,
in its folder).

The docs' console section describes the rule and the cut-off. The console
shipped in 0.14.1 with the old behaviour and these are changes to it, so
they carry no Unreleased note.
