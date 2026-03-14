import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    setupFiles: ['./tests/setup.ts'],
    include: ['tests/e2e/**/*.test.ts'],
    testTimeout: 120000,
    hookTimeout: 60000,
  },
})
