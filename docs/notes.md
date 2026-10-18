# Development log

Findings from each step, newest last: what was built, what was checked,
what broke, and what was learned. Entries before the conventions below
are in [notes/archive.md](notes/archive.md).

## Adding an entry

Each pull request adds its own file to [`notes/`](notes/), named
`YYYY-MM-DD-<topic>.md` (for example `2026-10-18-release-pipeline.md`),
instead of appending to one shared file, so pull requests open at the
same time don't conflict. The file holds one entry that starts with
`## YYYY-MM-DD, <topic> (#<issue>)`. Links are relative to `notes/`
(`../../README.md`). `npm run check` fails on a misnamed file or a
missing heading.
