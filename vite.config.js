import { defineConfig } from 'vite';
import { fileURLToPath } from 'node:url';

// Relative asset URLs support GitHub Pages repository subpaths. Serve over HTTP.
export default defineConfig({
  base: './',
  build: {
    target: 'es2022',
    outDir: 'dist',
    rollupOptions: {
      input: {
        home: fileURLToPath(new URL('./index.html', import.meta.url)),
        fieldRoute: fileURLToPath(new URL('./field-route.html', import.meta.url)),
      },
    },
  },
});
