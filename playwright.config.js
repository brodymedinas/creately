const { defineConfig, devices } = require('@playwright/test');

module.exports = defineConfig({
  testDir: './tests',
  /* Una prueba que tarda más de 30s está atorada, no lenta. */
  timeout: 30_000,
  expect: { timeout: 5_000 },
  fullyParallel: true,
  /* En CI, fallar si alguien dejó un test.only olvidado. */
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['github'], ['html', { open: 'never' }]] : [['list']],
  use: {
    baseURL: 'http://localhost:4321',
    /* Guardar rastro y captura solo cuando algo falla, para poder ver qué pasó. */
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: {
    command: 'node tests/server.js',
    url: 'http://localhost:4321',
    reuseExistingServer: !process.env.CI,
    timeout: 15_000,
  },
});
