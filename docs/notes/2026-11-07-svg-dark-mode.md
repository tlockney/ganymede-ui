## 2026-11-07, SVG charts legible in dark mode (#366)

An Observable Plot chart from cdp-kernel showed black tick labels, axis
labels and rules on the dark notebook background. cdp-kernel sends an
SVG element as `image/svg+xml`, and the app renders SVG as an `<img>`
(#133), where the SVG inherits nothing from the page: `currentColor` is
black. Plot and D3's axes draw text and lines in `currentColor`. HTML
outputs were fine, since their frame copies the theme's text color.

- `ImageSVG` puts a `color` presentation attribute, the theme's
  `--jp-content-font-color1`, on the SVG's root element before it
  becomes a data URL. That is what an inline SVG would inherit. An SVG
  that sets `color` itself, as an attribute or in its own styles, keeps
  it: presentation attributes rank below any style rule.
- SVG images on screen are drawn again when `data-jp-theme-light`
  changes on the body, which `useJupyterLabTheme` sets after the new
  theme's variables are in place.
- No setting: the only SVG this makes worse is one that draws in
  `currentColor` over its own light background, which is rare.

Raster images already follow JupyterLab's `needs_background` metadata.
Sandboxed HTML frames still take the text color when they render and
don't follow a later appearance change; redrawing them would run their
scripts again.

Checked in Chromium (Playwright); not yet tried in the Mac app.
