import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type * as nbformat from '@jupyterlab/nbformat';
import { ServerConnection } from '@jupyterlab/services';
import { describe, expect, it, vi } from 'vitest';
import { RecoveryBanner } from './RecoveryBanner';
import { RecoverySheet } from './RecoverySheet';
import { describeSaveAttention } from '../lib/room-recovery';

function makeSettings(fetch: typeof globalThis.fetch): ServerConnection.ISettings {
  return ServerConnection.makeSettings({
    baseUrl: 'http://127.0.0.1:8888/',
    token: 'tok',
    fetch,
  });
}

function makeNotebook(
  cells: Array<{ id: string; cell_type: 'code' | 'markdown'; source: string }>,
): nbformat.INotebookContent {
  return {
    nbformat: 4,
    nbformat_minor: 5,
    metadata: {},
    cells: cells.map(c => ({
      id: c.id,
      cell_type: c.cell_type,
      source: c.source,
      metadata: {},
      ...(c.cell_type === 'code' ? { execution_count: null, outputs: [] } : {}),
    })),
  };
}

describe('RecoveryBanner (#831)', () => {
  it('renders headline, detail, and actions', async () => {
    const user = userEvent.setup();
    const onReview = vi.fn();
    const onRetrySave = vi.fn();
    const onDownload = vi.fn();
    const attention = describeSaveAttention({
      saveState: {
        save: 'failed',
        saveError: 'Disk is full',
        recovery: {
          id: 'r1',
          at: '2026-11-28T10:00:00Z',
          reason: 'save_failed',
          cells: [],
        },
      },
    })!;

    render(
      <RecoveryBanner
        attention={attention}
        canRetrySave={true}
        canReview={true}
        onReview={onReview}
        onRetrySave={onRetrySave}
        onDownload={onDownload}
      />,
    );

    expect(screen.getByText('Save needs attention')).toBeVisible();
    expect(screen.getByText('Disk is full')).toBeVisible();

    await user.click(screen.getByRole('button', { name: 'Review Copy…' }));
    await user.click(screen.getByRole('button', { name: 'Retry Save' }));
    await user.click(screen.getByRole('button', { name: 'Download Copy' }));

    expect(onReview).toHaveBeenCalledTimes(1);
    expect(onRetrySave).toHaveBeenCalledTimes(1);
    expect(onDownload).toHaveBeenCalledTimes(1);
  });
});

describe('RecoverySheet (#831)', () => {
  it('renders merge conflict cell names and cell diffs, then restores via Contents API before deleting copy', async () => {
    const user = userEvent.setup();
    const current = makeNotebook([
      { id: 'c1', cell_type: 'code', source: 'x = 1' },
      { id: 'c2', cell_type: 'code', source: 'y = "disk"' },
    ]);
    const copyContent = makeNotebook([
      { id: 'c1', cell_type: 'code', source: 'x = 1' },
      { id: 'c2', cell_type: 'code', source: 'y = "recovery"' },
    ]);

    const calls: string[] = [];
    const fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const req = input instanceof Request ? input : new Request(input, init);
      const u = new URL(req.url);
      calls.push(`${req.method} ${u.pathname}${u.search}`);
      if (req.method === 'GET' && u.pathname.endsWith('/api/collaboration/recovery')) {
        return new Response(
          JSON.stringify({
            copies: [
              {
                id: 'rec-mc',
                path: 'work.ipynb',
                at: '2026-11-28T10:00:00Z',
                reason: 'merge_conflict',
                detail: 'cell c2',
                cells: ['c2'],
              },
            ],
          }),
          { status: 200 },
        );
      }
      if (req.method === 'GET' && u.pathname.endsWith('/api/collaboration/recovery/rec-mc')) {
        return new Response(
          JSON.stringify({
            id: 'rec-mc',
            path: 'work.ipynb',
            at: '2026-11-28T10:00:00Z',
            reason: 'merge_conflict',
            detail: 'cell c2',
            cells: ['c2'],
            content: copyContent,
          }),
          { status: 200 },
        );
      }
      if (req.method === 'DELETE' && u.pathname.endsWith('/api/collaboration/recovery/rec-mc')) {
        return new Response(null, { status: 204 });
      }
      return new Response('Unexpected', { status: 500 });
    });

    const saveOrder: string[] = [];
    const contentsSave = vi.fn(async () => {
      saveOrder.push('save');
      return {} as never;
    });
    const onCopiesChanged = vi.fn();
    const onRestored = vi.fn();
    const onClose = vi.fn();

    render(
      <RecoverySheet
        path="work.ipynb"
        name="work.ipynb"
        settings={makeSettings(fetch)}
        contents={{ save: contentsSave }}
        currentNotebook={current}
        onCopiesChanged={onCopiesChanged}
        onRestored={onRestored}
        onClose={onClose}
      />,
    );

    await screen.findByText('Conflicting cells:');
    expect(screen.getAllByText('c2').length).toBeGreaterThan(0);
    expect(screen.getByText(/y = "recovery"/)).toBeVisible();
    expect(screen.getByText(/y = "disk"/)).toBeVisible();

    await user.click(screen.getByRole('button', { name: 'Restore Copy' }));

    await waitFor(() => expect(onRestored).toHaveBeenCalledTimes(1));
    expect(contentsSave).toHaveBeenCalledWith('work.ipynb', {
      type: 'notebook',
      format: 'json',
      content: copyContent,
    });
    expect(
      calls.some(c => c.startsWith('DELETE ') && c.includes('/api/collaboration/recovery/rec-mc')),
    ).toBe(true);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('keeps the recovery copy and surfaces an error if Contents save fails during restore', async () => {
    const user = userEvent.setup();
    const copyContent = makeNotebook([{ id: 'c1', cell_type: 'code', source: '1 + 1' }]);
    const deletes: string[] = [];
    const fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const req = input instanceof Request ? input : new Request(input, init);
      const u = new URL(req.url);
      if (req.method === 'DELETE') deletes.push(u.pathname);
      if (u.pathname.endsWith('/api/collaboration/recovery')) {
        return new Response(
          JSON.stringify({
            copies: [
              {
                id: 'rec-fail',
                path: 'work.ipynb',
                at: '2026-11-28T10:00:00Z',
                reason: 'read_only',
                cells: [],
              },
            ],
          }),
          { status: 200 },
        );
      }
      return new Response(
        JSON.stringify({
          id: 'rec-fail',
          path: 'work.ipynb',
          at: '2026-11-28T10:00:00Z',
          reason: 'read_only',
          cells: [],
          content: copyContent,
        }),
        { status: 200 },
      );
    });

    const contentsSave = vi.fn(async () => {
      throw new Error('Disk write rejected');
    });
    const onRestored = vi.fn();
    const onClose = vi.fn();

    render(
      <RecoverySheet
        path="work.ipynb"
        name="work.ipynb"
        settings={makeSettings(fetch)}
        contents={{ save: contentsSave }}
        onCopiesChanged={() => {}}
        onRestored={onRestored}
        onClose={onClose}
      />,
    );

    await screen.findByRole('button', { name: 'Restore Copy' });
    await user.click(screen.getByRole('button', { name: 'Restore Copy' }));

    await screen.findByText('Disk write rejected');
    expect(deletes).toHaveLength(0);
    expect(onRestored).not.toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled();
  });

  it('re-reads the list when GET /{id} answers 404 and switches to any remaining copy', async () => {
    let listReads = 0;
    const olderContent = makeNotebook([{ id: 'c1', cell_type: 'code', source: 'older()' }]);
    const fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const req = input instanceof Request ? input : new Request(input, init);
      const u = new URL(req.url);
      if (req.method === 'GET' && u.pathname.endsWith('/api/collaboration/recovery')) {
        listReads++;
        if (listReads === 1) {
          return new Response(
            JSON.stringify({
              copies: [
                {
                  id: 'rec-stale',
                  path: 'work.ipynb',
                  at: '2026-11-28T11:00:00Z',
                  reason: 'save_failed',
                  cells: [],
                },
              ],
            }),
            { status: 200 },
          );
        }
        return new Response(
          JSON.stringify({
            copies: [
              {
                id: 'rec-older',
                path: 'work.ipynb',
                at: '2026-11-28T10:00:00Z',
                reason: 'save_failed',
                cells: [],
              },
            ],
          }),
          { status: 200 },
        );
      }
      if (u.pathname.endsWith('/rec-stale')) {
        return new Response(JSON.stringify({ message: 'Not found' }), { status: 404 });
      }
      return new Response(
        JSON.stringify({
          id: 'rec-older',
          path: 'work.ipynb',
          at: '2026-11-28T10:00:00Z',
          reason: 'save_failed',
          cells: [],
          content: olderContent,
        }),
        { status: 200 },
      );
    });

    const onCopiesChanged = vi.fn();
    render(
      <RecoverySheet
        path="work.ipynb"
        name="work.ipynb"
        settings={makeSettings(fetch)}
        contents={{ save: vi.fn() }}
        onCopiesChanged={onCopiesChanged}
        onRestored={() => {}}
        onClose={() => {}}
      />,
    );

    await screen.findByText(/already removed on the server/i);
    await screen.findByText(/older\(\)/);
    expect(listReads).toBe(2);
    expect(onCopiesChanged).toHaveBeenLastCalledWith([
      expect.objectContaining({ id: 'rec-older' }),
    ]);
  });

  it('discards a copy via DELETE and closes when no copies remain', async () => {
    const user = userEvent.setup();
    let deleted = false;
    const copyContent = makeNotebook([{ id: 'c1', cell_type: 'code', source: 'x = 42' }]);
    const fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const req = input instanceof Request ? input : new Request(input, init);
      const u = new URL(req.url);
      if (req.method === 'DELETE' && u.pathname.endsWith('/rec-del')) {
        deleted = true;
        return new Response(null, { status: 204 });
      }
      if (u.pathname.endsWith('/api/collaboration/recovery')) {
        return new Response(
          JSON.stringify({
            copies: deleted
              ? []
              : [
                  {
                    id: 'rec-del',
                    path: 'work.ipynb',
                    at: '2026-11-28T10:00:00Z',
                    reason: 'save_failed',
                    cells: [],
                  },
                ],
          }),
          { status: 200 },
        );
      }
      return new Response(
        JSON.stringify({
          id: 'rec-del',
          path: 'work.ipynb',
          at: '2026-11-28T10:00:00Z',
          reason: 'save_failed',
          cells: [],
          content: copyContent,
        }),
        { status: 200 },
      );
    });

    const onCopiesChanged = vi.fn();
    const onClose = vi.fn();
    render(
      <RecoverySheet
        path="work.ipynb"
        name="work.ipynb"
        settings={makeSettings(fetch)}
        contents={{ save: vi.fn() }}
        onCopiesChanged={onCopiesChanged}
        onRestored={() => {}}
        onClose={onClose}
      />,
    );

    await screen.findByRole('button', { name: 'Discard Copy' });
    await user.click(screen.getByRole('button', { name: 'Discard Copy' }));

    await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1));
    expect(deleted).toBe(true);
    expect(onCopiesChanged).toHaveBeenLastCalledWith([]);
  });

  it('closes on Escape when not busy', async () => {
    const user = userEvent.setup();
    const fetch = vi.fn(async () => new Response('Not Found', { status: 404 }));
    const onClose = vi.fn();
    render(
      <RecoverySheet
        path="work.ipynb"
        name="work.ipynb"
        settings={makeSettings(fetch)}
        contents={{ save: vi.fn() }}
        onCopiesChanged={() => {}}
        onRestored={() => {}}
        onClose={onClose}
      />,
    );
    await screen.findByText(/not available on this server/i);
    await user.keyboard('{Escape}');
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
