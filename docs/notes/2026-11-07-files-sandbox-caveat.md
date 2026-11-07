## 2026-11-07, /files sandbox caveat reworded (#191)

README.md and docs/architecture.md said an HTML file opened from `/files`
could ask for agent keys until Ganymede sandboxed `/files`
(ganymede#298). That shipped in Ganymede 0.6.0, and the app pins 0.7.0,
so the caveat is gone: the README says `/files` is sandboxed, and the
architecture page says why such a file fails the `agentKeys` origin check
(a sandbox CSP gives it an opaque origin).
