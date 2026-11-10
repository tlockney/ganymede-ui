// @vitest-environment node
import { generateKeyPairSync, verify } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import {
  MAX_LENGTH,
  builtFrom,
  client,
  formatNotes,
  previousPoint,
  token,
} from './testflight-notes.mjs';

const head = 'c486bf8a1d067b157477e08d57e5d93dcee0806b';

describe('formatNotes', () => {
  it('lists the subjects, counts bumps, drops release commits, and ends with the commit', () => {
    const notes = formatNotes({
      since: 'build 17 (a1d067b)',
      subjects: [
        'iPhone/iPad: show the example notebooks (#464)',
        'Bump the vite group with 2 updates (#405)',
        'Release 0.6.0 (#413)',
        'Bump the vitest group across 1 directory with 2 updates (#404)',
        'Wait for a kernel start (#462)',
      ],
      head,
    });
    expect(notes).toBe(
      [
        'Changes since build 17 (a1d067b):',
        '- iPhone/iPad: show the example notebooks (#464)',
        '- Wait for a kernel start (#462)',
        '- Dependency updates (2)',
        '',
        'Built from c486bf8a1d06.',
      ].join('\n'),
    );
    expect(builtFrom(notes)).toBe('c486bf8a1d06');
  });

  it('says so when nothing changed', () => {
    expect(formatNotes({ since: 'v0.6.0', subjects: [], head })).toContain(
      '- No changes to the code.',
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
      exp: 2200,
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

  it('patches an existing en-US localization', async () => {
    const { fetch, calls } = fakeFetch({
      'GET /builds/b1/betaBuildLocalizations': {
        data: [{ id: 'l1', attributes: { locale: 'en-US' } }],
      },
    });
    await client({ ...opts, fetch }).setWhatToTest('b1', 'notes');
    expect(calls[1]).toEqual({
      method: 'PATCH',
      path: '/betaBuildLocalizations/l1',
      body: {
        data: { type: 'betaBuildLocalizations', id: 'l1', attributes: { whatToTest: 'notes' } },
      },
    });
  });

  it('creates the localization when the build has none', async () => {
    const { fetch, calls } = fakeFetch({ 'GET /builds/b1/betaBuildLocalizations': { data: [] } });
    await client({ ...opts, fetch }).setWhatToTest('b1', 'notes');
    expect(calls[1]).toEqual({
      method: 'POST',
      path: '/betaBuildLocalizations',
      body: {
        data: {
          type: 'betaBuildLocalizations',
          attributes: { locale: 'en-US', whatToTest: 'notes' },
          relationships: { build: { data: { type: 'builds', id: 'b1' } } },
        },
      },
    });
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
            attributes: { whatToTest: 'Built from abcdef0.' },
          },
        ],
      },
    });
    expect(await client({ ...opts, fetch }).recentBuilds('app')).toEqual([
      { id: 'b1', number: '17', uploaded: '2026-11-08T00:00:00Z', notes: 'Built from abcdef0.' },
    ]);
  });

  it('reports a failed call with its status and body', async () => {
    const fetch = async () => ({ ok: false, status: 403, text: async () => '{"errors":[]}' });
    await expect(client({ ...opts, fetch }).appId()).rejects.toThrow(/GET \/apps\?.*: 403/);
  });
});
