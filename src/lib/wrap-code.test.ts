import { afterEach, describe, expect, it } from 'vitest';
import { EditorState } from '@codemirror/state';
import { EditorView } from '@codemirror/view';
import {
  resetWrapCodeForTests,
  setWrapCodeEnabled,
  subscribeWrapCode,
  wrapCode,
  wrapCodeEnabled,
} from './wrap-code';

const views: EditorView[] = [];
function editor(): EditorView {
  const view = new EditorView({
    state: EditorState.create({ doc: 'x'.repeat(500), extensions: [wrapCode()] }),
  });
  views.push(view);
  return view;
}

afterEach(() => {
  views.splice(0).forEach(v => v.destroy());
  resetWrapCodeForTests();
});

describe('Wrap Code (#813)', () => {
  it('is off until turned on, and remembered', () => {
    expect(wrapCodeEnabled()).toBe(false);
    setWrapCodeEnabled(true);
    expect(wrapCodeEnabled()).toBe(true);
    expect(localStorage.getItem('ganymede-ui:wrap-code')).toBe('on');
    setWrapCodeEnabled(false);
    expect(localStorage.getItem('ganymede-ui:wrap-code')).toBeNull();
  });

  it('wraps lines in a new editor while on, and not while off', () => {
    expect(editor().contentDOM.classList.contains('cm-lineWrapping')).toBe(false);
    setWrapCodeEnabled(true);
    expect(editor().contentDOM.classList.contains('cm-lineWrapping')).toBe(true);
  });

  it('changes editors that are already open, and stops following when one is destroyed', () => {
    const open = editor();
    const gone = editor();
    gone.destroy();
    setWrapCodeEnabled(true);
    expect(open.contentDOM.classList.contains('cm-lineWrapping')).toBe(true);
    setWrapCodeEnabled(false);
    expect(open.contentDOM.classList.contains('cm-lineWrapping')).toBe(false);
  });

  it('notifies subscribers when the setting changes until unsubscribed', () => {
    const seen: boolean[] = [];
    const off = subscribeWrapCode(on => seen.push(on));
    setWrapCodeEnabled(true);
    setWrapCodeEnabled(false);
    off();
    setWrapCodeEnabled(true);
    expect(seen).toEqual([true, false]);
  });

  it('keeps the switch for this page when local storage throws', () => {
    const real = Storage.prototype.getItem;
    Storage.prototype.getItem = () => {
      throw new Error('blocked');
    };
    const set = Storage.prototype.setItem;
    Storage.prototype.setItem = () => {
      throw new Error('blocked');
    };
    try {
      expect(wrapCodeEnabled()).toBe(false);
      setWrapCodeEnabled(true);
      expect(wrapCodeEnabled()).toBe(true);
    } finally {
      Storage.prototype.getItem = real;
      Storage.prototype.setItem = set;
    }
  });
});
