// Sets the "What to Test" notes of the TestFlight build release-ios.sh
// just uploaded (release.yml's `ios` job, #466): the commit subjects
// since the previous TestFlight build. Each build's notes end with the
// commit it was built from ("Built from <sha>."), so the next run reads
// the previous build's notes to know where to start; without one it
// starts at the last `v*` tag. Nothing else keeps state.
//
//   VERSION, BUILD_NUMBER       the build, as release-ios.sh set them
//   APPSTORE_API_KEY_P8         App Store Connect API key, base64
//   APPSTORE_API_KEY_ID
//   APPSTORE_API_ISSUER_ID
//
// `node scripts/testflight-notes.mjs --print [<since>]` prints the notes
// for HEAD since <since> (default: the last `v*` tag) without calling
// App Store Connect.
import { execFileSync } from 'node:child_process';
import { createPrivateKey, sign } from 'node:crypto';
import { pathToFileURL } from 'node:url';

const API = 'https://api.appstoreconnect.apple.com/v1';
const BUNDLE_ID = 'com.ganymede-server.Ganymede';
const LOCALE = 'en-US';
// App Store Connect's limit for whatToTest.
export const MAX_LENGTH = 4000;
const MARKER = /^Built from ([0-9a-f]{7,40})\.$/m;

/** The commit a build's notes say it was built from, or null. */
export function builtFrom(notes) {
  return MARKER.exec(notes ?? '')?.[1] ?? null;
}

/**
 * The notes: a heading naming where the list starts, one line per commit
 * subject (dependency bumps and release commits counted on one line), and
 * the commit marker. The list is cut to fit MAX_LENGTH.
 */
export function formatNotes({ since, subjects, head }) {
  const changes = [];
  let bumps = 0;
  for (const subject of subjects) {
    if (/^Bump /.test(subject)) bumps++;
    else if (!/^Release \d/.test(subject)) changes.push(`- ${subject}`);
  }
  if (bumps) changes.push(`- Dependency updates (${bumps})`);
  const heading = since ? `Changes since ${since}:` : 'Changes:';
  const footer = `Built from ${head.slice(0, 12)}.`;
  if (!changes.length) changes.push('- No changes to the code.');

  const fits = lines => [heading, ...lines, '', footer].join('\n').length <= MAX_LENGTH;
  let shown = changes;
  while (!fits(shown)) {
    shown = shown.slice(0, -1);
    const more = changes.length - shown.length;
    if (fits([...shown, `- and ${more} more`])) {
      shown = [...shown, `- and ${more} more`];
      break;
    }
  }
  return [heading, ...shown, '', footer].join('\n');
}

function git(...args) {
  return execFileSync('git', args, {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'ignore'],
  }).trim();
}

/** Whether `sha` is a commit in this clone and an ancestor of HEAD. */
function isAncestor(sha) {
  try {
    execFileSync('git', ['merge-base', '--is-ancestor', sha, 'HEAD'], { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

function lastTag() {
  try {
    return git('describe', '--tags', '--abbrev=0', '--match', 'v*', 'HEAD');
  } catch {
    return null;
  }
}

/** Commit subjects from `base` (exclusive) to HEAD, newest first; the last 30 without a base. */
function subjectsSince(base) {
  const range = base ? [`${base}..HEAD`] : ['-30', 'HEAD'];
  const out = git('log', '--no-merges', '--format=%s', ...range);
  return out ? out.split('\n') : [];
}

/** An App Store Connect API token (ES256 JWT, 20 minutes, the limit). */
export function token({ keyP8, keyId, issuerId, now = Date.now() }) {
  const key = createPrivateKey(Buffer.from(keyP8, 'base64').toString('utf8'));
  const iat = Math.floor(now / 1000);
  const part = obj => Buffer.from(JSON.stringify(obj)).toString('base64url');
  const input = `${part({ alg: 'ES256', kid: keyId, typ: 'JWT' })}.${part({
    iss: issuerId,
    iat,
    exp: iat + 1200,
    aud: 'appstoreconnect-v1',
  })}`;
  const sig = sign('sha256', Buffer.from(input), { key, dsaEncoding: 'ieee-p1363' });
  return `${input}.${sig.toString('base64url')}`;
}

/** A client for the few App Store Connect calls this needs. */
export function client({ keyP8, keyId, issuerId, fetch = globalThis.fetch }) {
  async function call(method, path, body) {
    const res = await fetch(path.startsWith('http') ? path : `${API}${path}`, {
      method,
      headers: {
        authorization: `Bearer ${token({ keyP8, keyId, issuerId })}`,
        ...(body ? { 'content-type': 'application/json' } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
    });
    const text = await res.text();
    if (!res.ok) throw new Error(`${method} ${path}: ${res.status} ${text}`);
    return text ? JSON.parse(text) : null;
  }

  return {
    async appId() {
      const q = new URLSearchParams({ 'filter[bundleId]': BUNDLE_ID });
      const { data } = await call('GET', `/apps?${q}`);
      if (!data.length) throw new Error(`no app with bundle ID ${BUNDLE_ID}`);
      return data[0].id;
    },

    /** The build with this version and build number, or null. */
    async build(appId, version, buildNumber) {
      const q = new URLSearchParams({
        'filter[app]': appId,
        'filter[preReleaseVersion.version]': version,
        'filter[version]': buildNumber,
      });
      const { data } = await call('GET', `/builds?${q}`);
      return data[0] ?? null;
    },

    /** Recent builds, newest upload first, each with its notes. */
    async recentBuilds(appId) {
      const q = new URLSearchParams({
        'filter[app]': appId,
        sort: '-uploadedDate',
        limit: '20',
        include: 'betaBuildLocalizations',
      });
      const { data, included = [] } = await call('GET', `/builds?${q}`);
      const notes = new Map(
        included
          .filter(r => r.type === 'betaBuildLocalizations')
          .map(r => [r.id, r.attributes?.whatToTest ?? '']),
      );
      return data.map(b => ({
        id: b.id,
        number: b.attributes.version,
        uploaded: b.attributes.uploadedDate,
        notes: (b.relationships?.betaBuildLocalizations?.data ?? [])
          .map(r => notes.get(r.id) ?? '')
          .join('\n'),
      }));
    },

    /** Sets whatToTest for LOCALE, creating the localization if needed. */
    async setWhatToTest(buildId, whatToTest) {
      const { data } = await call('GET', `/builds/${buildId}/betaBuildLocalizations`);
      const existing = data.find(l => l.attributes.locale === LOCALE);
      if (existing) {
        await call('PATCH', `/betaBuildLocalizations/${existing.id}`, {
          data: { type: 'betaBuildLocalizations', id: existing.id, attributes: { whatToTest } },
        });
      } else {
        await call('POST', '/betaBuildLocalizations', {
          data: {
            type: 'betaBuildLocalizations',
            attributes: { locale: LOCALE, whatToTest },
            relationships: { build: { data: { type: 'builds', id: buildId } } },
          },
        });
      }
    },
  };
}

/**
 * Where the notes start: the commit in the newest earlier build's notes
 * that this clone has as an ancestor of HEAD, else the last `v*` tag.
 */
export function previousPoint(
  builds,
  current,
  { isAncestor: ancestor = isAncestor, tag = lastTag } = {},
) {
  for (const b of builds) {
    if (b.id === current.id) continue;
    if (current.attributes?.uploadedDate && b.uploaded > current.attributes.uploadedDate) continue;
    const sha = builtFrom(b.notes);
    if (sha && ancestor(sha)) return { base: sha, since: `build ${b.number} (${sha.slice(0, 7)})` };
  }
  const t = tag();
  return t ? { base: t, since: t } : { base: null, since: null };
}

const sleep = ms => new Promise(r => setTimeout(r, ms));

async function main() {
  const args = process.argv.slice(2);
  const head = git('rev-parse', 'HEAD');
  if (args[0] === '--print') {
    const since = args[1] ?? lastTag();
    console.log(formatNotes({ since, subjects: subjectsSince(since), head }));
    return;
  }

  const env = name => {
    const v = process.env[name];
    if (!v) throw new Error(`${name} is not set`);
    return v;
  };
  const version = env('VERSION');
  const buildNumber = process.env.BUILD_NUMBER || '1';
  const asc = client({
    keyP8: env('APPSTORE_API_KEY_P8'),
    keyId: env('APPSTORE_API_KEY_ID'),
    issuerId: env('APPSTORE_API_ISSUER_ID'),
  });

  const appId = await asc.appId();
  // App Store Connect lists the upload within minutes and processes it
  // for TestFlight in a few more; the notes are set once it is processed.
  const deadline = Date.now() + 40 * 60 * 1000;
  let build;
  for (;;) {
    build = await asc.build(appId, version, buildNumber);
    const state = build?.attributes?.processingState;
    if (state && state !== 'PROCESSING') break;
    if (Date.now() > deadline)
      throw new Error(`build ${version} (${buildNumber}) not processed after 40 minutes`);
    console.log(`waiting for ${version} (${buildNumber}): ${state ?? 'not listed yet'}`);
    await sleep(30_000);
  }
  if (build.attributes.processingState !== 'VALID') {
    throw new Error(`build ${version} (${buildNumber}) is ${build.attributes.processingState}`);
  }

  const { base, since } = previousPoint(await asc.recentBuilds(appId), build);
  const notes = formatNotes({ since, subjects: subjectsSince(base), head });
  console.log(notes);
  await asc.setWhatToTest(build.id, notes);
  console.log(`Set What to Test on ${version} (${buildNumber}).`);
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  main().catch(err => {
    console.error(`::error::${err.message}`);
    process.exit(1);
  });
}
