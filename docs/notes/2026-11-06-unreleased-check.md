## 2026-11-06, Check for inline "unreleased" (#338)

0.4.0 shipped apple/README with "(unreleased)" on the in-app kernel,
which 0.4.0 included: the release removes notes it finds by grepping for
`Unreleased\.`, and an inline marker doesn't match. The 2026-11-06 docs
review proposed a check, and Thomas agreed.

`scripts/check-unreleased.mjs`, run by `npm run check`, reads README.md,
apple/README.md and `docs/*.md` (not `releasing.md`, which describes the
notes), skips code blocks and code spans, and fails on any "unreleased"
that isn't the `**Unreleased.**` of the standard note, or a note outside
a blockquote. Ganymede has the same check in its `pages` workflow.
