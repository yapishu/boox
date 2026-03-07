import { defineConfig } from 'vite';
import { viteSingleFile } from 'vite-plugin-singlefile';

export default defineConfig({
  base: '/apps/boox/',
  plugins: [viteSingleFile()],
  build: {
    outDir: 'dist',
    modulePreload: false,
  },
  server: {
    proxy: {
      '/apps/boox/api': {
        target: 'http://localhost:8080',
        changeOrigin: true,
      },
    },
  },
});
