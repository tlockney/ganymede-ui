// @vitest-environment node
import { execFileSync } from 'node:child_process';
import { generateKeyPairSync, verify } from 'node:crypto';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  MAX_LENGTH,
  appChanges,
  builtFrom,
  client,
  formatNotes,
  parseLog,
  lastTag,
  previousPoint,
  shipsInApp,
  token,
} from './testflight-notes.mjs';

const head = 'c486bf8a1d067b157477e08d57e5d93dcee0806b';

describe('formatNotes', () => {
  it('lists the subjects and ends with the commit', () => {
    const notes = formatNotes({
      since: 'build 17 (a1d067b)',
      subjects: [
        'iPhone/iPad: show the example notebooks (#464)',
        'Wait for a kernel start (#462)',
      ],
      head,
    });
    expect(notes).toBe(
      [
        'Changes since build 17 (a1d067b):',
        '- iPhone/iPad: show the example notebooks (#464)',
        '- Wait for a kernel start (#462)',
        '',
        'Built from c486bf8a1d06.',
      ].join('\n'),
    );
    expect(builtFrom(notes)).toBe('c486bf8a1d06');
  });

  it('says so when nothing changed', () => {
    expect(formatNotes({ since: 'v0.6.0', subjects: [], head })).toContain(
      '- No changes to the app.',
    );
  });

  it('cuts a long list to the limit and keeps the marker', () => {
    const subjects = Array.from(
      { length: 200 },
      (_, i) => `A change with a fairly long subject line number ${i} (#${i})`,
    );
    const notes = formatNotes({ since: null, subjects, head });
    expect(notes.length).toBeLessThanOrEqual(MAX_LENGTH);
    expect(notes).toMatch(/^- and \d+ more$/m);
    expect(builtFrom(notes)).toBe(head.slice(0, 12));
  });
});

describe('shipsInApp', () => {
  it('counts app sources, assets, examples, dependencies and the Swift app', () => {
    for (const f of [
      'src/kernel-host.ts',
      'src/components/Toolbar.tsx',
      'public/icons/run.svg',
      'examples/src/01 Start Here.md',
      'packages/agent/src/index.ts',
      'packages/device/src/device.ts',
      'packages/device/swift/Sources/DeviceBridge/Secrets.swift',
      'packages/device/Package.swift',
      'index.html',
      'vite.config.ts',
      'package.json',
      'package-lock.json',
      'apple/Sources/Ganymede/AppKernels.swift',
      'apple/Resources/Info.plist',
      'apple/project.yml',
      'apple/Package.resolved',
    ]) {
      expect(shipsInApp([f]), f).toBe(true);
    }
  });

  it('leaves out tests, CI, scripts and docs', () => {
    for (const f of [
      'src/kernel-host.test.ts',
      'src/test/setup.ts',
      'apple/Tests/GanymedeTests/KernelHostTests.swift',
      'apple/scripts/release-ios.sh',
      'apple/Resources/macOS/AppIcon.icns',
      'apple/Sources/QuickLook/Preview/PreviewViewController.swift',
      'apple/README.md',
      '.github/workflows/ci.yml',
      'scripts/testflight-notes.mjs',
      'docs/apps.md',
      'packages/device/docs/protocol.md',
      'packages/device/README.md',
      'packages/device/scripts/reference.ts',
      'packages/device/test/device.test.ts',
      'packages/device/swift/Tests/DeviceBridgeTests/SecretsTests.swift',
      'docs/notes/2026-11-11-ffi-cache.md',
      'e2e/app.spec.ts',
      'CHANGELOG.md',
    ]) {
      expect(shipsInApp([f]), f).toBe(false);
    }
  });
});

describe('appChanges', () => {
  it('keeps changes to the app and drops CI, tooling, bumps, releases and Mac-only changes', () => {
    // The v0.7.0..v0.8.0 notes, with the files each change touched.
    const changes = [
      {
        subject: "Pass a run's parameters to the in-app TypeScript kernel (#503)",
        files: ['apple/Sources/Ganymede/AppKernels.swift', 'src/kernel-host.ts', 'docs/apps.md'],
      },
      {
        subject: "CI: install Playwright's system libraries best effort (#500)",
        files: ['.github/workflows/ci.yml', 'docs/notes/2026-11-11-playwright-apt-outage.md'],
      },
      {
        subject: 'Release: pick up the latest cdp-kernel and Ganymede releases (#490)',
        files: ['scripts/release.sh', 'scripts/release-pins.sh', 'docs/releasing.md'],
      },
      {
        subject: 'Pin ganymede v0.8.0 (#497)',
        files: ['.github/workflows/ci.yml', 'apple/README.md'],
      },
      {
        subject: 'Send TestFlight notes as whatsNew (#501)',
        files: ['scripts/testflight-notes.mjs', 'scripts/testflight-notes.test.mjs'],
      },
      { subject: 'Bump the vite group with 2 updates (#405)', files: ['package.json'] },
      { subject: 'Release 0.8.0 (#507)', files: ['package.json', 'CHANGELOG.md'] },
      {
        subject: 'Mac: choose where kernels run from the window (#475)',
        files: ['apple/Sources/Ganymede/MacWindow.swift'],
      },
      {
        subject: 'Mac right inspector with Outline and Variables (#311)',
        files: ['apple/Sources/Ganymede/Inspector.swift'],
      },
      {
        subject: 'Mac and iPad: a shared change (#2)',
        files: ['apple/Sources/Ganymede/Shared.swift'],
      },
      { subject: 'Unknown files are kept (#1)', files: null },
    ];
    expect(appChanges(changes)).toEqual([
      "Pass a run's parameters to the in-app TypeScript kernel (#503)",
      'Mac and iPad: a shared change (#2)',
      'Unknown files are kept (#1)',
    ]);
  });
});

describe('formatNotes cut', () => {
  it('adds "and N more" even when it means dropping another line', () => {
    // Without the short line the list fits, but not with "and 1 more" too.
    const long = 'x'.repeat(MAX_LENGTH - 55);
    const notes = formatNotes({ since: 'v0.6.0', subjects: [long, 'Short change (#1)'], head });
    expect(notes.length).toBeLessThanOrEqual(MAX_LENGTH);
    expect(notes).not.toContain('Short change');
    expect(notes).toContain('- and 2 more');
  });
});

describe('lastTag', () => {
  const dir = mkdtempSync(join(tmpdir(), 'testflight-notes-'));
  const git = (...args) =>
    execFileSync('git', ['-c', 'user.name=t', '-c', 'user.email=t@example.com', ...args], {
      cwd: dir,
      stdio: 'ignore',
    });
  git('init', '-q');
  git('commit', '-q', '--allow-empty', '-m', 'one');
  git('tag', 'v0.1.0');
  git('commit', '-q', '--allow-empty', '-m', 'two');
  git('tag', 'v0.2.0');

  it('skips the tag on HEAD itself (a release tag run)', () => {
    expect(lastTag(dir)).toBe('v0.1.0');
  });

  it('finds the newest tag behind an untagged HEAD', () => {
    git('commit', '-q', '--allow-empty', '-m', 'three');
    expect(lastTag(dir)).toBe('v0.2.0');
    rmSync(dir, { recursive: true, force: true });
  });
});

describe('parseLog', () => {
  it('gives a squash commit its subject and a merge commit its PR title', () => {
    const out = [
      'aaa\x1fWait for a kernel start (#462)\x1f\x1e',
      'bbb\x1fMerge pull request #413 from tlockney/release/v0.6.0\x1f\nRelease 0.6.0\n\nMore text\n\x1e',
      'ccc\x1fMerge branch main\x1f\x1e',
    ].join('\n');
    expect(parseLog(out)).toEqual([
      { sha: 'aaa', subject: 'Wait for a kernel start (#462)' },
      { sha: 'bbb', subject: 'Release 0.6.0 (#413)' },
      { sha: 'ccc', subject: 'Merge branch main' },
    ]);
  });
});

describe('builtFrom', () => {
  it('finds no commit in notes without the marker', () => {
    expect(builtFrom('Try the new menu.')).toBeNull();
    expect(builtFrom(undefined)).toBeNull();
  });
});

describe('previousPoint', () => {
  const current = { id: 'b3', attributes: { uploadedDate: '2026-11-10T00:00:00Z' } };
  const builds = [
    { id: 'b4', number: '20', uploaded: '2026-11-11T00:00:00Z', notes: 'Built from 1111111.' },
    { id: 'b3', number: '19', uploaded: '2026-11-10T00:00:00Z', notes: '' },
    { id: 'b2', number: '18', uploaded: '2026-11-09T00:00:00Z', notes: 'Built from 2222222.' },
    { id: 'b1', number: '17', uploaded: '2026-11-08T00:00:00Z', notes: 'Built from 3333333.' },
  ];

  it('starts at the newest earlier build whose commit is an ancestor', () => {
    const point = previousPoint(builds, current, {
      isAncestor: sha => sha === '3333333',
      tag: () => 'v0.6.0',
    });
    expect(point).toEqual({ base: '3333333', since: 'build 17 (3333333)' });
  });

  it('compares upload dates as times, not strings', () => {
    // 01:00-08:00 is 09:00Z, after the current build's 08:30Z, though it sorts first as a string.
    const later = [
      {
        id: 'b9',
        number: '30',
        uploaded: '2026-11-10T01:00:00-08:00',
        notes: 'Built from 4444444.',
      },
    ];
    const point = previousPoint(
      later,
      { id: 'b3', attributes: { uploadedDate: '2026-11-10T08:30:00Z' } },
      {
        isAncestor: () => true,
        tag: () => 'v0.6.0',
      },
    );
    expect(point.base).toBe('v0.6.0');
  });

  it('falls back to the last tag, then to nothing', () => {
    const none = { isAncestor: () => false };
    expect(previousPoint(builds, current, { ...none, tag: () => 'v0.6.0' })).toEqual({
      base: 'v0.6.0',
      since: 'v0.6.0',
    });
    expect(previousPoint([], current, { ...none, tag: () => null })).toEqual({
      base: null,
      since: null,
    });
  });
});

const { privateKey, publicKey } = generateKeyPairSync('ec', { namedCurve: 'P-256' });
const keyP8 = Buffer.from(privateKey.export({ type: 'pkcs8', format: 'pem' })).toString('base64');

describe('token', () => {
  it('is an ES256 JWT for App Store Connect that the public key verifies', () => {
    const jwt = token({ keyP8, keyId: 'KEY', issuerId: 'ISS', now: 1_000_000 });
    const [h, p, s] = jwt.split('.');
    expect(JSON.parse(Buffer.from(h, 'base64url').toString())).toEqual({
      alg: 'ES256',
      kid: 'KEY',
      typ: 'JWT',
    });
    expect(JSON.parse(Buffer.from(p, 'base64url').toString())).toEqual({
      iss: 'ISS',
      iat: 1000,
      exp: 1600,
      aud: 'appstoreconnect-v1',
    });
    const ok = verify(
      'sha256',
      Buffer.from(`${h}.${p}`),
      { key: publicKey, dsaEncoding: 'ieee-p1363' },
      Buffer.from(s, 'base64url'),
    );
    expect(ok).toBe(true);
  });
});

/** A betaBuildLocalizations resource, as App Store Connect answers one. */
function localization(id, whatsNew, locale = 'en-US') {
  return {
    type: 'betaBuildLocalizations',
    id,
    attributes: { whatsNew, locale },
    relationships: {
      build: {
        links: {
          self: `https://api.appstoreconnect.apple.com/v1/betaBuildLocalizations/${id}/relationships/build`,
          related: `https://api.appstoreconnect.apple.com/v1/betaBuildLocalizations/${id}/build`,
        },
      },
    },
    links: { self: `https://api.appstoreconnect.apple.com/v1/betaBuildLocalizations/${id}` },
  };
}

/**
 * Just the betaBuildLocalizations calls of App Store Connect, for build
 * b1: an attribute the resource lacks gets the 409 the v0.7.0 release
 * got (#498), and what is written is what `include` reads back.
 */
function appStoreConnect() {
  const ATTRIBUTES = ['locale', 'whatsNew'];
  const stored = new Map();
  const answer = (status, body) => ({
    ok: status < 300,
    status,
    text: async () => JSON.stringify(body),
  });
  const fetch = async (url, init) => {
    const path = url.replace('https://api.appstoreconnect.apple.com/v1', '').split('?')[0];
    const body = init.body ? JSON.parse(init.body) : undefined;
    const unknown = Object.keys(body?.data?.attributes ?? {}).find(a => !ATTRIBUTES.includes(a));
    if (unknown) {
      return answer(409, {
        errors: [
          {
            status: '409',
            code: 'ENTITY_ERROR.ATTRIBUTE.UNKNOWN',
            title: 'The provided entity includes an unknown attribute',
            detail: `'${unknown}' is not an attribute on the resource 'betaBuildLocalizations'`,
            source: { pointer: `/data/attributes/${unknown}` },
          },
        ],
      });
    }
    if (init.method === 'GET' && path === '/builds/b1/betaBuildLocalizations') {
      return answer(200, { data: [...stored.values()] });
    }
    if (init.method === 'POST' && path === '/betaBuildLocalizations') {
      const { locale, whatsNew } = body.data.attributes;
      stored.set('l1', localization('l1', whatsNew, locale));
      return answer(201, { data: stored.get('l1') });
    }
    if (init.method === 'GET' && path === '/builds') {
      return answer(200, {
        data: [
          {
            type: 'builds',
            id: 'b1',
            attributes: { version: '17', uploadedDate: '2026-11-11T13:40:00-08:00' },
            relationships: {
              betaBuildLocalizations: {
                data: [...stored.keys()].map(id => ({ type: 'betaBuildLocalizations', id })),
              },
            },
          },
        ],
        included: [...stored.values()],
      });
    }
    return answer(404, { errors: [{ status: '404' }] });
  };
  return { fetch };
}

function fakeFetch(routes) {
  const calls = [];
  const fetch = async (url, init) => {
    const path = url.replace('https://api.appstoreconnect.apple.com/v1', '');
    calls.push({ method: init.method, path, body: init.body ? JSON.parse(init.body) : undefined });
    const body = routes[`${init.method} ${path.split('?')[0]}`] ?? {};
    return { ok: true, status: 200, text: async () => JSON.stringify(body) };
  };
  return { fetch, calls };
}

describe('client', () => {
  const opts = { keyP8, keyId: 'KEY', issuerId: 'ISS' };

  const saved = notes => ({ data: localization('l1', notes) });

  it('patches an existing en-US localization', async () => {
    const { fetch, calls } = fakeFetch({
      'GET /builds/b1/betaBuildLocalizations': {
        data: [{ id: 'l1', attributes: { locale: 'en-US' } }],
      },
      'PATCH /betaBuildLocalizations/l1': saved('notes'),
    });
    await client({ ...opts, fetch }).setWhatToTest('b1', 'notes');
    expect(calls[1]).toEqual({
      method: 'PATCH',
      path: '/betaBuildLocalizations/l1',
      body: {
        data: { type: 'betaBuildLocalizations', id: 'l1', attributes: { whatsNew: 'notes' } },
      },
    });
  });

  it('creates the localization when the build has none', async () => {
    const { fetch, calls } = fakeFetch({
      'GET /builds/b1/betaBuildLocalizations': { data: [] },
      'POST /betaBuildLocalizations': saved('notes'),
    });
    await client({ ...opts, fetch }).setWhatToTest('b1', 'notes');
    expect(calls[1]).toEqual({
      method: 'POST',
      path: '/betaBuildLocalizations',
      body: {
        data: {
          type: 'betaBuildLocalizations',
          attributes: { locale: 'en-US', whatsNew: 'notes' },
          relationships: { build: { data: { type: 'builds', id: 'b1' } } },
        },
      },
    });
  });

  it('fails when the answer carries no notes', async () => {
    const { fetch } = fakeFetch({
      'GET /builds/b1/betaBuildLocalizations': { data: [] },
      'POST /betaBuildLocalizations': saved(null),
    });
    await expect(client({ ...opts, fetch }).setWhatToTest('b1', 'notes')).rejects.toThrow(
      /kept no notes/,
    );
  });

  it('writes and reads the notes under the names App Store Connect uses (#498)', async () => {
    const { fetch } = appStoreConnect();
    const asc = client({ ...opts, fetch, retries: [] });
    await asc.setWhatToTest('b1', 'Built from abcdef0.');
    expect(await asc.recentBuilds('app')).toEqual([
      {
        id: 'b1',
        number: '17',
        uploaded: '2026-11-11T13:40:00-08:00',
        notes: 'Built from abcdef0.',
      },
    ]);
  });

  it('reads recent builds with their notes', async () => {
    const { fetch } = fakeFetch({
      'GET /builds': {
        data: [
          {
            id: 'b1',
            attributes: { version: '17', uploadedDate: '2026-11-08T00:00:00Z' },
            relationships: { betaBuildLocalizations: { data: [{ id: 'l1' }] } },
          },
        ],
        included: [
          {
            type: 'betaBuildLocalizations',
            id: 'l1',
            attributes: { whatsNew: 'Built from abcdef0.' },
          },
        ],
      },
    });
    expect(await client({ ...opts, fetch }).recentBuilds('app')).toEqual([
      { id: 'b1', number: '17', uploaded: '2026-11-08T00:00:00Z', notes: 'Built from abcdef0.' },
    ]);
  });

  it('takes the app whose bundle ID matches exactly', async () => {
    const { fetch } = fakeFetch({
      'GET /apps': {
        data: [
          { id: 'a1', attributes: { bundleId: 'com.ganymede-server.Ganymede.Share' } },
          { id: 'a2', attributes: { bundleId: 'com.ganymede-server.Ganymede' } },
        ],
      },
    });
    expect(await client({ ...opts, fetch }).appId()).toBe('a2');
  });

  it('retries a 5xx and a network error, then succeeds', async () => {
    const waits = [];
    let n = 0;
    const fetch = async () => {
      n++;
      if (n === 1) throw new Error('socket hang up');
      if (n === 2) return { ok: false, status: 503, text: async () => '' };
      return {
        ok: true,
        status: 200,
        text: async () =>
          JSON.stringify({
            data: [{ id: 'a', attributes: { bundleId: 'com.ganymede-server.Ganymede' } }],
          }),
      };
    };
    const asc = client({ ...opts, fetch, wait: async ms => waits.push(ms) });
    expect(await asc.appId()).toBe('a');
    expect(waits).toEqual([5_000, 10_000]);
  });

  it('gives up after the retries, and never retries a 4xx', async () => {
    let n = 0;
    const fetch = async () => (n++, { ok: false, status: 502, text: async () => 'bad gateway' });
    await expect(client({ ...opts, fetch, wait: async () => {} }).appId()).rejects.toThrow(
      /502 bad gateway/,
    );
    expect(n).toBe(4);
    n = 0;
    const forbidden = async () => (n++, { ok: false, status: 403, text: async () => '' });
    await expect(
      client({ ...opts, fetch: forbidden, wait: async () => {} }).appId(),
    ).rejects.toThrow(/403/);
    expect(n).toBe(1);
  });

  it('reports a failed call with its status and body', async () => {
    const fetch = async () => ({ ok: false, status: 403, text: async () => '{"errors":[]}' });
    await expect(client({ ...opts, fetch }).appId()).rejects.toThrow(/GET \/apps\?.*: 403/);
  });
});
