/**
 * The code font (#354): the face, size, ligatures and stylistic
 * alternates of notebook cells and text outputs.
 *
 * The fonts are bundled in `public/fonts/` (`scripts/fonts.py`), with
 * `catalog.json` listing each one's family, files and OpenType features;
 * the Apple app reads the same catalog for its editor and terminal. Only
 * the chosen font's `@font-face` is added, so the browser fetches only it.
 *
 * In the Mac and iPad apps the app owns the setting: it sets
 * `window.ganymedeCodeFont` before the page loads, and calls
 * `window.ganymedeSetCodeFont` when it changes. In a browser the Settings
 * sheet keeps it in `localStorage`.
 */
import catalogJson from '../../public/fonts/catalog.json';

export type FontFeature = { tag: string; label: string };

export type CatalogFont = {
  id: string;
  name: string;
  family: string;
  source: string;
  files: { file: string; style: string; weight: string }[];
  ligatures: boolean;
  features: FontFeature[];
};

/** The system's monospace font, `--font-mono`: no ligatures or alternates. */
export const SYSTEM_FONT = 'system';

export const FONTS: CatalogFont[] = (catalogJson as { fonts: CatalogFont[] }).fonts;

export type CodeFontSetting = {
  /** `SYSTEM_FONT` or a catalog font's id. */
  font: string;
  /** In CSS pixels (points in the app); null keeps each view's own size. */
  size: number | null;
  ligatures: boolean;
  /** OpenType feature tags turned on: `ss01`, `cv02`, `zero`. */
  features: string[];
};

export const DEFAULT_CODE_FONT: CodeFontSetting = {
  font: SYSTEM_FONT,
  size: null,
  ligatures: true,
  features: [],
};

export const MIN_SIZE = 8;
export const MAX_SIZE = 32;
/** The notebook's code size when the setting has none (`jupyter.css`). */
export const DEFAULT_SIZE = 12.5;

const KEY = 'ganymede-ui:code-font';
const STYLE_ID = 'ganymede-code-font';

declare global {
  interface Window {
    /** Set by the Apple apps before the page loads. */
    ganymedeCodeFont?: unknown;
    /** Called by the Apple apps when the setting changes. */
    ganymedeSetCodeFont?: (setting: unknown) => void;
  }
}

export function catalogFont(id: string): CatalogFont | undefined {
  return FONTS.find(f => f.id === id);
}

/** A setting from JSON, with anything unknown or out of range dropped. */
export function parseCodeFont(value: unknown): CodeFontSetting {
  if (!value || typeof value !== 'object') return { ...DEFAULT_CODE_FONT };
  const v = value as Record<string, unknown>;
  const font =
    typeof v.font === 'string' && (v.font === SYSTEM_FONT || catalogFont(v.font))
      ? v.font
      : SYSTEM_FONT;
  const size =
    typeof v.size === 'number' && Number.isFinite(v.size)
      ? Math.min(MAX_SIZE, Math.max(MIN_SIZE, v.size))
      : null;
  const known = new Set(catalogFont(font)?.features.map(f => f.tag) ?? []);
  const features = Array.isArray(v.features)
    ? [...new Set(v.features.filter((t): t is string => typeof t === 'string' && known.has(t)))]
    : [];
  return { font, size, ligatures: v.ligatures !== false, features };
}

/** `font-feature-settings` for a setting: the alternates, and ligatures off if asked. */
export function featureSettings(setting: CodeFontSetting): string {
  const font = catalogFont(setting.font);
  if (!font) return 'normal';
  const parts = setting.features.map(t => `"${t}" 1`);
  if (!setting.ligatures && font.ligatures) parts.push('"calt" 0', '"liga" 0', '"dlig" 0');
  return parts.length ? parts.join(', ') : 'normal';
}

/** The CSS family list: the font, then the system's monospace font. */
export function familyList(setting: CodeFontSetting): string | null {
  const font = catalogFont(setting.font);
  return font ? `"${font.family}", var(--font-mono)` : null;
}

/** The chosen font's `@font-face` rules, its files under `base`. */
export function fontFaces(setting: CodeFontSetting, base: string): string {
  const font = catalogFont(setting.font);
  if (!font) return '';
  return font.files
    .map(
      f =>
        `@font-face{font-family:"${font.family}";src:url("${base}fonts/${f.file}") format("woff2");` +
        `font-style:${f.style};font-weight:${f.weight};font-display:swap}`,
    )
    .join('\n');
}

/** Applies a setting to the page: its faces, and the variables `jupyter.css` reads. */
export function applyCodeFont(
  setting: CodeFontSetting,
  doc: Document = document,
  base: string = import.meta.env.BASE_URL,
): void {
  let style = doc.getElementById(STYLE_ID);
  if (!style) {
    style = doc.createElement('style');
    style.id = STYLE_ID;
    doc.head.append(style);
  }
  style.textContent = fontFaces(setting, base);
  const root = doc.documentElement.style;
  const family = familyList(setting);
  if (family) root.setProperty('--code-font', family);
  else root.removeProperty('--code-font');
  if (setting.size !== null) root.setProperty('--code-font-size', `${setting.size}px`);
  else root.removeProperty('--code-font-size');
  root.setProperty('--code-font-features', featureSettings(setting));
}

/** The setting: the app's when it set one, otherwise this browser's. */
export function codeFontSetting(
  win: Pick<Window, 'ganymedeCodeFont'> = window,
  storage: Pick<Storage, 'getItem'> | undefined = safeStorage(),
): { setting: CodeFontSetting; owner: 'app' | 'page' } {
  if (win.ganymedeCodeFont !== undefined) {
    return { setting: parseCodeFont(win.ganymedeCodeFont), owner: 'app' };
  }
  let stored: unknown = null;
  try {
    const raw = storage?.getItem(KEY);
    stored = raw ? JSON.parse(raw) : null;
  } catch {
    // Storage blocked or bad JSON: the default.
  }
  return { setting: parseCodeFont(stored), owner: 'page' };
}

/** Saves the browser's setting and applies it. */
export function saveCodeFont(
  setting: CodeFontSetting,
  storage: Pick<Storage, 'setItem'> | undefined = safeStorage(),
): void {
  try {
    storage?.setItem(KEY, JSON.stringify(setting));
  } catch {
    // Storage blocked: this page only.
  }
  applyCodeFont(setting);
}

/** Applies the setting as the page loads, and lets the app change it. */
export function startCodeFont(win: Window = window): void {
  applyCodeFont(codeFontSetting(win).setting);
  win.ganymedeSetCodeFont = value => {
    win.ganymedeCodeFont = value;
    applyCodeFont(parseCodeFont(value));
  };
}

function safeStorage(): Storage | undefined {
  try {
    return window.localStorage;
  } catch {
    return undefined;
  }
}
