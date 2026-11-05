import { act, renderHook, waitFor } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { debugKernel } from '../test/debug-kernel';
import { useVariables } from './useVariables';

const kernelWith = (name: string) =>
  debugKernel({
    inspectVariables: { variables: [{ name, value: '1', type: 'number', variablesReference: 0 }] },
  });

describe('useVariables', () => {
  it('doesn’t show the old kernel’s rows when shown again after a kernel change', async () => {
    const first = kernelWith('a');
    const { result, rerender } = renderHook(
      ({ kernel, active }) => useVariables(kernel, 'idle', active),
      { initialProps: { kernel: first, active: true } },
    );
    await waitFor(() =>
      expect(result.current.state).toMatchObject({ kind: 'ready', variables: [{ name: 'a' }] }),
    );
    // Hidden, then another notebook's kernel.
    rerender({ kernel: first, active: false });
    const second = kernelWith('b');
    rerender({ kernel: second, active: false });
    expect(second.requestDebug).not.toHaveBeenCalled();
    act(() => rerender({ kernel: second, active: true }));
    expect(result.current.state).toEqual({ kind: 'loading' });
    await waitFor(() =>
      expect(result.current.state).toMatchObject({ kind: 'ready', variables: [{ name: 'b' }] }),
    );
  });
});
