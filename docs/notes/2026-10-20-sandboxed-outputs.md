## 2026-10-20, sandboxed output frames (#35)

Trusted `text/html` and `application/javascript` outputs now render in
iframes with `sandbox="allow-scripts allow-downloads allow-forms
allow-pointer-lock allow-popups allow-popups-to-escape-sandbox"` (never
`allow-same-origin`), after nteract's design. `src/lib/output-frames.ts`
replaces JupyterLab's renderers in the shared registry, keeping their
ranks. Choices:

- **Content in through `srcdoc`, not postMessage.** The document is
  built once with the output inside it, so `<script>` tags run in order
  and `document.write` works, with no RPC to validate. JavaScript output
  is a JSON string with `<` escaped, run by indirect `eval` with
  `element` set, as Jupyter's JS outputs expect.
- **One message out:** `{ ganymedeFrame: 'height', height }` from a
  `ResizeObserver` on a `display: flow-root` wrapper. The host takes it
  only from a frame's own `contentWindow`, checks it's a finite number,
  and caps it at 20000 px.
- **CSP:** inline and HTTPS scripts and styles (plotting libraries load
  from CDNs), any image or media, no `<base>`, no form posts.
- **Color scheme:** the frame's document and the iframe element both get
  the app's scheme. If they differ, the browser paints the frame opaque,
  which showed as a white box in dark mode.
- **Untrusted JavaScript** showed a Run button that evaluated in the
  page; it now runs in a frame too. Trusted Markdown outputs rendered
  their HTML unsanitized and ran its scripts in the page; Markdown is now
  always sanitized. SVG was already an `<img>`.

Left as is: ipywidgets render in the page (the `HTML` widget sets
`innerHTML`), relative URLs in framed HTML don't resolve (the frame has
an opaque origin and gets no cookies), and a frame per output isn't
created lazily. Frames keep the scheme they were rendered with when the
system's changes.
