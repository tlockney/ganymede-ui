import { describe, expect, it } from 'vitest';
import { headingsOf, outlineOf, plainText } from './outline';

describe('headingsOf', () => {
  it('reads ATX headings at each level', () => {
    expect(headingsOf('# One\ntext\n## Two ##\n###### Six\n####### Seven')).toEqual([
      { level: 1, text: 'One' },
      { level: 2, text: 'Two' },
      { level: 6, text: 'Six' },
    ]);
  });

  it('needs a space after the marks, and skips empty headings', () => {
    expect(headingsOf('#hashtag\n#\n#   \n   # Indented')).toEqual([
      { level: 1, text: 'Indented' },
    ]);
  });

  it('skips fenced code and indented lines', () => {
    const source = [
      '```python',
      '# a comment',
      '```',
      '~~~',
      '# also code',
      '~~~',
      '    # code',
      '# After',
    ];
    expect(headingsOf(source.join('\n'))).toEqual([{ level: 1, text: 'After' }]);
  });

  it('keeps an unclosed fence open to the end of the cell', () => {
    expect(headingsOf('# Before\n```\n# inside')).toEqual([{ level: 1, text: 'Before' }]);
  });

  it('reads setext headings, not a rule after a blank line', () => {
    expect(headingsOf('Title\n=====\n\nSub\n---\n\n---\ntext')).toEqual([
      { level: 1, text: 'Title' },
      { level: 2, text: 'Sub' },
    ]);
  });

  it('reads a list item or quote before --- as a rule', () => {
    expect(headingsOf('- step one\n---')).toEqual([]);
    expect(headingsOf('1. step one\n---')).toEqual([]);
    expect(headingsOf('> quoted\n---')).toEqual([]);
    expect(headingsOf('    <h2>code</h2>')).toEqual([]);
  });

  it('reads HTML headings', () => {
    expect(headingsOf('<h2 id="x">Moons <em>of</em> Jupiter</h2>')).toEqual([
      { level: 2, text: 'Moons of Jupiter' },
    ]);
  });

  it('handles Windows line ends', () => {
    expect(headingsOf('# One\r\n## Two\r\n')).toEqual([
      { level: 1, text: 'One' },
      { level: 2, text: 'Two' },
    ]);
  });
});

describe('plainText', () => {
  it('keeps what is inside code spans as written', () => {
    expect(plainText('The `__init__` method')).toBe('The __init__ method');
    expect(plainText('Using `*args` and `**kwargs`')).toBe('Using *args and **kwargs');
    expect(plainText('The `<div>` element')).toBe('The <div> element');
    expect(plainText('``a ` b``')).toBe('a ` b');
  });

  it('keeps backslashes inside code spans', () => {
    expect(plainText('Regex `\\*` and `\\.`')).toBe('Regex \\* and \\.');
    expect(plainText('Path `C:\\\\Users`')).toBe('Path C:\\\\Users');
    expect(plainText('Not code: \\`x\\`')).toBe('Not code: `x`');
  });

  it('keeps an autolink’s address', () => {
    expect(plainText('See <https://jupyter.org/a_b_c>')).toBe('See https://jupyter.org/a_b_c');
  });

  it('drops tags only, not comparisons', () => {
    expect(plainText('When x < 5 and y > 3')).toBe('When x < 5 and y > 3');
    expect(plainText('List<int> in `Map<K, V>`')).toBe('List in Map<K, V>');
    expect(plainText('<b>Bold</b> &amp; <i>it</i>')).toBe('Bold & it');
  });

  it('decodes &amp; last, and keeps private-use characters', () => {
    expect(plainText('Tom &amp;lt; Jerry')).toBe('Tom &lt; Jerry');
    expect(plainText('\uf8ff Apple \\*')).toBe('\uf8ff Apple *');
  });

  it('drops Markdown marks and keeps the words', () => {
    expect(plainText('**Bold** _it_ `code` [link](http://x) ![img](a.png) ~~gone~~')).toBe(
      'Bold it code link img gone',
    );
    expect(plainText('Using my_var_name and __dunder__')).toBe('Using my_var_name and dunder');
    expect(plainText('Io &amp; Europa \\*not\\* <span>x</span>')).toBe('Io & Europa *not* x');
  });
});

describe('outlineOf', () => {
  it('lists Markdown cells’ headings with their cell index', () => {
    const cells = [
      { type: 'markdown', source: '# Intro\n## Setup' },
      { type: 'code', source: '# not a heading' },
      { type: 'raw', source: '# nor this' },
      { type: 'markdown', source: 'no headings' },
      { type: 'markdown', source: '## Results' },
    ];
    expect(outlineOf(cells)).toEqual([
      { level: 1, text: 'Intro', cell: 0 },
      { level: 2, text: 'Setup', cell: 0 },
      { level: 2, text: 'Results', cell: 4 },
    ]);
  });

  it('is empty without headings', () => {
    expect(outlineOf([])).toEqual([]);
    expect(outlineOf([{ type: 'code', source: 'x = 1' }])).toEqual([]);
  });
});
