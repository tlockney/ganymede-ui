import { renderHook } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { useJupyterLabTheme } from './theme';
import type { Scheme } from './useColorScheme';

const themeStyles = () => [
  ...document.head.querySelectorAll<HTMLStyleElement>('style[data-jupyterlab-theme]'),
];

describe('useJupyterLabTheme', () => {
  it('injects the light variables first in <head>', () => {
    const other = document.createElement('style');
    document.head.append(other);
    renderHook(() => useJupyterLabTheme('light'));

    const [style] = themeStyles();
    expect(themeStyles()).toHaveLength(1);
    expect(style!.dataset.jupyterlabTheme).toBe('light');
    // First, so the shell's overrides in jupyter.css win.
    expect(document.head.firstElementChild).toBe(style);
    expect(style!.textContent).toContain('--jp-layout-color0');
    expect(document.body.dataset.jpThemeLight).toBe('true');
    expect(document.body.dataset.jpThemeName).toBe('JupyterLab Light');
    other.remove();
  });

  it('swaps to the dark variables and cleans up after itself', () => {
    const { rerender, unmount } = renderHook(({ s }: { s: Scheme }) => useJupyterLabTheme(s), {
      initialProps: { s: 'light' },
    });
    const light = themeStyles()[0]!.textContent;

    rerender({ s: 'dark' });
    expect(themeStyles()).toHaveLength(1);
    const dark = themeStyles()[0]!;
    expect(dark.dataset.jupyterlabTheme).toBe('dark');
    expect(dark.textContent).toContain('--jp-layout-color0');
    expect(dark.textContent).not.toBe(light);
    expect(document.body.dataset.jpThemeLight).toBe('false');
    expect(document.body.dataset.jpThemeName).toBe('JupyterLab Dark');

    unmount();
    expect(themeStyles()).toHaveLength(0);
  });
});
