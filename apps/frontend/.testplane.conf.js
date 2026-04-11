'use strict';

const isCI = Boolean(process.env.CI);

const chromeArgs = isCI
  ? [
      '--headless=new',
      '--no-sandbox',
      '--disable-gpu',
      '--disable-dev-shm-usage'
    ]
  : [];

const chromeBinary =
  process.env.CHROME_BIN ||
  (process.platform === 'darwin'
    ? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
    : undefined);

const chromeOptions = {};
if (chromeBinary) {
  chromeOptions.binary = chromeBinary;
}
if (chromeArgs.length > 0) {
  chromeOptions.args = chromeArgs;
}

module.exports = {
  baseUrl: process.env.E2E_BASE_URL || 'http://127.0.0.1:3000',

  /** Committed visual baselines (path relative to apps/frontend cwd). */
  screenshotsDir: 'e2e/screens',
  disableAnimation: true,

  sets: {
    e2e: {
      files: ['e2e/**/*.testplane.ts'],
      browsers: ['chrome']
    }
  },

  browsers: {
    chrome: {
      automationProtocol: 'devtools',
      headless: isCI,
      desiredCapabilities: {
        browserName: 'chrome',
        ...(Object.keys(chromeOptions).length > 0 && {
          'goog:chromeOptions': chromeOptions
        })
      },
      windowSize: '1280x720',
      sessionsPerBrowser: 1,
      testsPerSession: 1,
      retry: isCI ? 1 : 0,
      assertViewOpts: {
        screenshotDelay: 250,
        ignoreDiffPixelCount: '0.4%'
      }
    }
  },

  pageLoadTimeout: 60000,
  testTimeout: 120000,
  waitTimeout: 15000,

  system: {
    mochaOpts: {
      timeout: 120000
    }
  },

  plugins: {
    'html-reporter/testplane': {
      enabled: true,
      path: 'testplane-report'
    }
  },

  takeScreenshotOnFails: {
    testFail: true,
    assertViewFail: false
  }
};
