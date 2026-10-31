## 2026-10-31, review gate before merging (#137)

Every PR now needs an independent review before it merges (tlockney/ganymede#253). The reviewer adds the `review: pass` label; the `review-gate` workflow passes only with it, and a push removes it. Approvals can't be the gate because thread PRs are authored as `tlockney`, who can't approve their own PRs. CLAUDE.md has the rules, including the `spike` label; the PR template's Verification checklist is what the reviewer checks the diff against.
