# Brief: color tokens in the app icon's palette (issue #845, step 1 of #844)

Read CLAUDE.md and CONTRIBUTING.md first. Do not push. Do not delete this
file; the relay removes it. Commit your work on this branch; the relay
opens the PR.

## Goal

Replace the system-blue accent and grey surfaces with the app icon's
palette (`public/icons/icon.svg`), in the page and the native apps. Only
tokens and the rules that read them change in this step: no layout, no
spacing, no new components.

## 1. Page tokens: `src/styles/app.css` `:root` and its dark block

Light (`:root`):

| token | new value |
|---|---|
| `--accent` | `#e8890f` (icons only, 3:1 is enough) |
| `--accent-soft` | `rgba(249, 160, 63, 0.16)` |
| `--accent-fill` | `#f9a03f` |
| `--on-accent` (new) | `#2a1600` (text and icons on `--accent-fill`) |
| `--accent-text` | `#9a4d00` |
| `--window-bg` | `#fbf9f5` |
| `--sidebar-bg` | `rgba(236, 230, 218, 0.72)` |
| `--sidebar-solid` | `#ece6da` |
| `--toolbar-bg` | `rgba(251, 249, 245, 0.8)` |
| `--sheet-bg` | `rgba(247, 244, 238, 0.94)` |
| `--ready` (new) | `#3d6fd6` (idle and ready dots) |
| `--brand-navy` (new) | `#2b3a67` |
| `--brand-cream` (new) | `#f4e9d8` |
| `--brand-orange` (new) | `#f9a03f` |
| `--brand-glow` (new) | `#8fb3ff` |

Dark (`@media (prefers-color-scheme: dark)` block):

| token | new value |
|---|---|
| `--accent` | `#f9a03f` |
| `--accent-soft` | `rgba(249, 160, 63, 0.18)` |
| `--accent-fill` | `#f9a03f` |
| `--on-accent` | `#2a1600` |
| `--accent-text` | `#fbb064` |
| `--window-bg` | `#181c2f` |
| `--sidebar-bg` | `rgba(30, 40, 74, 0.72)` |
| `--sidebar-solid` | `#141a33` |
| `--toolbar-bg` | `rgba(24, 28, 47, 0.8)` |
| `--sheet-bg` | `rgba(35, 40, 66, 0.94)` |
| `--ready` | `#8fb3ff` |

Keep `--green`, `--orange`, `--red`, `--gray` as they are (they mean
success, warning, error). Leave `--text*`, `--separator`, `--hover` etc.
unless a contrast test fails; if one does, darken (light) or lighten (dark)
that token the least amount that passes and say so in the commit message.

The `body` background's two radial gradients: change the first tint to
navy `rgba(43, 58, 103, 0.22)` and the second to orange
`rgba(249, 160, 63, 0.10)`.

Update the comment above `--accent-fill`: it is now the fill under
`--on-accent`, not under white.

## 2. White on accent becomes `--on-accent`

Every rule in `src/styles/app.css` and `src/styles/jupyter.css` that sets
`color: #fff` (or `#ffffff`, `white`) together with a `background` or
`background-color` of `var(--accent…)` changes to `color: var(--on-accent)`.
There are at least 7 (find them all: `grep -n -B3 -A3 'accent-fill' src/styles/*.css`).
Also check `.tsx` files under `src/` for inline white text on an accent
background and change those the same way. SVG icons inside those
elements that use `currentColor` follow automatically; any with a
hard-coded `#fff` fill/stroke change to `currentColor`.

## 3. Notebook surfaces: `src/styles/jupyter.css` `.notebook-page`

- Light `--cell-bg`: `#ffffff`; `--cell-border`: `rgba(43, 58, 103, 0.10)`.
- Dark `--cell-bg`: `#232842`; `--cell-border`: `rgba(255, 255, 255, 0.07)`.
- `--jp-brand-color1` already follows `--accent`; leave it.

## 4. Contrast test: `src/styles/contrast.test.ts`

- The "white on every accent fill" tests become "`--on-accent` on every
  accent fill": collect rules whose `color` is `var(--on-accent)` and whose
  background is `var(--accent…)`; resolve both through `variables(theme)`
  and require 4.5:1. Keep the `.push-button.primary` and `>= 7` checks.
- Add a test that no rule in app.css or jupyter.css puts `#fff`/`#ffffff`/
  `white` text on a `var(--accent…)` background any more.
- All other existing tests must still pass. Run `npm test`.

## 5. Native accent: `apple/`

- Add `AccentColor.colorset/Contents.json` to both
  `apple/Resources/macOS/Assets.xcassets` and
  `apple/Resources/iOS/Assets.xcassets`: universal `#E8890F` (sRGB) for
  light appearance and `#F9A03F` for dark appearance (an
  `appearances: [{appearance: luminosity, value: dark}]` entry).
- In `apple/project.yml`, add `ASSETCATALOG_COMPILER_GLOBAL_ACCENT_COLOR_NAME: AccentColor`
  next to each `ASSETCATALOG_COMPILER_APPICON_NAME: AppIcon` (two places:
  the Mac app and the iOS app targets).
- No Swift changes.

## 6. Done when

- `npm run check` and `npm test` pass. Report the exact commands and results.
- `git diff --stat` shows only: the two CSS files, contrast.test.ts, any
  .tsx with white-on-accent, the two colorsets, project.yml.
- Add a dev-log entry `docs/notes/2026-11-26-icon-palette.md` starting
  `## 2026-11-26, icon palette tokens (#845)`, a few sentences on what
  changed and why (Thomas found the UI bland; first step of #844). Never
  edit docs/notes.md.
