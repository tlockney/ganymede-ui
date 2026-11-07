import { describe, expect, it, vi } from 'vitest';
import type { ISessionContext } from '@jupyterlab/apputils';
import { Signal } from '@lumino/signaling';
import { askMessage, attachDevice, type DevicePromptState, promptClick } from './device-remote';

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

  it('outside the app, answers with the browser fallback', () => {
    const { session, setKernel } = fakeSession();
    const answer = vi.fn((_kernel: unknown, _forward?: unknown) => ({
      dispose: vi.fn(),
      pending: 0,
    }));
    attachDevice(session, { available: () => false, answer });
    setKernel({ id: 1 });
    expect(answer).toHaveBeenCalledOnce();
    expect(typeof answer.mock.calls[0][1]).toBe('function');
    const inApp = vi.fn((_kernel: unknown, _forward?: unknown) => ({
      dispose: vi.fn(),
      pending: 0,
    }));
    attachDevice(session, { available: () => true, answer: inApp });
    expect(inApp.mock.calls[0][1]).toBeUndefined();
  });
});

describe('promptClick', () => {
  it('names what asks, read when the prompt shows', () => {
    let shown: DevicePromptState | undefined;
    let name = 'Io.ipynb (Python 3)';
    const click = promptClick(
      update => {
        shown = update(shown);
      },
      () => name,
    );
    const signal = new AbortController().signal;
    void click(
      { method: 'clipboard.writeText', label: 'Copy to clipboard', signal },
      async () => null,
    ).catch(() => {});
    expect(shown?.asker).toBe('Io.ipynb (Python 3)');
    shown!.dismiss();
    name = 'Europa.ipynb (Python 3)';
    void click(
      { method: 'clipboard.writeText', label: 'Copy to clipboard', signal },
      async () => null,
    ).catch(() => {});
    expect(shown?.asker).toBe('Europa.ipynb (Python 3)');
    expect(askMessage(shown?.asker)).toBe(
      'A cell in Europa.ipynb (Python 3) asks to use this device.',
    );
    expect(askMessage()).toBe('A cell asks to use this device.');
  });

  it('shows a prompt, runs the call on accept, and takes it down', async () => {
    let shown: DevicePromptState | undefined;
    const show = (update: (c: DevicePromptState | undefined) => DevicePromptState | undefined) => {
      shown = update(shown);
    };
    const click = promptClick(show);
    const run = vi.fn(async () => 'pasted');
    const signal = new AbortController().signal;
    const pending = click(
      { method: 'clipboard.readText', label: 'Paste from clipboard', signal },
      run,
    );
    expect(shown?.label).toBe('Paste from clipboard');
    expect(shown?.asker).toBeUndefined();
    expect(run).not.toHaveBeenCalled();
    shown!.accept();
    expect(run).toHaveBeenCalledOnce();
    expect(shown).toBeUndefined();
    await expect(pending).resolves.toBe('pasted');
  });

  it('rejects on dismiss and on a cancel, taking the prompt down', async () => {
    let shown: DevicePromptState | undefined;
    const click = promptClick(update => (shown = update(shown)));
    const dismissed = click(
      { method: 'share', label: 'Share', signal: new AbortController().signal },
      vi.fn(),
    );
    shown!.dismiss();
    await expect(dismissed).rejects.toThrow('dismissed');
    expect(shown).toBeUndefined();

    const controller = new AbortController();
    const cancelled = click(
      { method: 'share', label: 'Share', signal: controller.signal },
      vi.fn(),
    );
    expect(shown?.label).toBe('Share');
    controller.abort();
    await expect(cancelled).rejects.toThrow();
    expect(shown).toBeUndefined();
  });
});
