import { config } from 'dotenv';

config({ path: '.env' });

const testDatabaseUrl = process.env.DATABASE_URL_TEST;

if (!testDatabaseUrl) {
  throw new Error(
    'DATABASE_URL_TEST is required when running integration/E2E tests.',
  );
}

// Force the application and direct test Prisma clients to use the same test DB.
process.env.DATABASE_URL = testDatabaseUrl;
process.env.NODE_ENV = 'test';
