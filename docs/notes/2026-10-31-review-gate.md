## 2026-10-31, independent review of every PR (#137)

Every PR now gets an advisory review from a scheduled Claude session that didn't write it (tlockney/ganymede#253). It checks the PR against its issue and the template's Verification checklist and posts `Review: pass` or `Review: changes needed`; it never waits on a person. CLAUDE.md has the rules, including the `spike` label.
