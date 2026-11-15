## 2026-11-15, Obsidian plugin moves to its own repo (#636)

The read-only notebook viewer from the `packages/obsidian` spike (#637)
now lives in [tlockney/obsidian-notebooks](https://github.com/tlockney/obsidian-notebooks),
with its history (`git subtree split`), as the Notebook Library plugin.
Thomas asked for the move: the plugin isn't specific to Ganymede, and a
repo of its own can be installed by others. Search (step 3 of #636),
links and embeds, an outline, a header, settings and an "Open with"
option (Ganymede's `ganymede://open` by default) were added there
(obsidian-notebooks#1).

This removes the package, its lint, test and type-check entries, the
`check` script's build step and its `ci-changes.sh` case. Opening
`ganymede://` links on iPad and iPhone is #640.
