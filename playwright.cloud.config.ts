import { defineConfig } from '@playwright/test';
import base from './playwright.config';
export default defineConfig({
  outputDir: 'test-results-cloud',
  ...base,
  testIgnore: [],
  testMatch: '**/cloud.spec.ts',
  use: { ...base.use, baseURL: 'http://127.0.0.1:5175' },
  webServer: {
    command: 'npm run dev -- --port 5175',
    url: 'http://127.0.0.1:5175',
    reuseExistingServer: false,
    timeout: 30000,
    env: {
      VITE_DATA_BACKEND: 'supabase',
      VITE_SUPABASE_URL: 'https://sivtgmclfgebjippxgxp.supabase.co',
      VITE_SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_test_only',
    },
  },
});
