import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    host: '127.0.0.1',
    proxy: {
      // O front chama /api/... e o Vite encaminha para a API Node.
      '/api': { target: 'http://127.0.0.1:4000', changeOrigin: true },
    },
  },
});
