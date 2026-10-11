module.exports = {
  ...require('./jest.unit.config'),
  testMatch: ['<rootDir>/test/quotation-service/*.spec.ts'],
  testRegex: undefined,
  collectCoverageFrom: [
    'apps/quotation-service/src/quotation.service.ts',
    'apps/quotation-service/src/document.client.ts',
    'apps/quotation-service/src/project.client.ts',
    'apps/api-gateway/src/controllers/quotations-gateway.controller.ts',
  ],
  coverageDirectory: './coverage/quotation-quality',
  coverageThreshold: {
    global: { lines: 80, statements: 80, functions: 80 },
    './apps/quotation-service/src/quotation.service.ts': { branches: 90 },
  },
};
