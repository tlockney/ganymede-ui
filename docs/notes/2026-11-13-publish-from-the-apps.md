## 2026-11-13, publish a notebook from the apps (#563)

Thomas wanted the published page (`ganymede nb publish`) in the UI too.
**Publish as Web Page…** opens a sheet with the CLI's options and hands
the page over through the existing download path.

Choices:

- The server makes the page (`GET /nbconvert/html/{path}` with
  ganymede#754's `code`, `byline`, `copy`), so the redactions are the
  server's: its root, the home folder and its token. The app adds none
  and builds no HTML itself, so it can't be less strict than the CLI.
- Only offered on a Ganymede server. A Jupyter server's `/nbconvert/html`
  is nbconvert's page, which redacts nothing; the in-browser server has
  no exporter.
- The server reads the saved file, so the sheet saves unsaved edits
  first and publishes nothing when that save fails.
- The defaults are the CLI's: code folded, the notebook copy unless code
  is hidden. The byline defaults to today's date, as MCP
  `notebook_publish` does, since a page in the apps is usually for
  sharing now. Picking hidden code turns the copy off; turning it back on
  says the copy holds the hidden code.
- One sheet in the page for every platform, as Notebook Access does; the
  Mac File menu and the iPad/iPhone ⋯ menu run its `publish` command.
- A server older than #754 (0.10.0, which the apps embedded) ignores
  the options and returns the default page, code folded. The review
  caught that Hidden would then share the code. The page now names its
  code mode (`<meta name="ganymede-code">`, ganymede#755), and the app
  refuses a page whose mode isn't the one asked for, or that lacks the
  copy it asked for. `GANYMEDE_REF` moves to #755's merge so the apps'
  own server takes the options.
- The sheet keeps the path it opened for and publishes only while that
  notebook is still the one open; Cancel and Escape wait for a publish
  in progress, so no save panel appears after the sheet closed.
