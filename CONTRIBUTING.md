# Contributing

Work is tracked in [GitHub issues](https://github.com/tlockney/ganymede-ui/issues).
Each change is a pull request that links the issue it resolves
(`Closes #N`), passes CI, and adds a short dev-log entry under
`docs/notes/`, as [docs/notes.md](docs/notes.md) describes.

```sh
npm install
npm run check   # type-check the app, check the dev log
npm test        # client package tests
npm run build   # production build
```

The app is a client of Ganymede's REST and websocket API, which matches
`jupyter_server`. Changes the app needs from the server go to
[tlockney/ganymede](https://github.com/tlockney/ganymede) as issues there.

Report security problems privately, as [SECURITY.md](SECURITY.md) says,
not in a public issue.
