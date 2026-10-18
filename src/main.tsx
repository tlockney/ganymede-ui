import React from 'react';
import ReactDOM from 'react-dom/client';
import { registerSW } from 'virtual:pwa-register';
import { PageConfig } from '@jupyterlab/coreutils';
import { App } from './App';

import './styles/app.css';
import './styles/jupyter.css';

registerSW({ immediate: true });

// Before anything from jupyter-react reads it: never default to a remote server.
PageConfig.setOption('baseUrl', window.location.origin + '/');

ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
