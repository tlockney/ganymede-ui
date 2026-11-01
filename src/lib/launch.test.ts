import { describe, expect, it } from 'vitest';
import { readLaunch, titleFor, withOpen } from './launch';

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
