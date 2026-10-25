module.exports = {
  ...require('./jest.unit.config'),
  testMatch: ['<rootDir>/test/quotation-service/*.spec.ts'],
  testRegex: undefined,
  collectCoverageFrom: ['apps/quotation-service/src/**/*.ts'],
  coverageDirectory: './coverage/quotation-quality',
  coverageThreshold: {
    global: { lines: 86, statements: 86, functions: 86, branches: 86 },
    './apps/quotation-service/src/': {
      lines: 86,
      statements: 86,
      functions: 86,
      branches: 86,
    },
    './apps/quotation-service/src/filters/http-exception.filter.ts': {
      lines: 100,
      statements: 100,
      functions: 100,
      branches: 90,
    },
    './apps/quotation-service/src/quotation.service.ts': { branches: 90 },
  },
};
