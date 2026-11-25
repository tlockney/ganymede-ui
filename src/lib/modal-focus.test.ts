import { describe, expect, it } from 'vitest';
import { containTab, tabbables } from './modal-focus';

function sheet(html: string): HTMLElement {
  const root = document.createElement('div');
  root.innerHTML = html;
  document.body.replaceChildren(root);
  return root;
}

const tab = (shiftKey = false) =>
  new KeyboardEvent('keydown', { key: 'Tab', shiftKey, cancelable: true });

describe('tabbables', () => {
  it('lists the Tab stops in order, skipping what Tab skips', () => {
    const root = sheet(`
      <button id="a">a</button>
      <button id="disabled" disabled>x</button>
      <div role="radio" tabindex="-1" id="roving">x</div>
      <input id="b" />
      <input type="hidden" id="hidden" />
      <div hidden><button id="in-hidden">x</button></div>
      <div inert><button id="in-inert">x</button></div>
      <a id="no-href">x</a>
      <a href="#" id="c">c</a>
      <div tabindex="0" id="d">d</div>
    `);
    expect(tabbables(root).map(el => el.id)).toEqual(['a', 'b', 'c', 'd']);
  });
});

describe('containTab', () => {
  it('wraps from the last stop to the first and back', () => {
    const root = sheet('<button id="a">a</button><button id="b">b</button>');
    const [a, b] = tabbables(root);
    b.focus();
    const forward = tab();
    containTab(forward, root);
    expect(forward.defaultPrevented).toBe(true);
    expect(a).toHaveFocus();
    const back = tab(true);
    containTab(back, root);
    expect(back.defaultPrevented).toBe(true);
    expect(b).toHaveFocus();
  });

  it('moves focus itself between stops inside', () => {
    const root = sheet('<button id="a">a</button><input id="b" /><button id="c">c</button>');
    root.querySelector<HTMLElement>('#b')!.focus();
    const forward = tab();
    containTab(forward, root);
    expect(forward.defaultPrevented).toBe(true);
    expect(document.activeElement?.id).toBe('c');
    root.querySelector<HTMLElement>('#b')!.focus();
    const back = tab(true);
    containTab(back, root);
    expect(back.defaultPrevented).toBe(true);
    expect(document.activeElement?.id).toBe('a');
  });

  it('goes to the stop nearest a focused element that is not one', () => {
    const root = sheet(
      '<button id="a">a</button><div tabindex="-1" id="x">x</div><button id="b">b</button>',
    );
    const x = root.querySelector<HTMLElement>('#x')!;
    x.focus();
    containTab(tab(), root);
    expect(document.activeElement?.id).toBe('b');
    x.focus();
    containTab(tab(true), root);
    expect(document.activeElement?.id).toBe('a');
    // Past the last stop, wrapping.
    const end = sheet('<button id="a">a</button><div tabindex="-1" id="x">x</div>');
    end.querySelector<HTMLElement>('#x')!.focus();
    containTab(tab(), end);
    expect(document.activeElement?.id).toBe('a');
    // Past the last of two stops: the first, not the last.
    const two = sheet(
      '<button id="a">a</button><button id="b">b</button><div tabindex="-1" id="x">x</div>',
    );
    two.querySelector<HTMLElement>('#x')!.focus();
    containTab(tab(), two);
    expect(document.activeElement?.id).toBe('a');
    // Back from past the last stop: the last one.
    const tail = sheet(
      '<button id="a">a</button><button id="b">b</button><div tabindex="-1" id="x">x</div>',
    );
    tail.querySelector<HTMLElement>('#x')!.focus();
    containTab(tab(true), tail);
    expect(document.activeElement?.id).toBe('b');
  });

  it('brings focus in from outside', () => {
    const root = sheet('<button id="a">a</button><button id="b">b</button>');
    const outside = document.createElement('button');
    document.body.prepend(outside);
    outside.focus();
    containTab(tab(), root);
    expect(document.activeElement?.id).toBe('a');
    outside.focus();
    containTab(tab(true), root);
    expect(document.activeElement?.id).toBe('b');
  });

  it('keeps Tab in a sheet with no Tab stops', () => {
    const root = sheet('<button disabled>a</button>');
    const outside = document.createElement('button');
    document.body.append(outside);
    outside.focus();
    const e = tab();
    containTab(e, root);
    expect(e.defaultPrevented).toBe(true);
    expect(outside).toHaveFocus();
  });

  it('ignores other keys and modified Tab', () => {
    const root = sheet('<button id="a">a</button>');
    tabbables(root)[0].focus();
    const other = new KeyboardEvent('keydown', { key: 'Enter', cancelable: true });
    containTab(other, root);
    expect(other.defaultPrevented).toBe(false);
    for (const mod of ['altKey', 'ctrlKey', 'metaKey']) {
      const e = new KeyboardEvent('keydown', { key: 'Tab', [mod]: true, cancelable: true });
      containTab(e, root);
      expect(e.defaultPrevented).toBe(false);
    }
  });
});
