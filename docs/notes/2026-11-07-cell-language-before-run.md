## 2026-11-07, cells highlight before the first run (#352)

Code cells edited as plain text until the first run. The editors take their
language from `metadata.language_info`, and `NotebookPane` copies that from
the kernel's info reply, but kernels start on the first run. A new notebook,
or one saved without `language_info`, had no language until then.
JupyterLab's `NotebookModel` also starts with `language_info: { name: '' }`,
so "no language" has to count an empty name, not only a missing key.

`seedLanguage` (`src/lib/language.ts`) now sets `{ name }` from the file's
`kernelspec.language`, or from the kernel the first run will start, when
the notebook opens, and from the picked kernel when the kernel changes
before the first run. It keeps the model clean. The kernel's full
`language_info` replaces it on start, as before. CodeMirror's default
language registry picks the mode by name, so any language it knows works.
The Mac and iOS apps show cells in the same web view.
