

import './styles/tokens.css';
import './TallyDark.css';
import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';

import App from './App';
import { ErrorBoundary } from './components/ErrorBoundary';
import { registerGlobalErrorHandler } from './utils/globalErrorHandler';
import { initDiagnostics } from './utils/diagnostics';
import { HelmetProvider } from 'react-helmet-async';

initDiagnostics();
registerGlobalErrorHandler();
ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <HelmetProvider>
      <BrowserRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
        <ErrorBoundary>
          <App />
        </ErrorBoundary>
      </BrowserRouter>
    </HelmetProvider>
  </React.StrictMode>
);
