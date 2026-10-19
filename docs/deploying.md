# Deploying

The app is a static site: `npm run build` writes it to `dist/`, and each
[release](https://github.com/tlockney/ganymede-ui/releases) ships the same
files as `ganymede-ui-X.Y.Z.zip` and `.tar.gz`, which unpack to one
`ganymede-ui-X.Y.Z/` directory. It has to be served at the root of its
origin (`/`): its service worker, which also relays in-browser kernels' file
and `input()` requests, needs scope `/`.

There are two ways to put it in front of a Ganymede server. Both need
[Ganymede](https://ganymede-server.com/docs/install) 0.3.0 or later.

## Served by Ganymede

Ganymede serves the app itself, so the page and the API share an origin
and no cross-origin setup is needed.

```sh
curl -fLO https://github.com/tlockney/ganymede-ui/releases/download/v0.1.0/ganymede-ui-0.1.0.zip
unzip ganymede-ui-0.1.0.zip
cd ~/notebooks                                  # the folder to serve
ganymede serve --static-dir /path/to/ganymede-ui-0.1.0
```

Or, from a checkout of this repository: `npm ci && npm run build`, then
`ganymede serve --static-dir dist`.

Open the URL `ganymede serve` prints (`http://127.0.0.1:8888/?token=…`).
The server trades the token for a login cookie and sets the `_xsrf` cookie
that saving and starting kernels need; the app finds the cookie and
connects without asking. Opening `http://127.0.0.1:8888/` later reconnects
while the cookie lasts.

Ganymede's `main` adds `ganymede ui install` and `ganymede ui`, which
download a release, check it, and serve it as above; see
[Ganymede's app page](https://ganymede-server.com/docs/app).

## On another origin

The app is hosted somewhere else (any static host, or `npm run preview`)
and connects to a Ganymede server it doesn't come from. The server has to
list the app's origin, and the app sends the token with every request.

On the server, with the app at `https://notebooks.example.com`:

```sh
ganymede serve --port 8888 --token "$GANYMEDE_TOKEN" \
  --allow-origin https://notebooks.example.com
```

In the app, the connect sheet opens on the first visit; later, the
connection button at the bottom of the sidebar opens it.

1. Choose **Ganymede server**.
2. **Server**: the server's URL, such as `https://ganymede.example.com`.
   Leave it empty only when the page and the server share an origin.
3. **Token**: the value of `--token`.
4. Optionally tick **Run kernels in this page** to keep notebooks on the
   server but run the in-browser kernels instead of the server's.
5. **Connect**. A wrong token shows "The server refused the token."

The app sends the token in an `Authorization: token <token>` header on REST
calls and as a `token` query parameter on websockets; no cookies or
`_xsrf` are involved. A page served over HTTPS can only reach a server over
HTTPS (browsers block mixed content, except `localhost`), so a remote server
normally sits behind a TLS proxy; Ganymede's
[security page](https://ganymede-server.com/docs/security) covers that, and
listening beyond loopback. The connection, token included, is saved in the
browser; see [Where your data lives](https://github.com/tlockney/ganymede-ui#where-your-data-lives).

To try this on one machine:

```sh
ganymede serve --port 8888 --token test --allow-origin http://localhost:4173
npm run build && npm run preview
```

Open `http://localhost:4173/` and connect to `http://127.0.0.1:8888` with
token `test`.
