import { act, renderHook } from '@testing-library/react';
import { Signal } from '@lumino/signaling';
import { describe, expect, it } from 'vitest';
import { useSignals } from './useSignal';

describe('useSignals', () => {
  it('re-renders when any signal fires, and disconnects on unmount', () => {
    const owner = {};
    const a = new Signal<object, void>(owner);
    const b = new Signal<object, number>(owner);
    let renders = 0;
    const { unmount } = renderHook(() => {
      renders++;
      useSignals(a, undefined, b);
    });
    const start = renders;

    act(() => a.emit());
    expect(renders).toBe(start + 1);
    act(() => b.emit(1));
    expect(renders).toBe(start + 2);

    unmount();
    // Nothing is left connected to the signals' owner.
    act(() => {
      a.emit();
      b.emit(2);
    });
    expect(renders).toBe(start + 2);
  });

  it('moves to new signals when they change', () => {
    const owner = {};
    const first = new Signal<object, void>(owner);
    const second = new Signal<object, void>(owner);
    let renders = 0;
    const { rerender } = renderHook(
      ({ s }: { s?: Signal<object, void> }) => {
        renders++;
        useSignals(s);
      },
      { initialProps: { s: first as Signal<object, void> | undefined } },
    );
    rerender({ s: second });
    const start = renders;

    act(() => first.emit());
    expect(renders).toBe(start);
    act(() => second.emit());
    expect(renders).toBe(start + 1);

    rerender({ s: undefined });
    const after = renders;
    act(() => second.emit());
    expect(renders).toBe(after);
  });
});
