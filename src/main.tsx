import React from 'react';
import ReactDOM from 'react-dom/client';
import { registerSW } from 'virtual:pwa-register';
import { App } from './App';
import { ShortcutsSheet } from './components/ShortcutsSheet';
import { startCrashReports } from './lib/crash-reports';

import './styles/app.css';
import './styles/jupyter.css';

registerSW({ immediate: true });
// Only when the user turned reports on (#319); otherwise the SDK isn't loaded.
void startCrashReports();

// The Apple apps' Settings › Shortcuts (#332) shows only the shortcuts.
const shortcutsOnly = new URLSearchParams(window.location.search).get('view') === 'shortcuts';
if (shortcutsOnly) document.documentElement.classList.add('shortcuts-only');

ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
  <React.StrictMode>
    {shortcutsOnly ? <ShortcutsSheet embedded onClose={() => {}} /> : <App />}
  </React.StrictMode>,
);
