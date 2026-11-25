## 2026-11-25, Wide content in the journal scrolls in its own box (#798)

The UX review's Fremont Bridge journal at 390 × 844 scrolled sideways
across 2,209 px. Outputs already sat in `.journal-output`, which scrolls
sideways on its own, but a Markdown cell has no such box: a wide
Markdown table, a long line in a fenced code block, or a long unbroken
link widened the journal's scroll area instead. The same happened at
desktop widths once a table or code line was wider than the 880 px
column.

The journal's own CSS now gives those their box: a Markdown table is
`display: block` with `width: max-content` and `max-width: 100%`, so a
narrow one keeps its width and stays centered while a wide one scrolls
by itself; a Markdown `pre` and a MathJax display equation scroll by
themselves; and rendered content
wraps long words with `overflow-wrap: break-word`. Not `anywhere`, which
would count every letter as a break point when sizing a table, so its
columns would shrink to a letter wide rather than scroll. Images and
SVG already shrank to the column through JupyterLab's `max-width: 100%`.

The new e2e test, at 390 × 844 and at 1280 × 820, opens a journal with
wide Markdown and HTML tables, a narrow Markdown table, a 1600 px image
as a Markdown attachment and as an output, a long link in Markdown and
in a stream, a long code line, and a 60-term display equation. It
checks that the page, the journal and its scroll area don't scroll
sideways, that each cell stays in the column, that images keep their
shape inside it, that both wide tables and the equation scroll in a box
of their own no wider than the column, and that the narrow table keeps
its content's width and stays centered. Without the CSS it fails with
2,137 px of overflow on the phone and 1,715 px on the desktop.

`display: block` on a table can drop its table role in WebKit's
accessibility tree, so VoiceOver in the apps might read a Markdown
table in the Journal as plain text. The e2e tests run in Chromium, not
WebKit, so they can't tell; that check is by hand, on #399.

The start position and collapsed composer from the same review are in
#800.
