import { launchOptions } from './tests/browser-options.mjs'
import { defineConfig } from '@playwright/test'
export default defineConfig({
  testDir:'./tests/e2e', fullyParallel:false, workers:1, retries:0, reporter:'list',
  use:{baseURL:'http://127.0.0.1:5300',headless:true,launchOptions,viewport:{width:1280,height:900}},
  webServer:{command:'node tests/serve-production.mjs',url:'http://127.0.0.1:5300/api/health',reuseExistingServer:false,timeout:30000},
})
