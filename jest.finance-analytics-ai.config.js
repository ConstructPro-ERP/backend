const unit = require('./jest.unit.config');

module.exports = {
  ...unit,
  cacheDirectory: '<rootDir>/coverage/.jest-cache',
  testRegex:
    'test/(invoice-service|payment-service|analytics-service|ai-service)/.*\\.spec\\.ts$',
  collectCoverage: true,
  collectCoverageFrom: [
    'apps/invoice-service/src/*.service.ts',
    'apps/invoice-service/src/pdf/*.service.ts',
    'apps/payment-service/src/*.service.ts',
    'apps/analytics-service/src/analytics.service.ts',
    'apps/ai-service/src/ai-{forecasting,provider,prompt}.service.ts',
  ],
  coverageDirectory: '<rootDir>/coverage/finance-analytics-ai',
  coverageReporters: ['text', 'json', 'json-summary', 'lcov'],
  coverageThreshold: {
    global: { statements: 80, lines: 80, functions: 80, branches: 90 },
    './apps/invoice-service/src/invoice.service.ts': { branches: 90 },
    './apps/payment-service/src/payment.service.ts': { branches: 90 },
    './apps/invoice-service/src/pdf/invoice-pdf.service.ts': { branches: 90 },
    './apps/ai-service/src/ai-provider.service.ts': { branches: 90 },
    './apps/ai-service/src/ai-forecasting.service.ts': { branches: 90 },
  },
};
