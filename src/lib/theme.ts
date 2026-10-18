import { useEffect } from 'react';
import light from '@jupyterlab/theme-light-extension/style/variables.css?inline';
import dark from '@jupyterlab/theme-dark-extension/style/variables.css?inline';
import type { Scheme } from './useColorScheme';

/**
 * JupyterLab's `--jp-*` variables for the system appearance. JupyterLab's
 * theme manager swaps these stylesheets; here one `<style>` follows the
 * color scheme. `src/styles/jupyter.css` then overrides a few of them for
 * the shell's look, so it must come later in the cascade: the variables
 * are set on `:root`, the overrides on `.notebook-page`.
 */
export function useJupyterLabTheme(scheme: Scheme) {
  useEffect(() => {
    const style = document.createElement('style');
    style.dataset.jupyterlabTheme = scheme;
    style.textContent = scheme === 'dark' ? dark : light;
    document.head.prepend(style);
    document.body.dataset.jpThemeLight = String(scheme === 'light');
    document.body.dataset.jpThemeName = scheme === 'dark' ? 'JupyterLab Dark' : 'JupyterLab Light';
    return () => style.remove();
  }, [scheme]);
}
