import { defineConfig } from '@playwright/test'
import { launchOptions } from './tests/browser-options.mjs'
export default defineConfig({
  testDir: './tests/live', workers: 1, retries: 0, timeout: 60000, reporter: 'list',
  use: { baseURL: 'https://localhost:5443', ignoreHTTPSErrors: true, headless: true, launchOptions },
})
