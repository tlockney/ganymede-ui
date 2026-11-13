## 2026-11-13, table output (#580)

cdp-kernel's `jupyter.table` and `jupyter.sql` (ganymede#747) write
`application/vnd.dataresource+json`: up to 1,000 rows as JSON with the
source's row count in `ganymede.rows`, next to an HTML table of the
first and last rows and a text summary. The apps showed the HTML. They
now render the JSON with `RenderedTable` (`src/lib/table-output.ts`),
ranked just ahead of `text/html`.

It sets every cell with `textContent`, so it is registered as safe and
shows the same in an untrusted notebook. Headers sort ascending,
descending, then back to the kernel's order, nulls last; numbers compare
as numbers, including the strings that large integers and `NaN` arrive
as. Rows page 50 at a time. The footer gives the range, and when the
kernel embedded fewer rows than the source has, says so, and that a
sort covers only those. The column's type shows under its name, from
the Table Schema field.

pandas writes the same type when `display.html.table_schema` is on; its
`data` rows are objects too, so it renders without changes.
