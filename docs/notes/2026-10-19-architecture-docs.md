## 2026-10-19, architecture page, published on the Ganymede site (#71)

`docs/architecture.md` describes how the app is put together: the
`ServiceManager` seam and the three backends, the hand-wired JupyterLite
server and its two kernels, the service-worker relay, the notebook pane,
the shell, the build, and the Apple app with where its kernels run. The
README's "How it fits together" stays as the short version and links to it.

The Ganymede site renders this repo's `docs/*.md` (all but `notes.md`)
under `/docs/ganymede-ui/` (tlockney/ganymede#175). Its docs build fetches
them from `main`, so links in them must work from both places: relative
links to `.md` files in `docs/` stay on the site, and the site sends
relative links to anything else (`../src/...`) to this repo on GitHub.
Links to Ganymede's docs use the full `https://ganymede-server.com/docs/`
URL. `/docs/ui` was taken by Ganymede's "User interfaces" page, hence the
longer path.

`docs.yml` asks the site to rebuild (`repository_dispatch`,
`ganymede-ui-docs`) when `docs/*.md` changes on `main`. It needs a
`GANYMEDE_DOCS_TOKEN` secret, a fine-grained token for tlockney/ganymede
with Contents read and write; without it the job warns and the docs show up
on the site's next build.

The two diagrams are hand-written SVGs in `docs/images/`, referenced as
images so both GitHub and VitePress render them. An SVG in an `<img>` can't
see the page's theme, so each carries its own light and dark colors under
`prefers-color-scheme`; on the site that follows the system setting, not
VitePress's theme toggle.
