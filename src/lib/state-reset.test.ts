import { describe, expect, it } from 'vitest';
import { interruptResetState } from './state-reset';

/** A message as `@jupyterlab/services` hands it to `anyMessage`. */
const msg = (msg_type: string, metadata?: unknown) => ({ header: { msg_type }, metadata });
/** The metadata cdp-kernel puts on its stderr note (cdp-kernel#538). */
const reset = (reason: unknown, ...flag: unknown[]) => ({
  cdp_kernel: { state_reset: flag.length ? flag[0] : true, reason, runtime: 'browser' },
});

describe('interruptResetState (#796)', () => {
  it('is true for the stderr note of a runtime an interrupt ended', () => {
    expect(interruptResetState(msg('stream', reset('interrupt')))).toBe(true);
  });

  it('is false for a runtime that ended for another reason', () => {
    expect(interruptResetState(msg('stream', reset('exit')))).toBe(false);
    expect(interruptResetState(msg('stream', reset(undefined)))).toBe(false);
  });

  it('is false without the metadata: an older cdp-kernel, an interrupt answered in place, another kernel', () => {
    expect(interruptResetState(msg('stream'))).toBe(false);
    expect(interruptResetState(msg('stream', {}))).toBe(false);
    expect(interruptResetState(msg('stream', null))).toBe(false);
    expect(interruptResetState(msg('stream', 'cdp_kernel'))).toBe(false);
    expect(interruptResetState(msg('stream', { cdp_kernel: null }))).toBe(false);
    expect(interruptResetState(msg('stream', { cdp_kernel: true }))).toBe(false);
  });

  it('is false unless state_reset is true itself', () => {
    expect(interruptResetState(msg('stream', reset('interrupt', 'true')))).toBe(false);
    expect(interruptResetState(msg('stream', reset('interrupt', false)))).toBe(false);
    expect(interruptResetState(msg('stream', reset('interrupt', undefined)))).toBe(false);
  });

  it('is false for the same metadata on a message that isn’t a stream', () => {
    expect(interruptResetState(msg('execute_reply', reset('interrupt')))).toBe(false);
    expect(interruptResetState(msg('error', reset('interrupt')))).toBe(false);
  });
});
