## 2026-11-14, Mac toolbar Share button (#620)

Publish as Web Page and Export As shipped in 0.11.0, but on the Mac they
were only in the File menu and the Command Palette. The web toolbar
that has them (and More's exports) is hidden under native chrome, and the
native toolbar had no entry, so they were easy to miss. The Mac toolbar
now has a Share menu with Download Notebook, Export As and Publish as Web
Page, disabled under the same conditions as the File menu items.

Lesson: a feature added to the web toolbar reaches the browser only; the
Mac needs its own native toolbar entry.
