import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'src/renderer'),
      '@shared': path.resolve(__dirname, '../shared'),
    },
  },
  test: {
    globals: true,
    environment: 'jsdom',
    css: false,
    setupFiles: ['src/renderer/__tests__/setup.ts'],
    include: ['src/renderer/**/*.test.{ts,tsx}'],
    server: {
      deps: {
        inline: ['@csstools/css-calc', '@asamuzakjp/css-color'],
      },
    },
  },
});
