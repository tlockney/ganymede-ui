## 2026-11-03, Quick Look preview and thumbnails for notebooks (#135)

The Mac app embeds two app extensions: `GanymedeQuickLook`, a Quick Look
preview, and `GanymedeThumbnail`, the Finder's thumbnail. Both are
sandboxed, as Quick Look requires.

- The preview is a view-based `QLPreviewingController` with a `WKWebView`.
  HTML previews returned as data (`QLPreviewReply`) run no JavaScript, so
  they can't use rendermime.
- The page is `preview.html`, built alone by `vite build --mode quicklook`
  into `dist-quicklook/` (no PWA plugin, no `public/`), about 5 MB with
  MathJax. It reuses `createNotebook` and the app's rendermime
  (`createStaticRendermime`: no URL resolver, so relative links and images
  don't resolve), and makes every cell read-only.
- WebKit doesn't run module scripts from `file:` URLs, so the extension
  serves the page from its bundle through a `WKURLSchemeHandler` on
  `ganymede-preview://app/`. `PreviewResources` maps a URL to a file and
  refuses anything that leaves the folder.
- Outputs render untrusted, as in the app for a file nobody signed. A
  cell's trust is its `trusted` metadata, so the preview deletes that key
  before loading: setting `trusted = false` on the cell models before they
  are in a notebook makes Yjs warn ("Add Yjs type to a document before
  reading data").
- The contents API joins nbformat's multiline strings (lists of lines)
  before the app sees a notebook; the preview reads the file itself, so
  `rejoinLines` does the same. Without it an SVG output's lines were
  joined by commas and the image was blank.
- A sandboxed extension's web view is widely reported to draw nothing
  without `com.apple.security.network.client` (WebKit's networking
  process serves even a custom scheme), so the extension has it; not
  confirmed here. The page's Content-Security-Policy keeps it
  off the network: `default-src 'self' ganymede-preview: data: blob:`.
- The thumbnail doesn't start a web view: `NotebookSummary` reads the
  first headings, paragraphs, code, and each code cell's first output (an
  image if there is a PNG or JPEG) from the JSON, and `ThumbnailPage`
  draws them on a white 3:4 page.
- Not verified on a Mac yet: CI builds and unit-tests both extensions, but
  Quick Look can't be driven on the runner. Check with `qlmanage -p
file.ipynb` and `qlmanage -t file.ipynb` after opening the app once.
