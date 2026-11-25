## 2026-11-25, Machine banner contrast (#802)

The banner a machine window shows while its machine is offline
(`.machine-banner`) drew white 12px text on `--orange`: 2.2:1 in light
(`#ff9500`) and 2.1:1 in dark (`#ff9f0a`), under WCAG AA's 4.5:1 for
text. It keeps the orange fill, which says something is wrong, and now
draws its text in `#1d1d1f` in both themes: 7.6:1 in light and 8.2:1 in
dark. The color is a literal rather than `--text`, because `--text` is
light in dark mode.

`src/styles/contrast.test.ts` (#799) now finds every rule that sets a
text color over `var(--orange)`, checks that the banner is among them,
and checks each at 4.5:1 in light and dark. With the banner's old
`#fff` the two theme tests fail. Its check of the old colors through the
same math now includes white on both oranges.
