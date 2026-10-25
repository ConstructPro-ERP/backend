module.exports = {
  moduleFileExtensions: ['js', 'json', 'ts'],
  rootDir: '.',
  testRegex: '.*\\.spec\\.ts$',
  testPathIgnorePatterns: [
    '\\.integration\\.spec\\.ts$',
    '\\.e2e-spec\\.ts$',
    '\\.db\\.spec\\.ts$',
    'src/database/__tests__',
  ],
  transform: {
    '^.+\\.(t|j)s$': 'ts-jest',
  },
  testEnvironment: 'node',
  setupFiles: ['dotenv/config'],

  // Include source files even when no test imports them.
  // This prevents untested files from being omitted from coverage.
  collectCoverageFrom: [
    'apps/**/src/**/*.ts',
    'libs/**/src/**/*.ts',
    'src/**/*.ts',

    // Exclude test files and TypeScript declarations.
    '!**/*.spec.ts',
    '!**/*.integration.spec.ts',
    '!**/*.e2e-spec.ts',
    '!**/*.db.spec.ts',
    '!**/*.d.ts',
  ],

  // Generate console, browser-readable, and machine-readable reports.
  coverageReporters: ['text', 'html', 'json', 'json-summary', 'lcov'],
  coverageThreshold: {
    './apps/client-service/src/client.controller.ts': {
      branches: 75,
      functions: 90,
      lines: 90,
      statements: 90,
    },
    './apps/client-service/src/client.service.ts': {
      branches: 85,
      functions: 90,
      lines: 90,
      statements: 90,
    },
    './apps/client-service/src/dto/client.dto.ts': {
      branches: 85,
      functions: 90,
      lines: 90,
      statements: 90,
    },
    './apps/client-service/src/repository/client.repository.ts': {
      branches: 75,
      functions: 90,
      lines: 90,
      statements: 90,
    },
  },
};
