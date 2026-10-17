import { defineConfig } from 'vitest/config';

// A lógica fica em funções puras (sem o runtime dos Workers), então os testes rodam no Node
export default defineConfig({
  test: {
    include: ['test/**/*.test.ts'],
    environment: 'node',
  },
});
