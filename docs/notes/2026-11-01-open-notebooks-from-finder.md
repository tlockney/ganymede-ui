## 2026-11-01, Open notebooks from the Finder (#130)

Second Mac step of #128: the app declares `.ipynb` and opens a window per
notebook, so it can be the default app for notebooks.

- **One server rooted at `/`.** The app used to restart its server on a
  new folder, which shut down kernels and could change the page's origin.
  Now it serves `/` and each window loads the page with `?open=` or
  `?dir=` and an absolute path (#129 drops the leading `/`, so it is a
  server path). Opening a file anywhere needs no restart. The server still
  needs the token or cookie, as before; it already served the home folder
  by default, so serving `/` adds system folders the user can read anyway.
- **Type:** `org.jupyter.ipynb` is imported (Jupyter owns the format),
  conforming to `public.json`, with the `ipynb` extension and
  `application/x-ipynb+json`. If another installed app exports a different
  identifier for `.ipynb`, the system uses that one; "Make Default App for
  Notebooks" asks `UTType(filenameExtension: "ipynb")` for the type the
  system actually uses rather than assuming ours.
- **Windows:** `WindowGroup(for: WindowTarget.self)`, where a target is a
  file or folder URL and nil means the last folder. `openWindow(value:)`
  brings an existing window with the same value to the front, which covers
  File > Open… and Open Folder…. Finder opens arrive through `onOpenURL`;
  `handlesExternalEvents(preferring:allowing:)` lets a notebook window take
  later opens of its own file (SwiftUI matches by substring, so folder
  windows take none: their URL is a prefix of every file inside them). The
  terminal window group handles no external events.
- **URL encoding:** `URLComponents.queryItems` leaves `+` and `&` as they
  are in values; a notebook named `Io+Europa.ipynb` would come through as
  `Io Europa.ipynb`. `WindowTarget.pageURL` encodes by hand.
- Not tried on a real Mac yet; CI builds it, checks the built Info.plist
  for the type, and tests page URLs and serving a notebook by absolute
  path from a server rooted at `/`. Terminals from File > New Terminal
  still start in the server's root; the terminal thread passes the
  window's folder as `cwd` next.
