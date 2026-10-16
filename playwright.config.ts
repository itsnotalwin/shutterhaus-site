import { defineConfig } from '@playwright/test';
export default defineConfig({
  testDir: './tests',
  timeout: 30000,
  fullyParallel: false,
  workers: 1,
  reporter: [['list']],
  use: {
    baseURL: process.env.BROWSER_TEST_URL || 'http://127.0.0.1:4173',
    trace: 'retain-on-failure',
  },
  projects: [
    { name: 'chromium', use: { browserName: 'chromium', launchOptions: { executablePath: process.env.CHROME_BIN || '/usr/bin/chromium', args: ['--no-sandbox', '--disable-dev-shm-usage'] } } },
    { name: 'webkit', testMatch: 'safari-layout.spec.ts', use: { browserName: 'webkit' } },
  ],
  webServer: process.env.BROWSER_TEST_URL ? undefined : {command:'npm run preview', url:'http://127.0.0.1:4173', reuseExistingServer:true},
});
