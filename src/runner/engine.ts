// The script runner's engine side (#69, phase 4; a spike): what Swift's
// ScriptRunner evaluates in a fresh JavaScriptCore context, with no web
// view. It installs the polyfills and `device` (over `__ganymedeDevice`,
// ganymede-device's host-function transport), strips TypeScript with
// sucrase, and runs a script or a notebook's code cells, top to bottom, as
// one async function, so `await` and `return` work at the top level.
//
// Swift calls `__ganymedeRun(JSON.stringify(job))` and gets the result as
// JSON text: `{ ok: true, value? }` or `{ ok: false, error }`.

import { transform } from 'sucrase';
import { installHostDevice, type HostPost } from '@tlockney/ganymede-device/host';
import { installPolyfills } from './polyfills';

export interface RunJob {
  /** "typescript" (the default) or "javascript". */
  language?: string;
  /** A script's source, or a notebook's code cells in order. */
  sources: string[];
}

export interface RunResult {
  ok: boolean;
  /** The script's return value, as text: a string as it is, anything else as JSON. */
  value?: string;
  error?: string;
}

/** `source` as JavaScript; TypeScript loses its types and keeps its lines. */
export function toJavaScript(source: string, language = 'typescript'): string {
  if (language === 'javascript') return source;
  return transform(source, { transforms: ['typescript'], disableESTransforms: true }).code;
}

/** The body of the async function a job runs as. Imports aren't supported: there is nothing to load them from. */
export function program(job: RunJob): string {
  const parts = job.sources.map((source, n) => {
    // Checked before stripping, which drops an import nothing uses; type-only ones are fine.
    if (/^\s*(import|export)\s+(?!type\s)/m.test(source))
      throw new SyntaxError(`cell ${n + 1}: import and export aren't supported in a run`);
    // A cell may declare a name another cell declared, as in a notebook's
    // kernel: top-level `let` and `const` (at the start of a line) become `var`.
    return toJavaScript(source, job.language).replace(/^(?:let|const)(?=\s)/gm, 'var');
  });
  return parts.join('\n;\n');
}

function describe(value: unknown): string | undefined {
  if (value === undefined) return undefined;
  if (typeof value === 'string') return value;
  try {
    return JSON.stringify(value) ?? String(value);
  } catch {
    return String(value);
  }
}

/** Runs `job`; never rejects. */
export async function run(job: RunJob, post?: HostPost): Promise<RunResult> {
  try {
    await installHostDevice(post);
    const body = program(job);
    const AsyncFunction = Object.getPrototypeOf(async () => {}).constructor as new (
      code: string,
    ) => () => Promise<unknown>;
    const value = await new AsyncFunction(body)();
    return { ok: true, value: describe(value) };
  } catch (err) {
    const error = err instanceof Error ? `${err.name}: ${err.message}` : String(err);
    return { ok: false, error };
  }
}

type Host = typeof globalThis & {
  __ganymedeDevice?: HostPost;
  __ganymedeRun?: (job: string) => Promise<string>;
};

installPolyfills();
(globalThis as Host).__ganymedeRun = async (job: string) =>
  JSON.stringify(await run(JSON.parse(job) as RunJob, (globalThis as Host).__ganymedeDevice));
