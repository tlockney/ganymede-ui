import { YNotebook } from '@jupyter/ydoc';
import type { Contents } from '@jupyterlab/services';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  READONLY_POLL_MS,
  WRITABLE_POLL_MS,
  roomStateReadOnly,
  watchWritable,
} from './room-readonly';

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

function contentsWith(writable: () => boolean | undefined) {
  return {
    get: vi.fn(async () => ({ writable: writable() }) as unknown as Contents.IModel),
  };
}

describe('roomStateReadOnly', () => {
  it('reads explicit read_only, readonly, and writable state keys', () => {
    const nb = new YNotebook();
    expect(roomStateReadOnly(nb)).toBeUndefined();

    nb.setState('read_only', true);
    expect(roomStateReadOnly(nb)).toBe(true);
    nb.setState('read_only', false);
    expect(roomStateReadOnly(nb)).toBe(false);

    const alt = new YNotebook();
    alt.setState('readonly', true);
    expect(roomStateReadOnly(alt)).toBe(true);

    const w = new YNotebook();
    w.setState('writable', false);
    expect(roomStateReadOnly(w)).toBe(true);
    w.setState('writable', true);
    expect(roomStateReadOnly(w)).toBe(false);
  });

  it('recognizes a room save failure naming another server', () => {
    const nb = new YNotebook();
    nb.setState('save', 'failed');
    nb.setState('save_error', 'the file kept changing');
    expect(roomStateReadOnly(nb)).toBeUndefined();

    nb.setState('save_error', 'another server owns the file');
    expect(roomStateReadOnly(nb)).toBe(true);

    nb.setState('save', 'saved');
    expect(roomStateReadOnly(nb)).toBeUndefined();
  });
});

describe('watchWritable (#839)', () => {
  it('polls a read-only notebook and unlocks once writable returns true', async () => {
    vi.useFakeTimers();
    let writable = false;
    const contents = contentsWith(() => writable);
    const onChange = vi.fn();
    const watcher = watchWritable({
      contents,
      path: () => 'moons/Io.ipynb',
      initial: true,
      pollWhileWritable: false,
      onChange,
    });

    await vi.advanceTimersByTimeAsync(READONLY_POLL_MS);
    expect(contents.get).toHaveBeenCalledWith('moons/Io.ipynb', { content: false });
    expect(onChange).not.toHaveBeenCalled();

    writable = true;
    await vi.advanceTimersByTimeAsync(READONLY_POLL_MS);
    expect(onChange).toHaveBeenCalledWith(false);

    // Non-room notebook stops polling once writable again.
    const calls = contents.get.mock.calls.length;
    await vi.advanceTimersByTimeAsync(WRITABLE_POLL_MS * 3);
    expect(contents.get).toHaveBeenCalledTimes(calls);

    watcher.dispose();
  });

  it('detects a writable room turning read-only and becoming writable again', async () => {
    vi.useFakeTimers();
    let writable = true;
    const contents = contentsWith(() => writable);
    const onChange = vi.fn();
    const watcher = watchWritable({
      contents,
      path: () => 'moons/Io.ipynb',
      initial: false,
      pollWhileWritable: true,
      onChange,
    });

    writable = false;
    await vi.advanceTimersByTimeAsync(WRITABLE_POLL_MS);
    expect(onChange).toHaveBeenLastCalledWith(true);

    // Now polls quickly until the other server releases the lock.
    writable = true;
    await vi.advanceTimersByTimeAsync(READONLY_POLL_MS);
    expect(onChange).toHaveBeenLastCalledWith(false);

    watcher.dispose();
  });

  it('reacts immediately to room state transitions and path/hash updates', async () => {
    const nb = new YNotebook();
    let writable = true;
    const contents = contentsWith(() => writable);
    const onChange = vi.fn();
    const watcher = watchWritable({
      contents,
      path: () => 'moons/Io.ipynb',
      sharedModel: nb,
      initial: false,
      pollWhileWritable: true,
      onChange,
    });

    // Explicit room state flips read-only without waiting for a poll.
    nb.setState('read_only', true);
    expect(onChange).toHaveBeenLastCalledWith(true);

    nb.setState('read_only', false);
    expect(onChange).toHaveBeenLastCalledWith(false);

    // Save error naming another server flips read-only immediately regardless of key order.
    nb.setState('save', 'failed');
    nb.setState('save_error', 'another server owns the file');
    expect(onChange).toHaveBeenLastCalledWith(true);

    // A hash update from another server's save triggers a contents check.
    writable = true;
    nb.setState('hash', 'abc123');
    await vi.waitFor(() => expect(onChange).toHaveBeenLastCalledWith(false));

    // Also when save_error arrives before save: 'failed'.
    writable = false;
    nb.setState('save', 'saved');
    nb.setState('save_error', 'another server owns the file');
    nb.setState('save', 'failed');
    expect(onChange).toHaveBeenLastCalledWith(true);

    watcher.dispose();
  });

  it('checks on focus and skips while paused or hidden, and stops on dispose', async () => {
    vi.useFakeTimers();
    let writable = false;
    let paused = true;
    const contents = contentsWith(() => writable);
    const onChange = vi.fn();
    const watcher = watchWritable({
      contents,
      path: () => 'moons/Io.ipynb',
      initial: true,
      paused: () => paused,
      pollWhileWritable: true,
      onChange,
    });

    await vi.advanceTimersByTimeAsync(READONLY_POLL_MS * 2);
    expect(contents.get).not.toHaveBeenCalled();

    paused = false;
    writable = true;
    window.dispatchEvent(new Event('focus'));
    await vi.waitFor(() => expect(onChange).toHaveBeenCalledWith(false));

    watcher.dispose();
    const calls = contents.get.mock.calls.length;
    window.dispatchEvent(new Event('focus'));
    await vi.advanceTimersByTimeAsync(WRITABLE_POLL_MS * 2);
    expect(contents.get).toHaveBeenCalledTimes(calls);
  });
});
