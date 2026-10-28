import { defineConfig } from '@playwright/test';
export default defineConfig({
  testDir: './tests',
  testMatch: process.env.AGENTFLOW_DATABASE_TESTS === '1' ? '**/workspace-db.spec.ts' : '**/browser.spec.ts',
  outputDir: 'test-results/browser',
  fullyParallel: false, workers: 1, retries: 0,
  reporter: [['list'], ['html', { open: 'never' }]],
  use: { baseURL: 'http://127.0.0.1:3000', viewport: { width: 1440, height: 1000 }, reducedMotion: 'reduce', trace: 'retain-on-failure', screenshot: 'only-on-failure' },
  webServer: { command: 'npm run setup && npm run dev', url: 'http://127.0.0.1:3000/api/health', reuseExistingServer: !process.env.CI, timeout: 120000 }
});
