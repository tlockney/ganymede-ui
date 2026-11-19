import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ISessionContext } from '@jupyterlab/apputils';
import { Signal } from '@lumino/signaling';
import { fakeLanguageKernel } from '../test/language-kernel';
import { attachKernelComm, type KernelComm } from './kernel-comm';

const TARGET = 'test.target';

/** A kernel with subshells whose every comm's subshell starts only when the test says. */
function slowSubshellKernel() {
  const k = fakeLanguageKernel(TARGET, { subshells: true });
  const make = k.kernel.createComm.bind(k.kernel);
  const gates: (() => void)[] = [];
  k.kernel.createComm = (name: string) => {
    const comm = make(name);
    (comm as { subshellStarted?: Promise<void> }).subshellStarted = new Promise<void>(res =>
      gates.push(res),
    );
    return comm;
  };
  return { ...k, gates };
}

let link: KernelComm | undefined;
const settle = () => vi.advanceTimersByTimeAsync(0);

function attach(k: ReturnType<typeof slowSubshellKernel>) {
  const owner = {};
  const session = {
    session: { kernel: k.kernel },
    kernelChanged: new Signal(owner),
    sessionChanged: new Signal(owner),
  } as unknown as ISessionContext;
  link = attachKernelComm(session, { target: TARGET, onMessage: () => {} });
  return link;
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
});
afterEach(() => {
  link?.dispose();
  link = undefined;
  vi.useRealTimers();
});

describe('a request before the comm’s open has gone', () => {
  it('is refused while the subshell starts, and goes once the open has', async () => {
    const k = slowSubshellKernel();
    const l = attach(k);
    await settle();
    expect(k.comms).toHaveLength(1);
    expect(l.isOpen).toBe(false);
    expect(l.send({ op: 'early' })).toBe(false);
    expect(k.comms[0]!.sent).toEqual([]);
    k.gates[0]!();
    await settle();
    expect(k.comms[0]!.opened).toBe(true);
    expect(l.send({ op: 'now' })).toBe(true);
    expect(k.comms[0]!.sent).toEqual([{ op: 'now' }]);
  });

  it('is refused after a restart too, while the new comm’s subshell starts', async () => {
    const k = slowSubshellKernel();
    const l = attach(k);
    await settle();
    k.gates[0]!();
    await settle();
    expect(l.isOpen).toBe(true);
    k.setStatus('restarting');
    expect(l.isOpen).toBe(false);
    k.setStatus('idle');
    await settle();
    // The new comm exists, its subshell not started: the old open doesn't count.
    expect(k.comms).toHaveLength(2);
    expect(l.isOpen).toBe(false);
    expect(l.send({ op: 'early' })).toBe(false);
    expect(k.comms[1]!.sent).toEqual([]);
    k.gates[1]!();
    await settle();
    expect(l.isOpen).toBe(true);
    expect(l.send({ op: 'now' })).toBe(true);
    expect(k.comms[1]!.sent).toEqual([{ op: 'now' }]);
  });
});
