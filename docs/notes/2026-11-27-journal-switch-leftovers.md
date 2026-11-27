## 2026-11-27, journal mode switch review leftovers (#830)

Three leftovers from the review of #829. Toolbar.test.tsx gained a
wide-window test beside the phone one: on the file's default wide
`matchMedia`, the journal's Notebook click leaves focus on the Notebook
button (the control stays) and not on More. With the `if (narrow)` gate
removed it fails, so it pins the gate. journal.spec.ts's phone test now
asserts that the control's left edge is the title's (1px tolerance);
without `margin-left: 0` on `.touch-ui .title-block .mode-switch` the
control sits 6px right (58 against 52) and the test fails, so the rule
has an effect and stays. (The e2e serves `dist`, so the check needed a
rebuild after removing the rule.) docs/apps.md has the header control's
description back in the Journal view section, as plain text since it
shipped in v0.17.0, now saying "under the status line" and that the Mac
and iPad show it in the toolbar while a notebook is open and the iPhone
keeps the More menu item, as the code does.
