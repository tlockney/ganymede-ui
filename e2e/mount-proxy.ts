// A stand-in for the Apple apps' embedded server, for the connected-machine
// tests (#701). That server mounts each machine under `/machines/{id}/` and
// forwards an allowlist of routes to it (ganymede#894); this proxy does the
// same for the e2e run: `/machines/{id}/...` goes to a second `ganymede
// serve`, with its token added and the page's cookie dropped, and everything
// else goes to the first server, which serves the build and the login cookie.
// It also lets a test take the machine away, as a network drop would, and
// stands in for `GET api/collaboration/rooms` (ganymede#893) when the
// machine's Ganymede doesn't have it yet.
import {
  type IncomingMessage,
  type Server,
  type ServerResponse,
  createServer,
  request,
} from 'node:http';
import { type Socket, connect } from 'node:net';

export type MountProxy = {
  url: string;
  /** While down, the machine answers nothing: requests fail and sockets close. */
  setDown(down: boolean): void;
  stop(): Promise<void>;
};

type Options = {
  port: number;
  /** The server that serves the page and the login. */
  app: URL;
  machineId: string;
  machine: URL;
  machineToken: string;
  /** Answer `api/collaboration/rooms` with this when the machine has no such route. */
  rooms?: unknown;
};

export async function startMountProxy(o: Options): Promise<MountProxy> {
  const prefix = `/machines/${o.machineId}/`;
  let down = false;
  const sockets = new Set<Socket>();

  /** The path on the machine, or undefined for a path that isn't the mount's. */
  const mounted = (url: string): string | undefined =>
    url.startsWith(prefix) ? '/' + url.slice(prefix.length) : undefined;

  /** What the machine gets: no cookie, referer or page origin, but its own token. */
  const machineHeaders = (req: IncomingMessage) => {
    const headers: Record<string, string | string[] | undefined> = { ...req.headers };
    delete headers.cookie;
    delete headers.referer;
    delete headers['x-xsrftoken'];
    headers.host = o.machine.host;
    headers.origin = o.machine.origin;
    headers.authorization = `token ${o.machineToken}`;
    return headers;
  };

  const server: Server = createServer((req: IncomingMessage, res: ServerResponse) => {
    const path = mounted(req.url ?? '');
    const target = path === undefined ? o.app : o.machine;
    if (path !== undefined && down) {
      res.writeHead(502).end('machine offline');
      return;
    }
    const up = request(
      {
        host: target.hostname,
        port: target.port,
        method: req.method,
        path: path ?? req.url,
        headers: path === undefined ? req.headers : machineHeaders(req),
      },
      answer => {
        if (path?.startsWith('/api/collaboration/rooms') && answer.statusCode === 404 && o.rooms) {
          answer.resume();
          res.writeHead(200, { 'content-type': 'application/json' }).end(JSON.stringify(o.rooms));
          return;
        }
        res.writeHead(answer.statusCode ?? 502, answer.headers);
        answer.pipe(res);
      },
    );
    up.on('error', () => res.headersSent || res.writeHead(502).end());
    req.pipe(up);
  });

  server.on('upgrade', (req: IncomingMessage, client: Socket, head: Buffer) => {
    const path = mounted(req.url ?? '');
    if (path !== undefined && down) {
      client.destroy();
      return;
    }
    const target = path === undefined ? o.app : o.machine;
    const upstream = connect(Number(target.port), target.hostname);
    // Only the machine's sockets can be taken away: the app's stay.
    if (path !== undefined) {
      sockets.add(client);
      sockets.add(upstream);
    }
    const headers = path === undefined ? req.headers : machineHeaders(req);
    upstream.on('connect', () => {
      const lines = Object.entries(headers).flatMap(([k, v]) =>
        v === undefined ? [] : [`${k}: ${Array.isArray(v) ? v.join(', ') : v}`],
      );
      upstream.write(`${req.method} ${path ?? req.url} HTTP/1.1\r\n${lines.join('\r\n')}\r\n\r\n`);
      if (head.length) upstream.write(head);
      client.pipe(upstream).pipe(client);
    });
    for (const s of [client, upstream]) {
      s.on('error', () => s.destroy());
      s.on('close', () => {
        sockets.delete(s);
        client.destroy();
        upstream.destroy();
      });
    }
  });

  await new Promise<void>(resolve => server.listen(o.port, '127.0.0.1', resolve));
  return {
    url: `http://127.0.0.1:${o.port}`,
    setDown(value) {
      down = value;
      if (value) {
        for (const s of sockets) s.destroy();
      }
    },
    stop: () =>
      new Promise<void>(resolve => {
        for (const s of sockets) s.destroy();
        server.close(() => resolve());
        server.closeAllConnections();
      }),
  };
}
