import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { CommandRegistry } from '@lumino/commands';
import type { Notebook } from '@jupyterlab/notebook';
import { Signal } from '@lumino/signaling';
import { KeyboardBar } from './KeyboardBar';

class FakeViewport extends EventTarget {
  height = 800;
  offsetTop = 0;
  scale = 1;
}

let viewport: FakeViewport;
let coarse = true;

beforeEach(() => {
  viewport = new FakeViewport();
  coarse = true;
  vi.stubGlobal('visualViewport', viewport);
  vi.stubGlobal('innerHeight', 800);
  vi.stubGlobal('matchMedia', (query: string) => ({
    matches: query === '(pointer: coarse)' && coarse,
  }));
  vi.stubGlobal('requestAnimationFrame', (f: FrameRequestCallback) => setTimeout(f, 0));
  vi.stubGlobal('cancelAnimationFrame', (id: number) => clearTimeout(id));
});

afterEach(() => {
  vi.unstubAllGlobals();
  document.body.replaceChildren();
});

function setup() {
  const host = document.createElement('div');
  const input = document.createElement('textarea');
  host.append(input);
  document.body.append(host);
  const notebook = {
    mode: 'edit',
    activeCell: { editor: { host, replaceSelection: vi.fn() } },
    stateChanged: new Signal({}),
  } as unknown as Notebook;
  const commands = { execute: vi.fn(async () => {}) } as unknown as CommandRegistry;
  render(<KeyboardBar notebook={notebook} commands={commands} />);
  return { notebook, commands, input };
}

const settle = () => act(() => new Promise(r => setTimeout(r, 5)));

async function keyboardComesUp(input: HTMLElement) {
  input.focus();
  viewport.height = 450;
  viewport.dispatchEvent(new Event('resize'));
  await settle();
}

describe('KeyboardBar', () => {
  it('shows above the on-screen keyboard while a cell is edited', async () => {
    const { input } = setup();
    expect(screen.queryByRole('toolbar')).toBeNull();
    await keyboardComesUp(input);
    expect(screen.getByRole('toolbar', { name: 'Keys' })).toHaveStyle({ top: '450px' });

    // Editing stops: the keyboard goes, and so does the bar.
    input.blur();
    await settle();
    expect(screen.queryByRole('toolbar')).toBeNull();
  });

  it('keeps the focus in the editor and runs the cell', async () => {
    const { input, commands } = setup();
    await keyboardComesUp(input);
    await userEvent.click(screen.getByRole('button', { name: 'Run the cell' }));
    expect(commands.execute).toHaveBeenCalledWith('run-and-advance');
    expect(document.activeElement).toBe(input);
  });

  it('stays away with a mouse or trackpad', async () => {
    coarse = false;
    const { input } = setup();
    await keyboardComesUp(input);
    expect(screen.queryByRole('toolbar')).toBeNull();
  });
});
