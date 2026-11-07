import { existsSync } from 'node:fs';
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
    }
  });
});

describe('parseCodeFont', () => {
  it('falls back to the default', () => {
    expect(parseCodeFont(null)).toEqual(DEFAULT_CODE_FONT);
    expect(parseCodeFont({ font: 'comic-sans', size: 'big' })).toEqual(DEFAULT_CODE_FONT);
  });

  it("keeps the font's own features and clamps the size", () => {
    expect(
      parseCodeFont({
        font: 'fira-code',
        size: 99,
        ligatures: false,
        features: ['ss01', 'ss01', 'xx99', 3],
      }),
    ).toEqual({ font: 'fira-code', size: 32, ligatures: false, features: ['ss01'] });
  });
});

describe('featureSettings', () => {
  it('is normal for the system font', () => {
    expect(featureSettings({ ...DEFAULT_CODE_FONT, features: ['ss01'] })).toBe('normal');
  });

  it('turns on alternates and turns off ligatures', () => {
    expect(
      featureSettings({ font: 'fira-code', size: null, ligatures: false, features: ['ss01'] }),
    ).toBe('"ss01" 1, "calt" 0, "liga" 0, "dlig" 0');
  });
});

describe('applyCodeFont', () => {
  it('adds only the chosen font and sets the variables', () => {
    applyCodeFont({ font: 'jetbrains-mono', size: 14, ligatures: true, features: ['zero'] });
    const style = document.getElementById('ganymede-code-font')!;
    expect(style.textContent).toContain('/fonts/jetbrains-mono.woff2');
    expect(style.textContent).not.toContain('fira-code');
    const root = document.documentElement.style;
    expect(root.getPropertyValue('--code-font')).toBe('"JetBrains Mono", var(--font-mono)');
    expect(root.getPropertyValue('--code-font-size')).toBe('14px');
    expect(root.getPropertyValue('--code-font-features')).toBe('"zero" 1');

    applyCodeFont(DEFAULT_CODE_FONT);
    expect(style.textContent).toBe('');
    expect(root.getPropertyValue('--code-font')).toBe('');
    expect(root.getPropertyValue('--code-font-size')).toBe('');
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
