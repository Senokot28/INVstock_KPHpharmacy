const { defineConfig } = require('@playwright/test');
module.exports = defineConfig({
  testDir: './tests/browser',
  fullyParallel: false,
  workers: 1,
  reporter: 'list',
  use: { channel: 'msedge', headless: true, viewport: { width: 1440, height: 1000 } },
});
