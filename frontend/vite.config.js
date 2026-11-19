import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';

export default defineConfig({
  plugins: [vue()],
  base: '/',
  server: {
    proxy: {
      '/auth': 'http://localhost:3000',
      '/badge': 'http://localhost:3000',
      '/pairing': 'http://localhost:3000',
      '/badge-login': 'http://localhost:3000',
      '/health': 'http://localhost:3000',
      '/socket': {
        target: 'ws://localhost:3000',
        ws: true
      }
    }
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true
  }
});
