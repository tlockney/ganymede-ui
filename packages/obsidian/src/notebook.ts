// Parse an nbformat 4 notebook into a small model for the viewer. Pure: no
// DOM, no Obsidian.

export type Output =
  | { kind: 'text'; text: string; stderr: boolean }
  | { kind: 'error'; ename: string; evalue: string; traceback: string }
  | { kind: 'html'; html: string }
  | { kind: 'svg'; svg: string }
  | { kind: 'image'; mime: ImageMime; base64: string }
  | { kind: 'markdown'; markdown: string }
  | { kind: 'unsupported'; mimes: string[] };

export type Cell =
  | { type: 'markdown'; source: string }
  | { type: 'code'; source: string; executionCount: number | null; outputs: Output[] }
  | { type: 'raw'; source: string };

export interface Notebook {
  language: string;
  cells: Cell[];
}

export const IMAGE_MIMES = ['image/png', 'image/jpeg', 'image/gif', 'image/webp'] as const;
export type ImageMime = (typeof IMAGE_MIMES)[number];

export const GANYMEDE_RESULT_MIME = 'application/vnd.ganymede.result+json';

/** Preference order for a display_data / execute_result bundle. */
const MIME_PREFERENCE = [
  GANYMEDE_RESULT_MIME,
  'text/html',
  'image/svg+xml',
  ...IMAGE_MIMES,
  'text/markdown',
  'application/json',
  'text/plain',
];

export class NotebookError extends Error {}

// CSI: ESC [ params intermediates final. OSC: ESC ] ... terminated by BEL or
// ESC \. Then any other two-byte ESC sequence.
// eslint-disable-next-line no-control-regex
const ANSI = /\x1b\[[0-?]*[ -/]*[@-~]|\x1b\][^\x07\x1b]*(?:\x07|\x1b\\)?|\x1b[@-Z\\-_]/g;

export function stripAnsi(text: string): string {
  return text.replace(ANSI, '');
}

/** A Markdown fenced code block whose fence outruns any backticks in source. */
export function fence(source: string, lang: string): string {
  let longest = 0;
  for (const run of source.match(/`+/g) ?? []) longest = Math.max(longest, run.length);
  const ticks = '`'.repeat(Math.max(3, longest + 1));
  return `${ticks}${lang}\n${source}\n${ticks}`;
}

// Languages a fence may name. Anything else gets no info string, so a
// kernel language like `dataviewjs` can't trigger an Obsidian code-block
// processor and the source stays inert text.
const FENCE_LANGUAGES = new Set([
  'typescript',
  'javascript',
  'python',
  'r',
  'julia',
  'sql',
  'bash',
  'sh',
  'rust',
  'go',
  'ruby',
  'scala',
  'java',
  'kotlin',
  'swift',
  'c',
  'cpp',
  'csharp',
]);

/** The info string for a code cell's fence: an allowlisted language, or ''. */
export function fenceLanguage(language: string): string {
  const lang = language.trim().toLowerCase();
  if (lang === 'deno') return 'typescript';
  return FENCE_LANGUAGES.has(lang) ? lang : '';
}

type Obj = Record<string, unknown>;

function isObj(v: unknown): v is Obj {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

/** nbformat multiline strings: a string or an array of strings. */
function multiline(v: unknown): string {
  if (typeof v === 'string') return v;
  if (Array.isArray(v)) return v.filter(s => typeof s === 'string').join('');
  return '';
}

function parseOutput(raw: unknown): Output | null {
  if (!isObj(raw)) return null;
  switch (raw.output_type) {
    case 'stream':
      return { kind: 'text', text: stripAnsi(multiline(raw.text)), stderr: raw.name === 'stderr' };
    case 'error': {
      const tb = Array.isArray(raw.traceback) ? raw.traceback : [];
      return {
        kind: 'error',
        ename: stripAnsi(String(raw.ename ?? '')),
        evalue: stripAnsi(String(raw.evalue ?? '')),
        traceback: stripAnsi(tb.map(l => String(l)).join('\n')),
      };
    }
    case 'execute_result':
    case 'display_data':
      return parseBundle(isObj(raw.data) ? raw.data : {});
    default:
      return { kind: 'unsupported', mimes: [String(raw.output_type ?? 'unknown')] };
  }
}

function parseBundle(data: Obj): Output {
  for (const mime of MIME_PREFERENCE) {
    if (!(mime in data)) continue;
    const value = data[mime];
    switch (mime) {
      case GANYMEDE_RESULT_MIME: {
        // An empty or missing name shows the value alone, as ganymede's
        // named_result does.
        const name = isObj(value) && typeof value.name === 'string' ? value.name : '';
        const v = isObj(value) ? value.value : value;
        const json = JSON.stringify(v, null, 2) ?? 'undefined';
        return { kind: 'text', text: name ? `${name} = ${json}` : json, stderr: false };
      }
      case 'text/html':
        return { kind: 'html', html: multiline(value) };
      case 'image/svg+xml':
        return { kind: 'svg', svg: multiline(value) };
      case 'text/markdown':
        return { kind: 'markdown', markdown: multiline(value) };
      case 'application/json':
        return {
          kind: 'text',
          text: typeof value === 'string' ? value : (JSON.stringify(value, null, 2) ?? ''),
          stderr: false,
        };
      case 'text/plain':
        return { kind: 'text', text: stripAnsi(multiline(value)), stderr: false };
      default:
        return {
          kind: 'image',
          mime: mime as ImageMime,
          base64: multiline(value).replace(/\s+/g, ''),
        };
    }
  }
  return { kind: 'unsupported', mimes: Object.keys(data) };
}

/** Parse the text of an .ipynb file. Throws NotebookError with a message fit to show. */
export function parseNotebook(text: string): Notebook {
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch (e) {
    throw new NotebookError(`Not valid JSON: ${e instanceof Error ? e.message : String(e)}`);
  }
  if (!isObj(json)) throw new NotebookError('Not a notebook: the top level is not an object.');
  if (json.nbformat !== 4) {
    throw new NotebookError(
      `Only nbformat 4 notebooks are supported (this file says nbformat ${String(json.nbformat ?? 'missing')}).`,
    );
  }
  const metadata = isObj(json.metadata) ? json.metadata : {};
  const languageInfo = isObj(metadata.language_info) ? metadata.language_info : {};
  const kernelspec = isObj(metadata.kernelspec) ? metadata.kernelspec : {};
  const language =
    (typeof languageInfo.name === 'string' && languageInfo.name) ||
    (typeof kernelspec.language === 'string' && kernelspec.language) ||
    '';

  const cells: Cell[] = [];
  for (const raw of Array.isArray(json.cells) ? json.cells : []) {
    if (!isObj(raw)) continue;
    const source = multiline(raw.source);
    if (raw.cell_type === 'markdown') cells.push({ type: 'markdown', source });
    else if (raw.cell_type === 'code') {
      const outputs: Output[] = [];
      for (const o of Array.isArray(raw.outputs) ? raw.outputs : []) {
        const parsed = parseOutput(o);
        if (parsed) outputs.push(parsed);
      }
      cells.push({
        type: 'code',
        source,
        executionCount: typeof raw.execution_count === 'number' ? raw.execution_count : null,
        outputs,
      });
    } else cells.push({ type: 'raw', source });
  }
  return { language, cells };
}
