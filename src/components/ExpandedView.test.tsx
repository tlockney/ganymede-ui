import '../test/notebook-env';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { EditorView } from '@codemirror/view';
import { NotebookModel } from '@jupyterlab/notebook';
import type { Contents } from '@jupyterlab/services';
import { ExpandedView } from './ExpandedView';
import { createRendermime } from '../lib/jupyterlab';
import { TABLE_MIME, type TableViewState } from '../lib/table-output';
import { resetWrapCodeForTests, wrapCodeEnabled } from '../lib/wrap-code';

globalThis.requestIdleCallback ??= ((cb: () => void) =>
  setTimeout(cb, 0)) as unknown as typeof requestIdleCallback;
Range.prototype.getClientRects ??= () => [] as unknown as DOMRectList;
Range.prototype.getBoundingClientRect ??= () => new DOMRect();

afterEach(() => {
  cleanup();
  resetWrapCodeForTests();
  document.body
    .querySelectorAll('.sheet-backdrop, .popup-menu-backdrop')
    .forEach(el => el.remove());
});

describe('ExpandedView (#822)', () => {
  it('opens source mode, toggles Wrap Code, updates header line count, and syncs live with a shared cell model', async () => {
    const model = new NotebookModel();
    model.fromJSON({
      nbformat: 4,
      nbformat_minor: 5,
      metadata: {},
      cells: [
        {
          cell_type: 'code',
          id: 'c1',
          source: 'a = 1\nb = 2\nc = 3',
          metadata: {},
          outputs: [],
          execution_count: 4,
        },
      ],
    });
    const shared = model.cells.get(0)!.sharedModel;
    const onClose = vi.fn();

    render(
      <ExpandedView
        target={{
          kind: 'source',
          title: 'In [4]',
          mimeType: 'text/x-python',
          source: shared.getSource(),
          sharedModel: shared,
        }}
        onClose={onClose}
      />,
    );

    const dialog = screen.getByRole('dialog', { name: 'In [4] · 3 lines' });
    expect(dialog).toHaveAttribute('aria-modal', 'true');

    const content = dialog.querySelector<HTMLElement>('.cm-content')!;
    expect(content).toHaveFocus();
    expect(content.classList.contains('cm-lineWrapping')).toBe(false);

    const wrapButton = screen.getByRole('button', { name: 'Wrap Code' });
    expect(wrapButton).toHaveAttribute('aria-pressed', 'false');
    await userEvent.click(wrapButton);
    expect(wrapCodeEnabled()).toBe(true);
    expect(wrapButton).toHaveAttribute('aria-pressed', 'true');
    expect(content.classList.contains('cm-lineWrapping')).toBe(true);

    // Edit inside the CodeMirror view and confirm the cell's Yjs model receives it live.
    const cmView = EditorView.findFromDOM(content)!;
    cmView.dispatch({ changes: { from: cmView.state.doc.length, insert: '\nd = 4' } });
    expect(shared.getSource()).toBe('a = 1\nb = 2\nc = 3\nd = 4');
    await vi.waitFor(() => {
      expect(screen.getByRole('heading', { name: 'In [4] · 4 lines' })).toBeInTheDocument();
    });

    // External cell edits reflect in the open dialog as well.
    shared.setSource('only_one = 1');
    await vi.waitFor(() => {
      expect(screen.getByRole('heading', { name: 'In [4] · 1 line' })).toBeInTheDocument();
    });
    expect(cmView.state.doc.toString()).toBe('only_one = 1');

    await userEvent.click(screen.getByRole('button', { name: 'Close' }));
    expect(onClose).toHaveBeenCalledTimes(1);
    model.dispose();
  });

  it('respects readOnly in source mode and keeps Tab inside the modal', async () => {
    const opener = document.createElement('button');
    opener.textContent = 'Expand source';
    document.body.append(opener);
    opener.focus();

    const onClose = vi.fn();
    const { unmount } = render(
      <ExpandedView
        target={{
          kind: 'source',
          title: 'Source',
          mimeType: 'text/plain',
          source: 'line 1\nline 2',
          readOnly: true,
        }}
        onClose={onClose}
      />,
    );

    const dialog = screen.getByRole('dialog');
    const content = dialog.querySelector<HTMLElement>('.cm-content')!;
    expect(content).toHaveFocus();
    const cmView = EditorView.findFromDOM(content)!;
    expect(cmView.state.readOnly).toBe(true);

    await userEvent.tab();
    expect(screen.getByRole('button', { name: 'Wrap Code' })).toHaveFocus();
    await userEvent.tab();
    expect(screen.getByRole('button', { name: 'Close' })).toHaveFocus();
    await userEvent.tab();
    expect(content).toHaveFocus();

    unmount();
    expect(opener).toHaveFocus();
    opener.remove();
  });

  it('dismisses on Escape unless composing or a higher sheet/menu is open', async () => {
    const onClose = vi.fn();
    render(
      <ExpandedView
        target={{ kind: 'source', title: 'Source', source: 'x = 1', readOnly: true }}
        onClose={onClose}
      />,
    );

    // IME composition Escape does not dismiss.
    window.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'Escape', isComposing: true, cancelable: true }),
    );
    expect(onClose).not.toHaveBeenCalled();

    // Higher modal above ExpandedView handles Escape first.
    const sheet = document.createElement('div');
    sheet.className = 'sheet-backdrop';
    document.body.append(sheet);
    await userEvent.keyboard('{Escape}');
    expect(onClose).not.toHaveBeenCalled();
    sheet.remove();

    await userEvent.keyboard('{Escape}');
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('renders a DataResource table with initial sort/page state and syncs updated state on close', async () => {
    const rows = Array.from({ length: 65 }, (_, i) => ({
      name: `R${String(i).padStart(2, '0')}`,
      val: i,
    }));
    const onState = vi.fn<(state: TableViewState) => void>();
    const onClose = vi.fn();
    const { unmount } = render(
      <ExpandedView
        target={{
          kind: 'table',
          title: 'Table, 65 rows',
          format: 'dataresource',
          resource: {
            schema: {
              fields: [
                { name: 'name', type: 'string' },
                { name: 'val', type: 'number' },
              ],
            },
            data: rows,
            ganymede: { rows: 65, shown: 65 },
          },
          trusted: false,
          initialViewState: { page: 1, sort: null },
          onViewStateChange: onState,
        }}
        onClose={onClose}
      />,
    );

    expect(screen.getByRole('dialog', { name: 'Table, 65 rows' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Close' })).toHaveFocus();
    expect(screen.getByText('Rows 51–65 of 65')).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: /name/ }));
    expect(screen.getByText('Rows 1–50 of 65')).toBeInTheDocument();

    unmount();
    expect(onState).toHaveBeenCalledWith({
      page: 0,
      sort: { column: 0, descending: false },
    });
  });

  it('frames trusted HTML tables with horizontal scrolling and sanitizes untrusted HTML tables', async () => {
    const rendermime = createRendermime('test.ipynb', {
      getDownloadUrl: async (path: string) => `/files/${path}`,
    } as unknown as Contents.IManager);
    const { rerender, container } = render(
      <ExpandedView
        target={{
          kind: 'table',
          title: 'Table',
          format: 'html',
          html: '<table><tr><td>1</td></tr></table>',
          trusted: true,
          rendermime,
        }}
        onClose={() => {}}
      />,
    );
    const frame = container.querySelector('iframe.gn-OutputFrame') as HTMLIFrameElement;
    expect(frame).not.toBeNull();
    expect(frame.srcdoc).toContain('overflow-x:auto;overflow-y:hidden');

    rerender(
      <ExpandedView
        target={{
          kind: 'table',
          title: 'Table',
          format: 'html',
          html: '<table><tr><td><b>Safe</b><img src=x onerror="bad=1"></td></tr></table>',
          trusted: false,
          rendermime,
        }}
        onClose={() => {}}
      />,
    );
    await vi.waitFor(() => {
      expect(screen.getByText('Safe')).toBeInTheDocument();
    });
    expect(container.querySelector('iframe')).toBeNull();
    expect(container.querySelector('img')?.getAttribute('onerror')).toBeNull();
    expect(TABLE_MIME).toBeTruthy();
  });
});
