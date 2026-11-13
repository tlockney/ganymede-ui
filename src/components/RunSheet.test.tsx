import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { RunSheet } from './RunSheet';
import type { RunAnswer } from '../lib/run';

const box = () => screen.getByRole('textbox', { name: /Parameters/ });

describe('RunSheet', () => {
  it('runs with the parameters typed and shows the named results', async () => {
    const run = vi.fn(async (): Promise<RunAnswer> => ({
      status: 'ok',
      results: { total: 3, rows: [{ day: 'mon' }] },
      copy: 'runs/Io/2026.ipynb',
    }));
    render(<RunSheet name="Io.ipynb" initialParams="{}" run={run} onClose={vi.fn()} />);
    expect(screen.getByRole('dialog', { name: 'Run Io.ipynb with Parameters' })).toBeVisible();
    await userEvent.clear(box());
    await userEvent.type(box(), '{{"day": "mon"}');
    await userEvent.click(screen.getByRole('checkbox', { name: /Save the executed notebook/ }));
    await userEvent.click(screen.getByRole('button', { name: 'Run' }));
    expect(run).toHaveBeenCalledWith(
      { day: 'mon' },
      expect.objectContaining({ save: true, signal: expect.any(AbortSignal) }),
    );
    expect(await screen.findByText('The run finished.')).toBeVisible();
    const results = document.querySelector('.run-results') as HTMLElement;
    expect(within(results).getByText('total')).toBeVisible();
    expect(within(results).getByText(/"day": "mon"/)).toBeVisible();
    expect(screen.getByText('runs/Io/2026.ipynb')).toBeVisible();
    expect(screen.getByRole('button', { name: 'Run Again' })).toBeEnabled();
  });

  it('refuses parameters that aren’t a JSON object, without running', async () => {
    const run = vi.fn();
    render(<RunSheet name="Io.ipynb" initialParams="[1, 2]" run={run} onClose={vi.fn()} />);
    await userEvent.click(screen.getByRole('button', { name: 'Run' }));
    expect(screen.getByText(/must be a JSON object/)).toBeVisible();
    expect(run).not.toHaveBeenCalled();
  });

  it('shows a failed run and a refused one', async () => {
    const run = vi
      .fn<() => Promise<RunAnswer>>()
      .mockResolvedValueOnce({ status: 'error', results: {}, error: 'NameError: x' })
      .mockRejectedValueOnce(new Error('It needs Ganymede.'));
    render(<RunSheet name="Io.ipynb" initialParams="{}" run={run} onClose={vi.fn()} />);
    await userEvent.click(screen.getByRole('button', { name: 'Run' }));
    expect(await screen.findByText('The run failed: NameError: x')).toBeVisible();
    expect(screen.getByText('No named results.')).toBeVisible();
    await userEvent.click(screen.getByRole('button', { name: 'Run Again' }));
    expect(await screen.findByText('Not run: It needs Ganymede.')).toBeVisible();
  });

  it('stops the run when cancelled', async () => {
    let signal: AbortSignal | undefined;
    const run = vi.fn(
      (_p: unknown, opts: { signal: AbortSignal }) =>
        new Promise<RunAnswer>((_resolve, reject) => {
          signal = opts.signal;
          opts.signal.addEventListener('abort', () => reject(new Error('aborted')));
        }),
    );
    const onClose = vi.fn();
    render(<RunSheet name="Io.ipynb" initialParams="{}" run={run} onClose={onClose} />);
    await userEvent.click(screen.getByRole('button', { name: 'Run' }));
    expect(screen.getByRole('status')).toHaveTextContent('Running…');
    await userEvent.click(screen.getByRole('button', { name: 'Stop' }));
    expect(signal?.aborted).toBe(true);
    await waitFor(() => expect(onClose).toHaveBeenCalled());
  });
});
