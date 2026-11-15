import { describe, expect, it } from 'vitest';
import { appliesTo, ganymedeOpenUrl, offerOpenInGanymede, RenderSequencer } from './viewlogic.ts';

describe('appliesTo', () => {
  it('matches only the open file', () => {
    expect(appliesTo('a/b.ipynb', 'a/b.ipynb')).toBe(true);
    expect(appliesTo('a/c.ipynb', 'a/b.ipynb')).toBe(false);
    expect(appliesTo('a/b.ipynb', null)).toBe(false);
    expect(appliesTo('a/b.ipynb', undefined)).toBe(false);
  });
});

describe('offerOpenInGanymede', () => {
  it.each([
    ['mac desktop', { isMacOS: true, isDesktopApp: true }, true],
    ['iPad (isMacOS, not the desktop app)', { isMacOS: true, isDesktopApp: false }, false],
    ['iPhone', { isMacOS: false, isDesktopApp: false }, false],
    ['Windows or Linux desktop', { isMacOS: false, isDesktopApp: true }, false],
  ])('%s', (_name, platform, expected) => {
    expect(offerOpenInGanymede(platform)).toBe(expected);
  });
});

describe('ganymedeOpenUrl', () => {
  it('percent-encodes spaces, unicode and URL punctuation', () => {
    expect(ganymedeOpenUrl('/Users/t/My Vault/a b.ipynb')).toBe(
      'ganymede://open?path=%2FUsers%2Ft%2FMy%20Vault%2Fa%20b.ipynb',
    );
    expect(ganymedeOpenUrl('/v/ü日本#1?x=1&y.ipynb')).toBe(
      'ganymede://open?path=%2Fv%2F%C3%BC%E6%97%A5%E6%9C%AC%231%3Fx%3D1%26y.ipynb',
    );
    const url = new URL(ganymedeOpenUrl('/v/a#b?c&d=e.ipynb'));
    expect(url.searchParams.get('path')).toBe('/v/a#b?c&d=e.ipynb');
  });
});

describe('RenderSequencer', () => {
  it('drops a result after a newer begin', () => {
    const s = new RenderSequencer();
    const first = s.begin();
    const second = s.begin();
    expect(s.isCurrent(first)).toBe(false);
    expect(s.isCurrent(second)).toBe(true);
  });

  it('drops a result after invalidate', () => {
    const s = new RenderSequencer();
    const t = s.begin();
    s.invalidate();
    expect(s.isCurrent(t)).toBe(false);
    expect(s.isCurrent(s.begin())).toBe(true);
  });
});
