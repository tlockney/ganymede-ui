import { describe, expect, it } from 'vitest';
import { clean, hasDotSegment, readLaunch, titleFor, withDir, withOpen } from './launch';

describe('readLaunch', () => {
  it('opens nothing by default, at the root', () => {
    expect(readLaunch('')).toEqual({ dir: '' });
    expect(readLaunch('?token=abc')).toEqual({ dir: '' });
  });

  it('opens a notebook in its own folder', () => {
    expect(readLaunch('?open=work/moons/Orbits.ipynb')).toEqual({
      open: 'work/moons/Orbits.ipynb',
      dir: 'work/moons',
    });
    expect(readLaunch('?open=Orbits.ipynb')).toEqual({ open: 'Orbits.ipynb', dir: '' });
  });

  it('reads a console tab’s session, in lower case, only beside console=duckdb (#735)', () => {
    const id = '0F8FAD5B-D9CB-469F-A165-70867728950E';
    expect(readLaunch(`?dir=a&console=duckdb&session=${id}`)).toEqual({
      dir: 'a',
      console: 'duckdb',
      session: id.toLowerCase(),
    });
    expect(readLaunch('?console=duckdb&session=not-an-id')).toEqual({ dir: '', console: 'duckdb' });
    expect(readLaunch(`?dir=a&session=${id}`)).toEqual({ dir: 'a' });
  });

  it('opens the DuckDB console on a folder with console=duckdb (#729)', () => {
    expect(readLaunch('?dir=/Users/me/work&console=duckdb')).toEqual({
      dir: 'Users/me/work',
      console: 'duckdb',
    });
    expect(readLaunch('?console=duckdb')).toEqual({ dir: '', console: 'duckdb' });
    // No other console, and none beside a notebook.
    expect(readLaunch('?dir=a&console=sql')).toEqual({ dir: 'a' });
    expect(readLaunch('?open=a/b.ipynb&console=duckdb')).toEqual({ open: 'a/b.ipynb', dir: 'a' });
  });

  it('drops leading and trailing slashes from absolute paths', () => {
    expect(readLaunch('?open=%2FUsers%2Fme%2FOrbits.ipynb')).toEqual({
      open: 'Users/me/Orbits.ipynb',
      dir: 'Users/me',
    });
    expect(readLaunch('?dir=/Users/me/notes/')).toEqual({ dir: 'Users/me/notes' });
  });

  it('collapses repeated slashes, so the path matches the sidebar', () => {
    expect(readLaunch('?open=/Users//me///Orbits.ipynb')).toEqual({
      open: 'Users/me/Orbits.ipynb',
      dir: 'Users/me',
    });
  });

  it('takes the folder from dir when given', () => {
    expect(readLaunch('?open=a/b.ipynb&dir=a/c')).toEqual({ open: 'a/b.ipynb', dir: 'a/c' });
    expect(readLaunch('?open=a/b.ipynb&dir=')).toEqual({ open: 'a/b.ipynb', dir: '' });
  });

  it('decodes spaces and other characters', () => {
    expect(readLaunch('?open=My%20Notes%2FMoons%20%26%20rings.ipynb').open).toBe(
      'My Notes/Moons & rings.ipynb',
    );
  });
});

describe('titleFor on a machine (#701)', () => {
  it('names the machine on a notebook’s title and when none is open', () => {
    expect(titleFor('a/Orbits.ipynb', 'm4mini')).toBe('Orbits · m4mini');
    expect(titleFor(undefined, 'm4mini')).toBe('m4mini');
    expect(titleFor('a/Orbits.ipynb')).toBe('Orbits');
  });
});

describe('titleFor', () => {
  it("is the notebook's name, or the app's", () => {
    expect(titleFor('a/Orbits.ipynb')).toBe('Orbits');
    expect(titleFor(undefined)).toBe('Ganymede');
  });
});

describe('withOpen', () => {
  it('sets or removes open and keeps the rest', () => {
    expect(withOpen('?x=1', 'a/b c.ipynb')).toBe('?x=1&open=a%2Fb+c.ipynb');
    expect(readLaunch(withOpen('', 'a/b c.ipynb')).open).toBe('a/b c.ipynb');
    expect(withOpen('?open=a.ipynb&x=1', undefined)).toBe('?x=1');
    expect(withOpen('?open=a.ipynb', undefined)).toBe('');
  });
});

describe('withDir', () => {
  it('keeps the folder for a reload, unless the page would start there anyway', () => {
    expect(withDir('', 'Users/me')).toBe('?dir=Users%2Fme');
    expect(readLaunch(withDir('?x=1', 'a b/c')).dir).toBe('a b/c');
    expect(withDir('?dir=Users%2Fme', '')).toBe('');
    // The open notebook's folder is the default.
    expect(withDir('?open=a%2Fb.ipynb&dir=x', 'a')).toBe('?open=a%2Fb.ipynb');
    // The root, with a notebook open elsewhere, has to be said.
    expect(readLaunch(withDir('?open=a%2Fb.ipynb', '')).dir).toBe('');
  });
});

describe('paths that climb out (#740)', () => {
  it('are no path', () => {
    for (const bad of ['../x', 'a/../../x', './a', 'a/..', '..', 'a/%2e%2E/b', 'a\\..\\b']) {
      expect(hasDotSegment(bad), bad).toBe(true);
      expect(clean(bad), bad).toBe('');
    }
  });

  it('leave ordinary names alone', () => {
    for (const ok of ['a/..b/c.d', '.hidden/x', 'a...b', 'Users/me/a.ipynb', '']) {
      expect(hasDotSegment(ok), ok).toBe(false);
    }
    expect(clean('/Users//me/a.ipynb/')).toBe('Users/me/a.ipynb');
  });

  it('are not read from open= or dir=', () => {
    expect(readLaunch('?open=../../a.ipynb&dir=../x')).toEqual({ dir: '' });
  });
});
