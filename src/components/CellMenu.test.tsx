import '../test/notebook-env';
import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import type { Cell } from '@jupyterlab/cells';
import type { Notebook } from '@jupyterlab/notebook';

// The menu's own behaviour; the actions are cell-controls.test.ts's.
const applyCellAction = vi.hoisted(() => vi.fn(async () => {}));
vi.mock('../lib/cell-controls', async importOriginal => ({
  ...(await importOriginal<typeof import('../lib/cell-controls')>()),
  applyCellAction,
}));

const { CellMenu } = await import('./CellMenu');
const { Signal } = await import('@lumino/signaling');

function setup(index: number, type = 'code') {
  const cells = [0, 1, 2].map(i => ({ model: { type: i === index ? type : 'code' } }));
  const notebook = {
    widgets: cells,
    model: { cells: { changed: new Signal({}) } },
    isDisposed: false,
    activate: vi.fn(),
  } as unknown as Notebook;
  const onClose = vi.fn();
  const run = vi.fn(async () => {});
  render(
    <CellMenu
      notebook={notebook}
      cell={cells[index] as unknown as Cell}
      anchor={document.body}
      run={run}
      onClose={onClose}
    />,
  );
  return { notebook, cell: cells[index], onClose, run };
}

describe('CellMenu', () => {
  it('checks the cell’s type', () => {
    setup(1, 'markdown');
    expect(screen.getByRole('menuitemradio', { name: /Markdown/ })).toHaveAttribute(
      'aria-checked',
      'true',
    );
    expect(screen.getByRole('menuitemradio', { name: /Code/ })).toHaveAttribute(
      'aria-checked',
      'false',
    );
  });

  it('can’t move the first cell up or the last one down', () => {
    setup(0);
    expect(screen.getByRole('menuitem', { name: 'Move Up' })).toBeDisabled();
    expect(screen.getByRole('menuitem', { name: 'Move Down' })).toBeEnabled();
  });

  it('applies the picked action to its cell and closes', async () => {
    const { notebook, cell, onClose, run } = setup(2);
    expect(screen.getByRole('menuitem', { name: 'Move Down' })).toBeDisabled();
    await userEvent.click(screen.getByRole('menuitem', { name: 'Delete' }));
    expect(onClose).toHaveBeenCalled();
    expect(applyCellAction).toHaveBeenCalledWith(notebook, cell, 'delete', run);
  });

  it('closes when the cells change', () => {
    const { notebook, onClose } = setup(1);
    act(() => (notebook.model!.cells.changed as unknown as { emit(v: unknown): void }).emit({}));
    expect(onClose).toHaveBeenCalledOnce();
  });

  it('closes on Escape and on a tap outside', async () => {
    const { onClose } = setup(1);
    await userEvent.keyboard('{Escape}');
    expect(onClose).toHaveBeenCalledTimes(1);
    await userEvent.pointer({
      keys: '[MouseLeft]',
      target: document.querySelector('.popup-menu-backdrop')!,
    });
    expect(onClose).toHaveBeenCalledTimes(2);
  });

  it('is the shared popup menu, with its arrow keys', async () => {
    setup(0);
    const menu = screen.getByRole('menu', { name: 'Cell Actions' });
    expect(menu).toHaveClass('popup-menu');
    expect(document.querySelector('.cell-menu')).toBeNull();
    expect(screen.getByRole('menuitem', { name: 'Run' })).toHaveFocus();
    await userEvent.keyboard('{End}');
    expect(screen.getByRole('menuitem', { name: 'Delete' })).toHaveFocus();
    await userEvent.keyboard('{ArrowDown}');
    expect(screen.getByRole('menuitem', { name: 'Run' })).toHaveFocus();
    await userEvent.keyboard('{ArrowDown}');
    expect(screen.getByRole('menuitem', { name: 'Collapse Code' })).toHaveFocus();
    await userEvent.keyboard('{ArrowDown}');
    expect(screen.getByRole('menuitemradio', { name: /Code/ })).toHaveFocus();
  });

  it('collapses and expands a code cell’s code (#564), and only a code cell’s', async () => {
    const { cell, notebook } = setup(1);
    const c = cell as unknown as { inputHidden: boolean; node: HTMLElement };
    c.node = document.createElement('div');
    c.inputHidden = false;
    const n = notebook as unknown as { activeCellIndex: number; deselectAll(): void };
    n.deselectAll = vi.fn();
    n.activeCellIndex = 0;
    await userEvent.click(screen.getByRole('menuitem', { name: 'Collapse Code' }));
    expect(c.inputHidden).toBe(true);
    // Its own cell becomes the active one, as for the other items.
    expect(n.activeCellIndex).toBe(1);
    expect(notebook.activate).toHaveBeenCalled();
  });

  it('has no Collapse Code for a Markdown cell', () => {
    setup(1, 'markdown');
    expect(screen.queryByRole('menuitem', { name: /Collapse Code|Expand Code/ })).toBeNull();
  });
});
