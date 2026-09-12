import { defineConfig } from 'vite';

export default defineConfig({
  root: '.',
  publicDir: '../assets',
  server: {
    port: 5173,
    host: true,
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
  },
});
