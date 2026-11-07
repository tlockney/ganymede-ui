import { describe, expect, it, vi } from 'vitest';
import type { ISessionContext } from '@jupyterlab/apputils';
import { Signal } from '@lumino/signaling';
import { attachDevice } from './device-remote';

// The wiring only: one answerer per kernel the session has, none outside
// the app. ganymede-device tests answerDevice itself.
function fakeSession() {
  const holder = { session: null as { kernel: unknown } | null };
  const kernelChanged = new Signal<unknown, unknown>(holder);
  const session = {
    get session() {
      return holder.session;
    },
    kernelChanged,
  } as unknown as ISessionContext;
  const setKernel = (kernel: unknown) => {
    holder.session = { kernel };
    kernelChanged.emit(null);
  };
  return { session, setKernel };
}

describe('attachDevice', () => {
  it('answers each kernel the session gets, disposing the last', () => {
    const { session, setKernel } = fakeSession();
    const answered: { kernel: unknown; dispose: ReturnType<typeof vi.fn> }[] = [];
    const answer = (kernel: unknown) => {
      const a = { kernel, dispose: vi.fn(), pending: 0 };
      answered.push(a);
      return a;
    };
    const attached = attachDevice(session, { available: () => true, answer });
    expect(answered).toHaveLength(0);
    const k1 = { id: 1 };
    setKernel(k1);
    setKernel(k1);
    expect(answered.map(a => a.kernel)).toEqual([k1]);
    const k2 = { id: 2 };
    setKernel(k2);
    expect(answered[0].dispose).toHaveBeenCalledOnce();
    expect(answered.map(a => a.kernel)).toEqual([k1, k2]);
    attached.dispose();
    expect(answered[1].dispose).toHaveBeenCalledOnce();
    setKernel({ id: 3 });
    expect(answered).toHaveLength(2);
  });

  it('answers nothing outside the app', () => {
    const { session, setKernel } = fakeSession();
    const answer = vi.fn();
    attachDevice(session, { available: () => false, answer });
    setKernel({ id: 1 });
    expect(answer).not.toHaveBeenCalled();
  });
});
