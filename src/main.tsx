import React from 'react';
import ReactDOM from 'react-dom/client';
import { registerSW } from 'virtual:pwa-register';
import { App } from './App';
import { startCrashReports } from './lib/crash-reports';

import './styles/app.css';
import './styles/jupyter.css';

registerSW({ immediate: true });
// Only when the user turned reports on (#319); otherwise the SDK isn't loaded.
void startCrashReports();

ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
