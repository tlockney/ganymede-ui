import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  DEFAULT_CODE_FONT,
  FONTS,
  applyCodeFont,
  codeFontSetting,
  featureSettings,
  fontFaces,
  parseCodeFont,
  saveCodeFont,
  startCodeFont,
} from './code-font';

describe('catalog', () => {
  it('lists bundled fonts whose files and licences exist', () => {
    expect(FONTS.map(f => f.id)).toContain('fira-code');
    for (const font of FONTS) {
      expect(font.family).toBeTruthy();
      expect(existsSync(`public/fonts/licenses/${font.id}.txt`)).toBe(true);
      for (const f of font.files) expect(existsSync(`public/fonts/${f.file}`)).toBe(true);
      for (const f of font.features) expect(f.tag).toMatch(/^(ss\d\d|cv\d\d|zero)$/);
      const tags = new Set(font.features.map(f => f.tag));
      for (const s of font.styles) {
        expect(s.id).not.toBe('standard');
        for (const t of s.features) expect(tags.has(t), `${font.id} ${s.id} ${t}`).toBe(true);
      }
      for (const t of font.ligatureFeatures ?? []) expect(tags.has(t)).toBe(true);
    }
  });

  it('versions each file by its own hash, so a changed file gets a new URL', () => {
    for (const font of FONTS) {
      for (const f of font.files) {
        const sha = createHash('sha256')
          .update(readFileSync(`public/fonts/${f.file}`))
          .digest('hex');
        expect(f.hash, `${f.file}: re-run scripts/fonts.py`).toBe(sha.slice(0, 12));
      }
    }
  });
});

describe('parseCodeFont', () => {
  it('falls back to the default', () => {
    expect(parseCodeFont(null)).toEqual(DEFAULT_CODE_FONT);
    expect(parseCodeFont({ font: 'comic-sans', size: 'big' })).toEqual(DEFAULT_CODE_FONT);
  });

  it("keeps the font's own style and clamps the size", () => {
    expect(
      parseCodeFont({ font: 'fira-code', size: 99, ligatures: false, style: 'dotted-zero' }),
    ).toEqual({
      font: 'fira-code',
      size: 32,
      ligatures: false,
      style: 'dotted-zero',
      markdown: 'system',
    });
    expect(parseCodeFont({ font: 'fira-code', style: 'classic' }).style).toBe('standard');
    expect(parseCodeFont({ markdown: 'serif' }).markdown).toBe('serif');
    expect(parseCodeFont({ markdown: 'comic' }).markdown).toBe('system');
  });

  it('turns a setting saved before styles into the style with its features', () => {
    expect(parseCodeFont({ font: 'jetbrains-mono', features: ['zero'] }).style).toBe(
      'slashed-zero',
    );
    expect(
      parseCodeFont({ font: 'fira-code', features: ['ss05', 'ss03', 'cv01', 'ss01'] }).style,
    ).toBe('alternate-letters');
    expect(parseCodeFont({ font: 'fira-code', features: ['ss02'] }).style).toBe('standard');
  });
});

describe('featureSettings', () => {
  it('is normal for the system font', () => {
    expect(featureSettings({ ...DEFAULT_CODE_FONT, style: 'slashed-zero' })).toBe('normal');
  });

  it("turns on the style's features and turns off ligatures", () => {
    expect(
      featureSettings({
        ...DEFAULT_CODE_FONT,
        font: 'fira-code',
        ligatures: false,
        style: 'alternate-letters',
      }),
    ).toBe('"cv01" 1, "ss01" 1, "ss03" 1, "ss05" 1, "calt" 0, "liga" 0, "dlig" 0');
  });

  it("turns on Monaspace's ligature sets, and leaves its texture healing", () => {
    const on = featureSettings({ ...DEFAULT_CODE_FONT, font: 'monaspace-neon' });
    expect(on).toContain('"ss01" 1');
    expect(on).toContain('"ss10" 1');
    expect(on).not.toContain('calt');
    expect(
      featureSettings({ ...DEFAULT_CODE_FONT, font: 'monaspace-neon', ligatures: false }),
    ).toBe('normal');
  });
});

describe('applyCodeFont', () => {
  it('adds only the chosen font and sets the variables', () => {
    applyCodeFont({
      ...DEFAULT_CODE_FONT,
      font: 'jetbrains-mono',
      size: 14,
      style: 'slashed-zero',
      markdown: 'serif',
    });
    const style = document.getElementById('ganymede-code-font')!;
    expect(style.textContent).toMatch(/\/fonts\/jetbrains-mono\.woff2\?v=[0-9a-f]{12}"/);
    expect(style.textContent).not.toContain('fira-code');
    const root = document.documentElement.style;
    expect(root.getPropertyValue('--code-font')).toBe('"JetBrains Mono", var(--font-mono)');
    expect(root.getPropertyValue('--code-font-size')).toBe('14px');
    expect(root.getPropertyValue('--code-font-features')).toBe('"zero" 1');
    expect(root.getPropertyValue('--markdown-font')).toContain('Iowan Old Style');

    applyCodeFont(DEFAULT_CODE_FONT);
    expect(style.textContent).toBe('');
    expect(root.getPropertyValue('--code-font')).toBe('');
    expect(root.getPropertyValue('--code-font-size')).toBe('');
    expect(root.getPropertyValue('--markdown-font')).toBe('');
  });

  it('declares each file of a font', () => {
    const faces = fontFaces({ ...DEFAULT_CODE_FONT, font: 'iosevka' }, '/');
    expect(faces.match(/@font-face/g)).toHaveLength(3);
    expect(faces).toContain('font-style:italic');
  });
});

describe('codeFontSetting', () => {
  it("follows the app's setting over the browser's", () => {
    const storage = { getItem: () => JSON.stringify({ font: 'fira-code' }) };
    expect(codeFontSetting({ ganymedeCodeFont: { font: 'iosevka' } }, storage)).toEqual({
      setting: { ...DEFAULT_CODE_FONT, font: 'iosevka' },
      owner: 'app',
    });
    expect(codeFontSetting({}, storage).setting.font).toBe('fira-code');
    expect(codeFontSetting({}, { getItem: () => '{bad' }).owner).toBe('page');
  });

  it("saves the browser's setting", () => {
    localStorage.clear();
    saveCodeFont({ ...DEFAULT_CODE_FONT, font: 'cascadia-code', size: 13 });
    expect(codeFontSetting({}, localStorage).setting).toMatchObject({
      font: 'cascadia-code',
      size: 13,
    });
    saveCodeFont({ ...DEFAULT_CODE_FONT, size: 100 });
    expect(document.documentElement.style.getPropertyValue('--code-font-size')).toBe('32px');
    applyCodeFont(DEFAULT_CODE_FONT);
    localStorage.clear();
  });

  it('lets the app change it', () => {
    startCodeFont(window);
    window.ganymedeSetCodeFont!({ font: 'monaspace-neon', size: 15 });
    expect(document.documentElement.style.getPropertyValue('--code-font-size')).toBe('15px');
    expect(window.ganymedeCodeFont).toEqual({ font: 'monaspace-neon', size: 15 });
    delete window.ganymedeCodeFont;
    delete window.ganymedeSetCodeFont;
    applyCodeFont(DEFAULT_CODE_FONT);
  });
});
