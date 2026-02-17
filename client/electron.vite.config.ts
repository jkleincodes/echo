import { defineConfig } from 'electron-vite';
import react from '@vitejs/plugin-react';
import { readFileSync } from 'fs';

const pkg = JSON.parse(readFileSync('package.json', 'utf8'));

export default defineConfig({
  main: {
    build: {
      rollupOptions: {
        external: ['mediasoup-client'],
      },
    },
  },
  preload: {
    build: {
      rollupOptions: {
        external: ['mediasoup-client'],
        output: {
          format: 'cjs',
          entryFileNames: '[name].cjs',
        },
      },
    },
  },
  renderer: {
    plugins: [react()],
    define: {
      __APP_VERSION__: JSON.stringify(pkg.version),
      __DEFAULT_SERVER_URL__: JSON.stringify(process.env.DEFAULT_SERVER_URL || 'https://echo.fdr.sh'),
    },
  },
});
