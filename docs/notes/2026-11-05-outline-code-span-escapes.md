## 2026-11-05, outline: backslashes in code spans, autolinks (#212)

Follow-up to the outline review on #275. Heading text set escapes aside
before code spans, so a backslash inside a code span (`` `\*` ``) left a
placeholder inside another placeholder, and the heading showed a raw
private-use character. Escapes and code spans are now matched in one
pass, left to right, so a backslash inside a code span stays code, as
CommonMark has it. Autolinks (`<https://…>`) now keep their address as
the text instead of being dropped as tags.

Autolinks, URI or email, match in the same pass, so a backslash in one
stays text too.

Not changed: a heading's own private-use characters can still be
replaced when it has escapes or code spans, and a list item's
continuation line before `---` still reads as a setext heading. Both
are rare.
