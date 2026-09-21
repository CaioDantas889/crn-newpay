import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { AppProvider } from './state/app.jsx';
import App from './App.jsx';
import './styles/base.css';
import './styles/modules.css';
import './styles/crm.css';
import './styles/pipeline.css';

// Service worker só no build de produção: em desenvolvimento ele brigaria com o
// hot reload do Vite e esconderia mudança de código atrás do cache.
if ('serviceWorker' in navigator && import.meta.env.PROD) {
  window.addEventListener('load', () => {
    navigator.serviceWorker
      .register('/sw.js', { updateViaCache: 'none' })
      .catch((erro) => console.warn('[pwa] service worker não registrado:', erro.message));
  });
}

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <BrowserRouter>
      <AppProvider>
        <App />
      </AppProvider>
    </BrowserRouter>
  </StrictMode>
);
