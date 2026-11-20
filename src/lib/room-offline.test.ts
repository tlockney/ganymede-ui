import { describe, expect, it, vi } from 'vitest';
import { watchOffline } from './room-offline';

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
  const cells = [{ readOnly: false }, { readOnly: false }];
  const node = document.createElement('div');
  const notebook = { widgets: cells, node } as unknown as Parameters<typeof watchOffline>[1];
  const model = { readOnly: false };
  const onOffline = vi.fn();
  const stop = watchOffline(room, notebook, model, onOffline);
  const set = (c: boolean) => {
    state.connected = c;
    listeners.forEach(l => l(c));
  };
  const press = (key: string, init: KeyboardEventInit = {}) => {
    const e = new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true, ...init });
    node.dispatchEvent(e);
    return e.defaultPrevented;
  };
  return { cells, model, onOffline, set, press, stop, listeners };
}

describe('watchOffline', () => {
  it('leaves a connected notebook editable', () => {
    const { cells, model, onOffline, press } = setup(true);
    expect(onOffline).toHaveBeenLastCalledWith(false);
    expect(model.readOnly).toBe(false);
    expect(cells.every(c => !c.readOnly)).toBe(true);
    expect(press('a')).toBe(false);
  });

  it('makes the notebook read-only while the room is away, and editable when it is back', () => {
    const { cells, model, onOffline, set, press } = setup(true);
    set(false);
    expect(onOffline).toHaveBeenLastCalledWith(true);
    expect(model.readOnly).toBe(true);
    expect(cells.every(c => c.readOnly)).toBe(true);
    // Command-mode edits are blocked; reading and browser shortcuts are not.
    expect(press('d')).toBe(true);
    expect(press('Enter')).toBe(true);
    expect(press('ArrowDown')).toBe(false);
    expect(press('c', { metaKey: true })).toBe(false);
    set(true);
    expect(onOffline).toHaveBeenLastCalledWith(false);
    expect(model.readOnly).toBe(false);
    expect(cells.every(c => !c.readOnly)).toBe(true);
    expect(press('d')).toBe(false);
  });

  it('starts read-only for a room that is already down', () => {
    const { model, onOffline } = setup(false);
    expect(onOffline).toHaveBeenLastCalledWith(true);
    expect(model.readOnly).toBe(true);
  });

  it('stops listening', () => {
    const { listeners, stop, set, press } = setup(true);
    stop();
    expect(listeners.size).toBe(0);
    set(false);
    expect(press('d')).toBe(false);
  });
});
