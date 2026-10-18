import { useEffect, useReducer } from 'react';
import type { ISignal } from '@lumino/signaling';

/** Re-render whenever any of the signals fires. */
export function useSignals(...signals: (ISignal<unknown, unknown> | undefined)[]) {
  const [, bump] = useReducer((n: number) => n + 1, 0);
  useEffect(() => {
    const live = signals.filter(Boolean) as ISignal<unknown, unknown>[];
    live.forEach(s => s.connect(bump));
    return () => live.forEach(s => s.disconnect(bump));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, signals);
}
