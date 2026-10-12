import { defineConfig } from 'vite';

export default defineConfig({
  // Relative asset paths, so the build works when served from a subpath or
  // from inside an embedded frame rather than a domain root.
  base: './',
  build: {
    target: 'es2022',
    chunkSizeWarningLimit: 1200,
    rolldownOptions: {
      output: {
        // Stable names rather than content hashes: the deployed page references
        // these paths directly, so a rebuild should not churn them.
        entryFileNames: 'assets/game.js',
        chunkFileNames: 'assets/[name].js',
        assetFileNames: 'assets/[name][extname]',
      },
    },
  },
});
