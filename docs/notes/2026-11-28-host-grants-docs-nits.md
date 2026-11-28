## 2026-11-28, clarify Notebook Access 404 wording (#935)

Follow-up nits from PR #874's review:

- Reworded the Connected machines › Notebook Access paragraph in
  [docs/apps.md](../apps.md) so the 404 (`NoGrantsRoute`) exception is clearly
  distinguished from other probe failures that keep Notebook Access dimmed.
- Qualified the `hostGrantsAvailable` doc comment in
  `src/lib/host-grants.ts` to state that the page leaves Notebook Access
  available to open the sheet only on that 404 (`NoGrantsRoute`), not after
  other failures.
