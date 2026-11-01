## 2026-11-01, Dependabot updates from 2026-10-25 (#146)

All four Dependabot PRs failed CI. This PR applies what works and changes the config so the rest don't come back broken.

Notes:

- `@jupyter/web-components` 0.17.1 fails to load under Vitest (`Cannot find module .../icon/icon.styles`). `@jupyterlab/ui-components` 4.6.4 still depends on 0.16.7, so our pin has to follow JupyterLab. Dependabot now ignores it.
- `vitest` and `@vitest/coverage-v8` must have the same version. Dependabot opened one PR for each major, and each failed alone. They are now one group, majors included.
- Vite 8 needs `@vitejs/plugin-react` 6, which doesn't install cleanly yet (a Babel 8 peer conflict). Tracked in #147.
