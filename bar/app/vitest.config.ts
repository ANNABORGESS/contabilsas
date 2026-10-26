import { defineConfig } from 'vitest/config';
import path from 'node:path';

export default defineConfig({
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'src'),
      // os serviços marcam 'server-only'; nos testes rodam direto no Node
      'server-only': path.resolve(__dirname, 'src/test/vazio.ts'),
    },
  },
  test: { include: ['src/**/*.test.ts'], testTimeout: 30000 },
});
