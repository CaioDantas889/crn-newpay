import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    host: '127.0.0.1',
    proxy: {
      // O front chama /api/... e o Vite encaminha para a API Node. A porta é a
      // mesma variável da API (API_PORT), para as duas pontas mudarem juntas.
      '/api': { target: `http://127.0.0.1:${process.env.API_PORT || 4000}`, changeOrigin: true },
      // Fotos de fachada, prints e áudios ficam no servidor da API
      '/uploads': { target: `http://127.0.0.1:${process.env.API_PORT || 4000}`, changeOrigin: true },
    },
  },
});
