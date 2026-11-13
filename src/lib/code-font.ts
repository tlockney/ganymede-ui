/**
 * The code font (#354): the face, size, ligatures and style of notebook
 * cells and text outputs, and the font of rendered Markdown (#565).
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

/** A named set of a font's features (#565), `scripts/fonts.py`'s `STYLES`. */
export type FontStyle = { id: string; name: string; features: string[] };

export type CatalogFont = {
  id: string;
  name: string;
  family: string;
  source: string;
  /** `hash` versions the URL, so a rebuilt font isn't served from a cache. */
  files: { file: string; style: string; weight: string; hash: string }[];
  ligatures: boolean;
  features: FontFeature[];
  /** Besides its standard look. */
  styles: FontStyle[];
  /**
   * Features that hold the font's ligatures, which the Ligatures switch
   * turns on (Monaspace's ss01-ss10). Without them it turns `calt` off.
   */
  ligatureFeatures?: string[];
};

/** Every font's look as its designer ships it: no style's features. */
export const STANDARD_STYLE = 'standard';

/** The rendered Markdown's font (#565). */
export type MarkdownFont = 'system' | 'serif' | 'mono';

export const MARKDOWN_FONTS: readonly { id: MarkdownFont; name: string; family: string }[] = [
  { id: 'system', name: 'System', family: 'var(--font-ui)' },
  // `ganymede nb publish`'s page (ganymede-nbformat's html.rs, `--serif`).
  {
    id: 'serif',
    name: 'Serif, as published notebooks',
    family: 'ui-serif, "Iowan Old Style", "Charter", "Source Serif Pro", Georgia, Cambria, serif',
  },
  // `--code-font` is set on <html>, where this resolves: `--jp-code-font-family`
  // is the code font only under `.notebook-page` (jupyter.css).
  { id: 'mono', name: 'Monospace, the code font', family: 'var(--code-font, var(--font-mono))' },
];

/** The system's monospace font, `--font-mono`: no ligatures or alternates. */
export const SYSTEM_FONT = 'system';

export const FONTS: CatalogFont[] = (catalogJson as { fonts: CatalogFont[] }).fonts;

export type CodeFontSetting = {
  /** `SYSTEM_FONT` or a catalog font's id. */
  font: string;
  /** In CSS pixels (points in the app); null keeps each view's own size. */
  size: number | null;
  ligatures: boolean;
  /** `STANDARD_STYLE` or one of the font's `styles`. */
  style: string;
  markdown: MarkdownFont;
};

export const DEFAULT_CODE_FONT: CodeFontSetting = {
  font: SYSTEM_FONT,
  size: null,
  ligatures: true,
  style: STANDARD_STYLE,
  markdown: 'system',
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

export function fontStyle(setting: Pick<CodeFontSetting, 'font' | 'style'>): FontStyle | undefined {
  return catalogFont(setting.font)?.styles.find(s => s.id === setting.style);
}

/**
 * A setting from JSON, with anything unknown or out of range dropped. A
 * setting saved before styles (#565) lists `features`: the style with
 * just those, if there is one.
 */
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
  const styles = catalogFont(font)?.styles ?? [];
  let style = styles.find(s => s.id === v.style)?.id;
  if (!style && v.style == null && Array.isArray(v.features)) {
    const old = [...new Set(v.features)].sort().join(' ');
    style = styles.find(s => [...s.features].sort().join(' ') === old)?.id;
  }
  const markdown = MARKDOWN_FONTS.find(m => m.id === v.markdown)?.id ?? 'system';
  return { font, size, ligatures: v.ligatures !== false, style: style ?? STANDARD_STYLE, markdown };
}

/** `font-feature-settings` for a setting: its style's features, and the ligatures. */
export function featureSettings(setting: CodeFontSetting): string {
  const font = catalogFont(setting.font);
  if (!font) return 'normal';
  const tags = [...(fontStyle(setting)?.features ?? [])];
  if (setting.ligatures && font.ligatureFeatures) tags.push(...font.ligatureFeatures);
  const parts = [...new Set(tags)].map(t => `"${t}" 1`);
  if (!setting.ligatures && font.ligatures && !font.ligatureFeatures) {
    parts.push('"calt" 0', '"liga" 0', '"dlig" 0');
  }
  return parts.length ? parts.join(', ') : 'normal';
}

/** The rendered Markdown's CSS family list. */
export function markdownFamily(setting: Pick<CodeFontSetting, 'markdown'>): string {
  return (MARKDOWN_FONTS.find(m => m.id === setting.markdown) ?? MARKDOWN_FONTS[0]!).family;
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
        `@font-face{font-family:"${font.family}";src:url("${base}fonts/${f.file}?v=${f.hash}") format("woff2");` +
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
  if (setting.markdown !== 'system') root.setProperty('--markdown-font', markdownFamily(setting));
  else root.removeProperty('--markdown-font');
  // Monospace Markdown takes the code font's style and ligatures too.
  root.setProperty(
    '--markdown-font-features',
    setting.markdown === 'mono' ? featureSettings(setting) : 'normal',
  );
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
  value: CodeFontSetting,
  storage: Pick<Storage, 'setItem'> | undefined = safeStorage(),
): void {
  // Clamped as a reload would: a number field lets any value be typed.
  const setting = parseCodeFont(value);
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
