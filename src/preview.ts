/**
 * preview.html: the page the Mac app's Quick Look extension shows (#135).
 * The extension loads it, then calls `window.ganymedePreview.render` with
 * the notebook's text and waits for it to resolve. See src/lib/preview.ts.
 */
import light from '@jupyterlab/theme-light-extension/style/variables.css?inline';
import dark from '@jupyterlab/theme-dark-extension/style/variables.css?inline';
import { renderPreview } from './lib/preview';

import './styles/app.css';
import './styles/jupyter.css';
import './styles/preview.css';

// JupyterLab's variables for the system appearance, as useJupyterLabTheme
// sets them in the app, following changes while the preview is open.
const scheme = window.matchMedia('(prefers-color-scheme: dark)');
const theme = document.createElement('style');
document.head.prepend(theme);
const applyTheme = () => {
  theme.textContent = scheme.matches ? dark : light;
  document.body.dataset.jpThemeLight = String(!scheme.matches);
  document.body.dataset.jpThemeName = scheme.matches ? 'JupyterLab Dark' : 'JupyterLab Light';
};
applyTheme();
scheme.addEventListener('change', applyTheme);

declare global {
  interface Window {
    ganymedePreview: { render(text: string): Promise<{ cells: number }> };
  }
}

window.ganymedePreview = {
  async render(text) {
    const holder = document.getElementById('notebook')!;
    try {
      const { cells } = renderPreview(holder, text);
      return { cells };
    } catch (e) {
      const message = document.createElement('p');
      message.className = 'preview-error';
      message.textContent = e instanceof Error ? e.message : String(e);
      holder.replaceChildren(message);
      return { cells: 0 };
    }
  },
};
