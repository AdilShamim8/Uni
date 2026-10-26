import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    // Integration tests boot a real embedded PostgreSQL per file; run
    // sequentially in forked processes for isolation.
    fileParallelism: false,
    pool: 'forks',
    testTimeout: 120_000,
    hookTimeout: 120_000,
  },
})
