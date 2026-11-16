import { defineConfig } from 'vite';

// Relative asset URLs support GitHub Pages repository subpaths. Serve over HTTP.
export default defineConfig({
  base: './',
  build: { target: 'es2022', outDir: 'dist' },
});
