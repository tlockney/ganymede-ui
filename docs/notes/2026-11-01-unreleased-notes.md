## 2026-11-01, Unreleased notes in the docs (#139)

ganymede-server.com renders `docs/*.md` from `main`, but people install the latest release, so the site described features 0.2.0 doesn't have (autosave, sandboxed output frames, the token in session storage, notebook windows on the Mac, remotes). This repo now follows ganymede's rule: a feature documented before it is released gets a `> [!NOTE]` with `**Unreleased.**` (CLAUDE.md), and `scripts/release.sh --execute` prints those notes and lists them in the release pull request, to be removed on the release branch.

Notes:

- The other option in the issue, having the site fetch docs from the latest release tag, would hide documentation for work on `main` entirely and need a change in ganymede's `fetch-ui`. Notes keep one source and match how ganymede handles its own docs.
- The notes added here cover everything documented since v0.2.0, one per section, each naming what is unreleased. Fixes to released behavior (the relay's 30-second answer) got none.
- `docs/releasing.md` links CLAUDE.md by its GitHub URL: the site doesn't fetch CLAUDE.md, so a relative link would break there.
