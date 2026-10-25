const unit = require('./jest.unit.config');

module.exports = {
  ...unit,
  cacheDirectory: '<rootDir>/coverage/.jest-cache',
  testPathIgnorePatterns: [],
  testRegex:
    'test/(invoice-service|payment-service|analytics-service|ai-service|finance)/.*\\.integration\\.spec\\.ts$',
};
