module.exports = {
  moduleFileExtensions: ['js', 'json', 'ts'],
  rootDir: '.',
  cacheDirectory: '<rootDir>/coverage/.jest-cache',
  testEnvironment: 'node',
  setupFiles: ['<rootDir>/test/jest-e2e.setup.ts'],
  testRegex: 'test/finance/.*\\.db\\.spec\\.ts$',
  transform: { '^.+\\.(t|j)s$': 'ts-jest' },
  testTimeout: 30000,
};
