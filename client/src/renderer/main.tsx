import React from 'react';
import ReactDOM from 'react-dom/client';
import { HashRouter, BrowserRouter } from 'react-router-dom';
import App from './App';
import './styles/global.css';
import { initErrorReporter } from './lib/errorReporter';

// Start remote error reporting before anything else
initErrorReporter();

const isDev = import.meta.env.DEV;
const isElectronProd = !isDev && window.location.protocol === 'file:';
const Router = isElectronProd ? HashRouter : BrowserRouter;

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <Router>
      <App />
    </Router>
  </React.StrictMode>,
);
