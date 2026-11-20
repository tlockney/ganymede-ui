import { describe, expect, it, vi } from 'vitest';
import { isEditKey, watchOffline } from './room-offline';

const cell = (readOnly: boolean) => ({
  readOnly,
  syncEditable: true,
  syncCollapse: true,
  loadEditableState() {},
  loadCollapseState() {},
});

function setup(connected = true) {
  const state = { connected };
  const listeners = new Set<(c: boolean) => void>();
  const room = {
    get connected() {
      return state.connected;
    },
    onConnection(l: (c: boolean) => void) {
      listeners.add(l);
      return () => void listeners.delete(l);
    },
  };
  const cells = [cell(false), cell(true)];
  const notebook = { widgets: cells } as unknown as Parameters<typeof watchOffline>[1];
  const model = { readOnly: false };
  const onOffline = vi.fn();
  const stop = watchOffline(room, notebook, model, onOffline);
  const set = (c: boolean) => {
    state.connected = c;
    listeners.forEach(l => l(c));
  };
  return { cells, model, onOffline, set, stop, listeners };
}

describe('watchOffline', () => {
  it('leaves a connected notebook as it is', () => {
    const { cells, model, onOffline } = setup(true);
    expect(onOffline).toHaveBeenLastCalledWith(false);
    expect(model.readOnly).toBe(false);
    expect(cells.map(c => c.readOnly)).toEqual([false, true]);
  });

  it('makes the notebook read-only without syncing, and syncs again when it is back', () => {
    const { cells, model, onOffline, set } = setup(true);
    set(false);
    expect(onOffline).toHaveBeenLastCalledWith(true);
    expect(model.readOnly).toBe(true);
    expect(cells.every(c => c.readOnly && !c.syncEditable)).toBe(true);
    set(true);
    expect(onOffline).toHaveBeenLastCalledWith(false);
    expect(model.readOnly).toBe(false);
    expect(cells.every(c => c.syncEditable)).toBe(true);
  });

  it('starts read-only for a room that is already down', () => {
    const { model, onOffline } = setup(false);
    expect(onOffline).toHaveBeenLastCalledWith(true);
    expect(model.readOnly).toBe(true);
  });

  it('stops listening', () => {
    const { listeners, stop } = setup(true);
    stop();
    expect(listeners.size).toBe(0);
  });
});

describe('isEditKey', () => {
  const key = (k: string, init: object = {}) =>
    isEditKey({ key: k, metaKey: false, ctrlKey: false, altKey: false, ...init });
  it('treats command-mode edits as edits, and moving and browser shortcuts as not', () => {
    for (const k of ['a', 'b', 'd', 'x', 'v', 'm', 'y', 'Enter', 'Backspace'])
      expect(key(k)).toBe(true);
    for (const k of ['ArrowDown', 'PageUp', 'Home', 'Escape', 'Tab']) expect(key(k)).toBe(false);
    expect(key('c', { metaKey: true })).toBe(false);
    expect(key('f', { ctrlKey: true })).toBe(false);
  });
});
