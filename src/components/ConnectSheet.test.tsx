import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { ConnectSheet } from './ConnectSheet';

type Props = Parameters<typeof ConnectSheet>[0];

function renderSheet(props: Partial<Props> = {}) {
  const handlers = { onCancel: vi.fn(), onConnect: vi.fn() };
  const utils = render(
    <ConnectSheet connecting={false} canCancel={false} {...handlers} {...props} />,
  );
  return { ...utils, ...handlers };
}

const server = () => screen.getByPlaceholderText('Same origin (dev proxy)') as HTMLInputElement;
const token = () => screen.getByPlaceholderText('From ganymede serve') as HTMLInputElement;
const connectButton = () => screen.getByRole('button', { name: /Connect/ });

describe('ConnectSheet', () => {
  it('defaults to a Ganymede server, same origin', async () => {
    const { onConnect } = renderSheet();
    expect(screen.getByRole('radio', { name: /Ganymede server/ })).toHaveAttribute(
      'aria-checked',
      'true',
    );
    expect(screen.getByRole('radio', { name: /This browser/ })).toHaveAttribute(
      'aria-checked',
      'false',
    );
    expect(server().value).toBe('');
    expect(screen.getByText(`--allow-origin ${window.location.origin}`)).toBeInTheDocument();

    await userEvent.click(connectButton());
    expect(onConnect).toHaveBeenCalledWith({ kind: 'ganymede', url: '', token: '' });
  });

  it('submits a trimmed server URL and token', async () => {
    const { onConnect } = renderSheet();
    await userEvent.type(server(), '  https://kernels.example:8888  ');
    await userEvent.type(token(), ' s3cret {Enter}');
    expect(onConnect).toHaveBeenCalledOnce();
    expect(onConnect).toHaveBeenCalledWith({
      kind: 'ganymede',
      url: 'https://kernels.example:8888',
      token: 's3cret',
    });
  });

  it('can keep notebooks on the server and run kernels in the page', async () => {
    const { onConnect } = renderSheet();
    await userEvent.click(screen.getByRole('checkbox', { name: /Run kernels in this page/ }));
    await userEvent.click(connectButton());
    expect(onConnect).toHaveBeenCalledWith({
      kind: 'ganymede',
      url: '',
      token: '',
      kernels: 'page',
    });
  });

  it("keeps the server's kernels beside the page's", async () => {
    const { onConnect } = renderSheet({
      initial: { kind: 'ganymede', url: '', token: '', kernels: 'both' },
    });
    expect(screen.getByRole('checkbox', { name: /Run kernels in this page/ })).toBeChecked();
    await userEvent.click(connectButton());
    expect(onConnect).toHaveBeenCalledWith({
      kind: 'ganymede',
      url: '',
      token: '',
      kernels: 'both',
    });
  });

  it('remembers kernels in the page', () => {
    renderSheet({ initial: { kind: 'ganymede', url: '', token: '', kernels: 'page' } });
    expect(screen.getByRole('checkbox', { name: /Run kernels in this page/ })).toBeChecked();
  });

  it('keeps the token hidden and the server field a URL', async () => {
    renderSheet();
    expect(token()).toHaveAttribute('type', 'password');
    expect(server()).toHaveAttribute('type', 'url');
    await userEvent.type(server(), 'not a url');
    // The browser's own validation stops the form; no app-level checks.
    expect(server().validity.typeMismatch).toBe(true);
    expect(server().checkValidity()).toBe(false);
  });

  it('switches to the browser backend', async () => {
    const { onConnect } = renderSheet();
    await userEvent.click(screen.getByRole('radio', { name: /This browser/ }));
    expect(screen.getByRole('radio', { name: /This browser/ })).toHaveAttribute(
      'aria-checked',
      'true',
    );
    expect(screen.queryByPlaceholderText('From ganymede serve')).not.toBeInTheDocument();
    await userEvent.click(connectButton());
    expect(onConnect).toHaveBeenCalledWith({ kind: 'browser' });
  });

  it('starts from the current config', () => {
    renderSheet({ initial: { kind: 'ganymede', url: 'http://h:1', token: 'tk' } });
    expect(server().value).toBe('http://h:1');
    expect(token().value).toBe('tk');
  });

  it('starts on the browser when that is the current backend', async () => {
    const { onConnect } = renderSheet({ initial: { kind: 'browser' } });
    expect(screen.getByRole('radio', { name: /This browser/ })).toHaveAttribute(
      'aria-checked',
      'true',
    );
    // Switching back to a server starts with empty fields.
    await userEvent.click(screen.getByRole('radio', { name: /Ganymede server/ }));
    expect(server().value).toBe('');
    await userEvent.click(connectButton());
    expect(onConnect).toHaveBeenCalledWith({ kind: 'ganymede', url: '', token: '' });
  });

  it('shows the last error', () => {
    renderSheet({ error: 'The server refused the token.' });
    expect(screen.getByRole('alert')).toHaveTextContent('The server refused the token.');
  });

  it('cannot connect twice while connecting', () => {
    renderSheet({ connecting: true });
    expect(screen.getByRole('button', { name: 'Connecting…' })).toBeDisabled();
  });

  it('can only be cancelled when there is a backend to go back to', async () => {
    const { onCancel, rerender } = renderSheet();
    expect(screen.queryByRole('button', { name: 'Cancel' })).not.toBeInTheDocument();
    rerender(<ConnectSheet connecting={false} canCancel onCancel={onCancel} onConnect={vi.fn()} />);
    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(onCancel).toHaveBeenCalledOnce();
  });
});

const radio = (name: RegExp) => screen.getByRole('radio', { name });

describe('ConnectSheet keyboard and focus (#797)', () => {
  it('is a modal dialog named by its heading', () => {
    renderSheet();
    const dialog = screen.getByRole('dialog', { name: 'Where should kernels run?' });
    expect(dialog).toHaveAttribute('aria-modal', 'true');
    expect(screen.getByRole('radiogroup', { name: 'Where should kernels run?' })).toBeVisible();
  });

  it('focuses the chosen kind on open', () => {
    renderSheet({ initial: { kind: 'browser' } });
    expect(radio(/This browser/)).toHaveFocus();
  });

  it('moves and selects with the arrow keys, wrapping', async () => {
    renderSheet();
    expect(radio(/Ganymede server/)).toHaveFocus();
    await userEvent.keyboard('{ArrowRight}');
    expect(radio(/This browser/)).toHaveAttribute('aria-checked', 'true');
    expect(radio(/This browser/)).toHaveFocus();
    expect(screen.queryByPlaceholderText('From ganymede serve')).not.toBeInTheDocument();
    await userEvent.keyboard('{ArrowRight}');
    expect(radio(/Ganymede server/)).toHaveAttribute('aria-checked', 'true');
    expect(radio(/Ganymede server/)).toHaveFocus();
    await userEvent.keyboard('{ArrowUp}');
    expect(radio(/This browser/)).toHaveFocus();
    await userEvent.keyboard('{ArrowLeft}');
    expect(radio(/Ganymede server/)).toHaveFocus();
    await userEvent.keyboard('{ArrowDown}');
    expect(radio(/This browser/)).toHaveAttribute('aria-checked', 'true');
    await userEvent.keyboard('{Home}');
    expect(radio(/Ganymede server/)).toHaveAttribute('aria-checked', 'true');
    await userEvent.keyboard('{End}');
    expect(radio(/This browser/)).toHaveAttribute('aria-checked', 'true');
    expect(radio(/This browser/)).toHaveFocus();
  });

  it('is one Tab stop: only the chosen kind is tabbable', async () => {
    renderSheet();
    expect(radio(/Ganymede server/)).toHaveAttribute('tabindex', '0');
    expect(radio(/This browser/)).toHaveAttribute('tabindex', '-1');
    await userEvent.tab();
    expect(server()).toHaveFocus();
  });

  it('keeps Tab inside the sheet', async () => {
    render(
      <>
        <button>Behind</button>
        <ConnectSheet connecting={false} canCancel onCancel={vi.fn()} onConnect={vi.fn()} />
      </>,
    );
    await userEvent.keyboard('{ArrowRight}');
    await userEvent.tab();
    expect(screen.getByRole('button', { name: 'Cancel' })).toHaveFocus();
    await userEvent.tab();
    expect(connectButton()).toHaveFocus();
    await userEvent.tab();
    expect(radio(/This browser/)).toHaveFocus();
    await userEvent.tab({ shift: true });
    expect(connectButton()).toHaveFocus();
  });

  it('brings focus back in from the page, past a disabled Connect', async () => {
    const sheet = (connecting: boolean) => (
      <>
        <button>Before</button>
        <ConnectSheet
          connecting={connecting}
          canCancel={false}
          onCancel={vi.fn()}
          onConnect={vi.fn()}
        />
        <button>After</button>
      </>
    );
    const { rerender } = render(sheet(false));
    connectButton().focus();
    rerender(sheet(true));
    // As Chrome does when the focused button is disabled.
    (document.activeElement as HTMLElement).blur();
    expect(document.body).toHaveFocus();
    await userEvent.tab({ shift: true });
    expect(screen.getByRole('checkbox', { name: /Run kernels in this page/ })).toHaveFocus();
    (document.activeElement as HTMLElement).blur();
    await userEvent.tab();
    expect(radio(/Ganymede server/)).toHaveFocus();
  });

  it('cancels on Escape when it can', async () => {
    const { onCancel } = renderSheet({ canCancel: true });
    await userEvent.keyboard('{Escape}');
    expect(onCancel).toHaveBeenCalledOnce();
  });

  it('stays on Escape when there is nothing to go back to', async () => {
    const { onCancel } = renderSheet();
    await userEvent.keyboard('{Escape}');
    expect(onCancel).not.toHaveBeenCalled();
    expect(screen.getByRole('dialog')).toBeInTheDocument();
  });

  it('gives focus back to the control that opened it', () => {
    const opener = document.createElement('button');
    document.body.append(opener);
    opener.focus();
    const { unmount } = renderSheet({ canCancel: true });
    expect(radio(/Ganymede server/)).toHaveFocus();
    unmount();
    expect(opener).toHaveFocus();
    opener.remove();
  });

  it('leaves focus where something else put it while open', () => {
    const opener = document.createElement('button');
    const elsewhere = document.createElement('input');
    document.body.append(opener, elsewhere);
    opener.focus();
    const { unmount } = renderSheet({ canCancel: true });
    expect(radio(/Ganymede server/)).toHaveFocus();
    elsewhere.focus();
    unmount();
    expect(elsewhere).toHaveFocus();
    opener.remove();
    elsewhere.remove();
  });

  it('keeps focus in the sheet on a click on the dimmed page', () => {
    const { container } = renderSheet();
    const backdrop = container.querySelector('.sheet-backdrop')!;
    expect(fireEvent.mouseDown(backdrop)).toBe(false);
    expect(radio(/Ganymede server/)).toHaveFocus();
    // A press inside the sheet does what it always does.
    expect(fireEvent.mouseDown(screen.getByRole('dialog'))).toBe(true);
    expect(fireEvent.mouseDown(server())).toBe(true);
  });

  it('keeps Escape from what is behind the sheet', async () => {
    const behind = vi.fn();
    window.addEventListener('keydown', behind);
    try {
      const { onCancel } = renderSheet({ canCancel: true });
      await userEvent.keyboard('{Escape}');
      expect(onCancel).toHaveBeenCalledOnce();
      expect(behind).not.toHaveBeenCalled();
    } finally {
      window.removeEventListener('keydown', behind);
    }
  });

  it('ignores Escape while composing text', () => {
    const { onCancel } = renderSheet({ canCancel: true });
    fireEvent.keyDown(server(), { key: 'Escape', isComposing: true });
    expect(onCancel).not.toHaveBeenCalled();
    fireEvent.keyDown(server(), { key: 'Escape' });
    expect(onCancel).toHaveBeenCalledOnce();
  });

  it('takes the arrows, Home and End from the page', () => {
    renderSheet();
    for (const key of ['ArrowRight', 'ArrowLeft', 'ArrowDown', 'ArrowUp', 'Home', 'End']) {
      expect(fireEvent.keyDown(document.activeElement!, { key })).toBe(false);
    }
    expect(fireEvent.keyDown(document.activeElement!, { key: 'a' })).toBe(true);
  });

  it('takes Escape from the page when it cancels', () => {
    const { onCancel } = renderSheet({ canCancel: true });
    expect(fireEvent.keyDown(server(), { key: 'Escape' })).toBe(false);
    expect(onCancel).toHaveBeenCalledOnce();
  });

  it('leaves modified arrows alone', async () => {
    renderSheet();
    for (const key of [
      '{Alt>}{ArrowRight}{/Alt}',
      '{Control>}{ArrowRight}{/Control}',
      '{Meta>}{ArrowRight}{/Meta}',
    ]) {
      await userEvent.keyboard(key);
      expect(radio(/Ganymede server/)).toHaveAttribute('aria-checked', 'true');
      expect(radio(/Ganymede server/)).toHaveFocus();
    }
  });
});
