## 2026-11-06, stale release and app facts in the docs (#335)

A docs review against v0.4.0 found the README's Known gaps still calling
the Mac app an ad-hoc signed CI build and saying there is no command
palette, the agent-keys note waiting on ganymede#298 (fixed in Ganymede
0.6.0), and deploying.md downloading v0.1.0 by hand where `ganymede ui`
does it. apple/README marked the in-app kernel "(unreleased)" inline;
that form isn't the `**Unreleased.**` note, so the release's grep didn't
list it and it outlived the release that shipped it. Use the note, even
for one bullet.
