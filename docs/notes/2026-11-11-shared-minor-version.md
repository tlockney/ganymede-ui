## 2026-11-11, one minor version with Ganymede (#511)

Ganymede released first in a round since the release speed-up, so it
reached 0.9.0 while the apps were at 0.8.0, and the site showed both.
Ganymede and ganymede-ui now share their minor version:
`scripts/release.sh minor` takes Ganymede's latest X.Y.0 instead of
bumping this repository's own, and stops when Ganymede hasn't released a
newer minor. Patches stay per repository, so a fix to one doesn't force
an empty release of the other. The next round takes the apps from 0.8.0
to 0.10.0, skipping 0.9.0. The release order and the pins don't change.
