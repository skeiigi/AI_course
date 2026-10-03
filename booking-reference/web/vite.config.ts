import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    // В разработке интерфейс и API живут на разных портах. Прокси делает так,
    // что запросы к /api уходят на сервис, и настраивать междоменные запросы
    // не приходится. В собранном виде оба лежат на одном порту.
    proxy: {
      '/api': { target: 'http://127.0.0.1:8000', changeOrigin: true },
    },
  },
  build: {
    outDir: 'dist',
    sourcemap: true,
  },
});
