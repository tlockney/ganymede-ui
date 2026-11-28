import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

/*
 * Text contrast computed from the stylesheets themselves (#799): --on-accent
 * on the filled accent, the accent as text (links, insert and text buttons),
 * execution prompts, and text on the orange fill (#802), in light and
 * dark, each at WCAG AA's 4.5:1 for text. A change to a token, a color or
 * an opacity in these rules fails here. #845's review added the accent's
 * own contrast as a non-text indicator (3:1) and the text a fill on a
 * parent draws.
 */

const AA = 4.5;

type Rule = { selector: string; media: string | null; decls: Map<string, string> };

/** The rules of a stylesheet, with the media query each sits in. */
function parseRules(css: string): Rule[] {
  const src = css.replace(/\/\*[\s\S]*?\*\//g, '');
  const rules: Rule[] = [];
  let i = 0;
  const block = (media: string | null) => {
    while (i < src.length) {
      const open = src.indexOf('{', i);
      const close = src.indexOf('}', i);
      if (close !== -1 && (open === -1 || close < open)) {
        i = close + 1;
        return;
      }
      if (open === -1) return;
      const prelude = src.slice(i, open).trim();
      i = open + 1;
      if (prelude.startsWith('@')) {
        block(prelude);
        continue;
      }
      const end = src.indexOf('}', i);
      const decls = new Map<string, string>();
      for (const d of src.slice(i, end).split(';')) {
        const colon = d.indexOf(':');
        if (colon > 0) decls.set(d.slice(0, colon).trim(), d.slice(colon + 1).trim());
      }
      i = end + 1;
      for (const selector of prelude.split(',')) {
        rules.push({ selector: selector.trim().replace(/\s+/g, ' '), media, decls });
      }
    }
  };
  block(null);
  return rules;
}

const sheet = (name: string) => parseRules(readFileSync(new URL(name, import.meta.url), 'utf8'));
const app = sheet('./app.css');
const jupyter = sheet('./jupyter.css');

const DARK = '@media (prefers-color-scheme: dark)';
type Theme = 'light' | 'dark';
const themes: Theme[] = ['light', 'dark'];

const inTheme = (r: Rule, theme: Theme) =>
  r.media === null || (theme === 'dark' && r.media === DARK);

/** The custom properties `.notebook-page` sees: `:root`'s, then its own. */
function variables(theme: Theme): Map<string, string> {
  const vars = new Map<string, string>();
  const take = (rules: Rule[], selector: string) => {
    for (const r of rules) {
      if (r.selector !== selector || !inTheme(r, theme)) continue;
      for (const [k, v] of r.decls) if (k.startsWith('--')) vars.set(k, v);
    }
  };
  // Light first, then the dark overrides, as the cascade applies them.
  const ordered = (rules: Rule[]) => [
    ...rules.filter(r => r.media === null),
    ...rules.filter(r => r.media !== null),
  ];
  take(ordered(app), ':root');
  take(ordered(jupyter), '.notebook-page');
  return vars;
}

function resolve(value: string, vars: Map<string, string>): string {
  for (let n = 0; n < 20; n++) {
    const m = /^var\((--[\w-]+)\s*(?:,\s*(.+))?\)$/.exec(value.trim());
    if (!m) return value.trim();
    const next = vars.get(m[1]) ?? m[2];
    if (next === undefined) throw new Error(`undefined ${m[1]}`);
    value = next;
  }
  throw new Error(`var() loop at ${value}`);
}

type RGBA = [number, number, number, number];

function color(value: string): RGBA {
  const hex = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(value);
  if (hex) {
    const h = hex[1].length === 3 ? [...hex[1]].map(c => c + c).join('') : hex[1];
    return [0, 2, 4].map(k => parseInt(h.slice(k, k + 2), 16)).concat(1) as RGBA;
  }
  const fn = /^rgba?\(([^)]+)\)$/.exec(value);
  if (fn) {
    const [r, g, b, a = '1'] = fn[1].split(/[\s,/]+/).filter(Boolean);
    return [Number(r), Number(g), Number(b), Number(a)];
  }
  if (value === 'white') return [255, 255, 255, 1];
  throw new Error(`unparsed color ${value}`);
}

/** `fg` at `alpha` (its own alpha times any opacity) over an opaque `bg`. */
function over(fg: RGBA, bg: RGBA, opacity = 1): RGBA {
  const a = fg[3] * opacity;
  return [0, 1, 2].map(k => fg[k] * a + bg[k] * (1 - a)).concat(1) as RGBA;
}

function luminance([r, g, b]: RGBA): number {
  const lin = (v: number) => {
    v /= 255;
    return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
}

function contrast(a: RGBA, b: RGBA): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

/** A rule's declaration in a theme, the dark block overriding. */
function decl(rules: Rule[], selector: string, prop: string, theme: Theme): string | undefined {
  let value: string | undefined;
  for (const r of rules) {
    if (r.selector === selector && r.media === null && r.decls.has(prop)) value = r.decls.get(prop);
  }
  if (theme === 'dark') {
    for (const r of rules) {
      if (r.selector === selector && r.media === DARK && r.decls.has(prop)) {
        value = r.decls.get(prop);
      }
    }
  }
  return value;
}

const opacity = (v: string | undefined, vars: Map<string, string>) =>
  v === undefined ? 1 : Number(resolve(v, vars));

describe('text contrast (#799)', () => {
  // Every rule that puts --on-accent text on an accent fill: the primary
  // buttons, notice actions, highlighted menu and palette rows, the
  // keyboard bar's primary key, the journal's follow button.
  const fillOf = (r: Rule) => r.decls.get('background') ?? r.decls.get('background-color');
  const filled = [...app, ...jupyter].filter(
    r => r.decls.get('color') === 'var(--on-accent)' && /^var\(--accent/.test(fillOf(r) ?? ''),
  );
  // White text on an accent fill, which --on-accent replaced (#845): the
  // accent is the icon's orange now, too light for white.
  const WHITE = /^(#fff|#ffffff|white)$/i;
  const whiteOnAccent = [...app, ...jupyter].filter(
    r => WHITE.test(r.decls.get('color') ?? '') && /^var\(--accent/.test(fillOf(r) ?? ''),
  );

  // The accent as text color. Plain --accent is for icons only (the
  // sources list's tint, a selected choice's icon), where 3:1 is enough;
  // text takes --accent-text.
  const accentText = [...app, ...jupyter].filter(r =>
    /^var\(--accent(-text)?\)$/.test(r.decls.get('color') ?? ''),
  );
  const ICONS = ['.source-item .tint', '.choice.selected svg'];

  // Rules whose fill is a parent's, not their own (#845 review): the Run
  // button and its menu sit on .run-group's fill, the palette's shortcut
  // keys on an active row's. Filtering the rules' own backgrounds misses
  // them, so the pairs are named here and both ends are checked.
  const FILLED_BY_PARENT: [child: string, parent: string][] = [
    ['.run-button', '.run-group'],
    ['.run-menu-button', '.run-group'],
    ['.palette-item.active .palette-keys', '.palette-item.active'],
  ];
  const backgroundOf = (selector: string, theme: Theme) =>
    decl([...app, ...jupyter], selector, 'background', theme) ??
    decl([...app, ...jupyter], selector, 'background-color', theme);

  it('uses plain --accent as a text color only on icons', () => {
    const plain = accentText
      .filter(r => r.decls.get('color') === 'var(--accent)')
      .map(r => r.selector);
    expect(plain.sort()).toEqual([...ICONS].sort());
    const text = accentText.map(r => r.selector);
    for (const s of [
      '.pane-notice-dismiss',
      '.journal-running',
      '.notebook-page .cm-md-live .cm-md-link',
      '.touch-ui .notebook-page .gn-add-button',
    ]) {
      expect(text).toContain(s);
    }
  });

  it('finds the filled accent rules, the primary button among them', () => {
    expect(filled.map(r => r.selector)).toContain('.push-button.primary');
    expect(filled.length).toBeGreaterThanOrEqual(7);
  });

  it('puts no white text on an accent fill any more (#845)', () => {
    expect(whiteOnAccent.map(r => r.selector)).toEqual([]);
    // The rules that read a parent's fill, which the filter above misses.
    for (const [child, parent] of FILLED_BY_PARENT) {
      for (const theme of themes) {
        expect(backgroundOf(parent, theme), `${parent} in ${theme}`).toMatch(/^var\(--accent/);
        const text = decl([...app, ...jupyter], child, 'color', theme);
        expect(text, `${child} in ${theme}`).toBeDefined();
        expect(WHITE.test(text!), `${child} in ${theme}`).toBe(false);
      }
    }
  });

  for (const theme of themes) {
    it(`the accent as an indicator reads at 3:1 on the page and sidebar in ${theme}`, () => {
      // Focus rings, the drop line, the active-cell bar and the sidebar's
      // source tint are non-text: 3:1, not 4.5:1 (#845 review).
      const vars = variables(theme);
      const accent = color(resolve('var(--accent)', vars));
      for (const bg of ['var(--window-bg)', 'var(--sidebar-solid)', 'var(--cell-bg)']) {
        const ratio = contrast(accent, color(resolve(bg, vars)));
        expect(ratio, `${bg} ${ratio.toFixed(2)}`).toBeGreaterThanOrEqual(3);
      }
    });

    it(`text on a parent's accent fill reads at ${AA}:1 in ${theme}`, () => {
      const vars = variables(theme);
      for (const [child, parent] of FILLED_BY_PARENT) {
        const fill = color(resolve(backgroundOf(parent, theme)!, vars));
        expect(fill[3], parent).toBe(1);
        const text = color(resolve(decl([...app, ...jupyter], child, 'color', theme)!, vars));
        const opacityOf = opacity(decl([...app, ...jupyter], child, 'opacity', theme), vars);
        const shown = over(text, fill, opacityOf);
        const ratio = contrast(shown, fill);
        expect(ratio, `${child} ${ratio.toFixed(2)}`).toBeGreaterThanOrEqual(AA);
      }
    });
  }

  for (const theme of themes) {
    it(`--on-accent on every accent fill reads at ${AA}:1 in ${theme}`, () => {
      const vars = variables(theme);
      const text = color(resolve('var(--on-accent)', vars));
      for (const r of filled) {
        const bg = color(resolve(fillOf(r)!, vars));
        expect(bg[3], r.selector).toBe(1);
        const ratio = contrast(text, bg);
        expect(ratio, `${r.selector} ${ratio.toFixed(2)}`).toBeGreaterThanOrEqual(AA);
      }
    });

    it(`the accent as text reads at ${AA}:1 in ${theme}`, () => {
      const vars = variables(theme);
      const page = color(resolve('var(--window-bg)', vars));
      const cell = over(color(resolve('var(--cell-bg)', vars)), page);
      for (const r of accentText) {
        if (ICONS.includes(r.selector)) continue;
        const own = fillOf(r);
        const bg = own ? over(color(resolve(own, vars)), page) : page;
        // The text color as this theme draws it: a dark-only override counts.
        const text = color(resolve(decl([...app, ...jupyter], r.selector, 'color', theme)!, vars));
        const ratio = contrast(over(text, bg), bg);
        expect(ratio, `${r.selector} ${ratio.toFixed(2)}`).toBeGreaterThanOrEqual(AA);
      }
      // Links: rendered Markdown on the page, live Markdown on a cell.
      for (const bg of [page, cell]) {
        for (const v of ['var(--jp-content-link-color)', 'var(--accent-text)']) {
          const ratio = contrast(over(color(resolve(v, vars)), bg), bg);
          expect(ratio, `${v} ${ratio.toFixed(2)}`).toBeGreaterThanOrEqual(AA);
        }
      }
    });

    it(`execution prompts read at ${AA}:1 in ${theme}, active, inactive or selected`, () => {
      const vars = variables(theme);
      const page = color(resolve('var(--window-bg)', vars));
      // JupyterLab fills selected cells with this in command mode.
      const selected = over(color(resolve('var(--jp-notebook-multiselected-color)', vars)), page);
      const prompts = ['.notebook-page .jp-InputPrompt', '.notebook-page .jp-OutputPrompt'];
      for (const [bg, selector] of [page, selected].flatMap(bg =>
        prompts.map(s => [bg, s] as const),
      )) {
        const own = opacity(decl(jupyter, selector, 'opacity', theme), vars);
        const cases = [
          ['--jp-cell-inprompt-font-color', '--jp-cell-prompt-opacity'],
          ['--jp-cell-outprompt-font-color', '--jp-cell-prompt-opacity'],
          ['--jp-cell-prompt-not-active-font-color', '--jp-cell-prompt-not-active-opacity'],
        ];
        for (const [fg, alpha] of cases) {
          // JupyterLab's own values if the shell stopped setting them
          // would fail here: they are not in `vars`.
          const text = color(resolve(`var(${fg})`, vars));
          const ratio = contrast(over(text, bg, own * opacity(`var(${alpha})`, vars)), bg);
          expect(ratio, `${selector} ${fg} ${ratio.toFixed(2)}`).toBeGreaterThanOrEqual(AA);
        }
      }
    });

    it(`the insert buttons' text reads at ${AA}:1 in ${theme}, while quiet`, () => {
      const vars = variables(theme);
      const page = color(resolve('var(--window-bg)', vars));
      const button = '.touch-ui .notebook-page .gn-add-button';
      const quiet = opacity(
        decl(jupyter, '.touch-ui .notebook-page .gn-add-cell', 'opacity', theme),
        vars,
      );
      const fill = over(color(resolve(decl(jupyter, button, 'background', theme)!, vars)), page);
      const text = color(resolve(decl(jupyter, button, 'color', theme)!, vars));
      // The row's opacity fades the button's fill and its text together.
      const shownFill = over(fill, page, quiet);
      const shownText = over(over(text, fill), page, quiet);
      const ratio = contrast(shownText, shownFill);
      expect(ratio, ratio.toFixed(2)).toBeGreaterThanOrEqual(AA);
    });
  }

  // Text on the orange fill: the machine banner (#802), and any later
  // rule that sets a text color over var(--orange).
  const onOrange = [...app, ...jupyter].filter(
    r => fillOf(r) === 'var(--orange)' && r.decls.has('color'),
  );

  it('finds the text on an orange fill, the machine banner among it', () => {
    expect(onOrange.map(r => r.selector)).toContain('.machine-banner');
  });

  for (const theme of themes) {
    it(`text on the orange fill reads at ${AA}:1 in ${theme} (#802)`, () => {
      const vars = variables(theme);
      for (const r of onOrange) {
        const bg = color(resolve(fillOf(r)!, vars));
        expect(bg[3], r.selector).toBe(1);
        // The text color as this theme draws it: a dark-only override counts.
        const text = color(resolve(decl([...app, ...jupyter], r.selector, 'color', theme)!, vars));
        const ratio = contrast(over(text, bg), bg);
        expect(ratio, `${r.selector} ${ratio.toFixed(2)}`).toBeGreaterThanOrEqual(AA);
      }
    });
  }

  it('fails the colors the issue measured', () => {
    // The checks above can fail: the old values, through the same math.
    const white = color('#fff');
    expect(contrast(white, color('#007aff'))).toBeLessThan(AA);
    expect(contrast(white, color('#0a84ff'))).toBeLessThan(AA);
    const light = color('#ffffff');
    expect(contrast(over(color('#616161'), light, 0.5), light)).toBeLessThan(AA);
    expect(contrast(color('#007aff'), light)).toBeLessThan(AA);
    const soft = over(color('rgba(0, 122, 255, 0.12)'), light);
    expect(contrast(over(color('rgba(60, 60, 67, 0.72)'), soft), soft)).toBeLessThan(AA);
    const dark = color('#1e1e20');
    expect(contrast(over(color('#0a84ff'), dark, 0.55), dark)).toBeLessThan(AA);
    // #802: white on the orange, light and dark.
    expect(contrast(white, color('#ff9500'))).toBeLessThan(AA);
    expect(contrast(white, color('#ff9f0a'))).toBeLessThan(AA);
  });
});

describe('secondary metadata text (#814)', () => {
  // The status line in the toolbar (Toolbar.tsx), a cell's meta line
  // (cell-controls.ts), the meta line under a cell's outputs and the run
  // gutter's count and time (#852): --meta-color, as strong as the prompts
  // (#799). The --text-2 they used before fails here in light: 4.36:1 on a
  // selected cell's --accent-soft and 4.47:1 on the status line's hover
  // fill.
  const status = '.status-line';
  const metaLines = [
    '.touch-ui .notebook-page .gn-cell-meta',
    '.notebook-page .gn-output-meta',
    ':root:not(.touch-ui) .notebook-page .gn-cell-gutter',
  ];

  for (const theme of themes) {
    it(`the status line reads at ${AA}:1 in ${theme}, still and on hover`, () => {
      const vars = variables(theme);
      const page = color(resolve('var(--window-bg)', vars));
      const bar = over(color(resolve('var(--toolbar-bg)', vars)), page);
      const text = color(resolve(decl(app, status, 'color', theme)!, vars));
      const ratio = contrast(over(text, bar), bar);
      expect(ratio, ratio.toFixed(2)).toBeGreaterThanOrEqual(AA);
      // The toolbar is translucent, and the line's hover fill sits on it.
      const hover = over(
        color(resolve(decl(app, '.status-line:hover', 'background', theme)!, vars)),
        bar,
      );
      const onHover = contrast(over(text, hover), hover);
      expect(onHover, onHover.toFixed(2)).toBeGreaterThanOrEqual(AA);
    });

    it(`the cell’s meta text reads at ${AA}:1 in ${theme}, on the card and selected`, () => {
      const vars = variables(theme);
      const page = color(resolve('var(--window-bg)', vars));
      // A cell is a card now (#852); a selected one still takes JupyterLab's
      // multiselect fill, which a multiselect of one draws too.
      const card = over(color(resolve('var(--cell-bg)', vars)), page);
      const selected = over(color(resolve('var(--jp-notebook-multiselected-color)', vars)), card);
      for (const selector of metaLines) {
        const text = color(resolve(decl(jupyter, selector, 'color', theme)!, vars));
        for (const bg of [card, selected]) {
          const ratio = contrast(over(text, bg), bg);
          expect(ratio, `${selector} ${ratio.toFixed(2)}`).toBeGreaterThanOrEqual(AA);
        }
      }
    });
  }

  /*
   * The Mac toolbar's colours (#892) are colorsets in the app's asset
   * catalog, not the stylesheets: the Run button's fill and the text on
   * it, and the title on the window's surface. They read at AA in both
   * appearances too, so a change to a colorset fails here.
   */
  type ColorSet = {
    colors?: {
      appearances?: { appearance: string; value: string }[];
      color?: { components?: Record<string, string> };
    }[];
  };
  function colorset(name: string, theme: Theme): RGBA {
    const file = new URL(
      `apple/Resources/macOS/Assets.xcassets/${name}.colorset/Contents.json`,
      // Vitest runs from the repository root, and `import.meta.url` is not
      // the file's place under its jsdom environment.
      `file://${process.cwd()}/`,
    );
    const entries = (JSON.parse(readFileSync(file, 'utf8')) as ColorSet).colors ?? [];
    const dark = entries.find(e =>
      e.appearances?.some(a => a.appearance === 'luminosity' && a.value === 'dark'),
    );
    const light = entries.find(e => !e.appearances?.length);
    const pick = (theme === 'dark' ? dark : light) ?? light;
    const c = pick?.color?.components;
    if (!c) throw new Error(`no ${theme} colour in ${name}.colorset`);
    return [Number(c.red) * 255, Number(c.green) * 255, Number(c.blue) * 255, 1];
  }

  for (const theme of themes) {
    it(`the Mac toolbar's coloursets read at ${AA}:1 in ${theme} (#892)`, () => {
      const pairs: [fg: string, bg: string][] = [
        ['OnAccent', 'AccentFill'],
        ['TitleText', 'WindowBackground'],
      ];
      for (const [fg, bg] of pairs) {
        const ratio = contrast(colorset(fg, theme), colorset(bg, theme));
        expect(ratio, `${fg} on ${bg} ${ratio.toFixed(2)}`).toBeGreaterThanOrEqual(AA);
      }
    });
  }
});
