## 2026-11-09, Example notebooks on the iPhone (#439)

The iPhone app had no way to open the example notebooks. Its first screen
is the native folder list, so the page's empty state, where the button
was, never shows, and it has no File menu. The folder list's + menu (the
iPhone's list and the iPad's sidebar) now has Open Example Notebooks,
next to New Notebook and New Folder. It runs the page's `open-examples`
command on the top-level folder and pushes the notebook screen, as New
Notebook does.
