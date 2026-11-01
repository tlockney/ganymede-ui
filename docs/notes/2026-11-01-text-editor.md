## 2026-11-01, Text editor in the apps (#122)

The Mac and iOS apps open files that aren't notebooks in a native text editor: the system text view, Neon highlighting, reads and saves through `/api/contents`. Line numbers, auto-indent and bracket pairing are next.

Notes:

- The page only asks for the editor: its sidebar enables other files when the app registers an `openFile` message handler, and only on the app's own server, since the app's editor reads from there. In a browser nothing changes.
- Neon's main branch isn't tagged, so it is pinned to a commit. Neon asks for SwiftTreeSitter's `main` branch, and SwiftPM refuses a root requirement on the same package by a different revision ("required using two different revision-based requirements"), so SwiftTreeSitter follows `main`. tree-sitter and Rearrange, which they need by version, are pinned exactly.
- tree-sitter-python 0.25, tree-sitter-javascript 0.25 and tree-sitter-yaml 0.7.1+ add `src/scanner.c` only `if FileManager.default.fileExists(atPath: "src/scanner.c")`. That path is relative to the working directory, which under Xcode isn't the package, so the scanner isn't compiled and the app fails to link (`_tree_sitter_python_external_scanner_create` undefined). The editor uses the releases just before, which list the scanner outright: Python 0.23.6, JavaScript 0.23.1, YAML 0.7.0.
- SwiftTreeSitter's `LanguageConfiguration(_:name:)` compiles every `.scm` file in a grammar's `queries` folder, including tags and locals the editor doesn't use. The editor compiles only the highlight queries, plus Markdown's injections.
- TypeScript's highlight query only adds to JavaScript's (tree-sitter-typescript's `tree-sitter.json` lists both), so the editor joins the two. TSX also gets JavaScript's JSX query.
- Neon's `TextViewHighlighter` works with TextKit 1 and 2, but its README notes that flicker-free highlighting while typing needs TextKit 1, so the editor's text views use TextKit 1. On the Mac it colors through the layout manager's temporary attributes, so it sets colors only, not fonts.
- `jupyter_server` ignores `last_modified` on a save; Ganymede refuses one with 409 when the file on disk is newer. The editor checks the metadata before saving as well, so remote Jupyter servers get the same protection.
- iOS can end a background scene without asking, so the editor saves its edits when its scene goes to the background.
- Following SwiftTreeSitter's `main` would let an upstream commit ship in a release unseen, and `Ganymede.xcodeproj` is git-ignored, so no lock file was kept. `apple/Package.resolved` is now tracked: `bootstrap.sh` copies it into the project, and every `xcodebuild` passes `-onlyUsePackageVersionsFromResolvedFile`, so a build fails rather than resolve anything new. `apple/scripts/update-packages.sh` re-resolves after a change to `project.yml`.
- WebKit gives every frame the same message handlers, output iframes included, so the `openFile` and `document` handlers take messages only from the main frame.
- The 3-second check for changes on disk reads the whole file before reloading; edits typed during that read now win (the conflict bar appears), and a save can't run in the middle of it.
