# CLAUDE.md

Guidance for Claude working in this repository. [CONTRIBUTING.md](CONTRIBUTING.md)
has the build, test, and pull request rules; this file adds what it doesn't.

## Documenting unreleased features

ganymede-server.com renders this repo's `docs/*.md` (all but `notes.md`)
from `main`, and the README on GitHub is `main`'s too, but people install
the latest release. So when a change documents a feature, setting, or
behavior that the latest release doesn't have, add this note next to it
in `README.md` or `docs/*.md`:

```md
> [!NOTE]
> **Unreleased.** Available only from a build of `main` (HEAD), not in
> the latest release.
```

It renders as a note on GitHub and on the site. Keep the words
`**Unreleased.**` as they are: the release looks for them. The rest of
the note may say what is unreleased, or what the release does instead.
Put one note per section the feature adds, not one per paragraph. A fix
to a feature that is already released needs no note.

## Cutting a release

Releases follow [docs/releasing.md](docs/releasing.md). Before the
release pull request merges, review every "Unreleased" note:

```sh
grep -rn 'Unreleased\.' README.md docs/*.md
```

`scripts/release.sh --execute` prints them and lists them in the pull
request. The release ships everything on `main` when the branch was cut,
so on the release branch remove each of those notes, and reword the text
around a note if it read as unreleased. A note added to `main` after the
branch was cut stays.

## Independent review

Every PR gets a review from a Claude session that didn't write it. A
scheduled reviewer reviews each open PR once CI is green: the
code-review skill at high effort, the PR against its issue's acceptance
criteria, and the PR template's Verification checklist against the
diff. It posts one GitHub review ending in `Review: pass` or
`Review: changes needed`. The review is advisory and makes every call
itself: it never waits on a person.

- The author treats `Review: changes needed` like a CI failure: fix it,
  or answer the finding on its thread with why not.
- New dependencies, advisory ignores, license exceptions, `unsafe`, new
  network surface, and API changes must be justified in the PR; the
  reviewer fails a PR that doesn't.

## Spikes

A PR that tries an approach before committing to it gets the `spike`
label. It may merge when its new code is off by default (behind a
feature or option, or not routed) or confined to its own module or
crate, and its follow-up issues are filed. The review is lighter on
style, not on dependencies, advisory ignores, or anything on by default.
