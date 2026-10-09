import { config } from 'dotenv';
import { Pool, neonConfig } from '@neondatabase/serverless';
import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';
import ws from 'ws';

config({ path: resolve('.env') });

neonConfig.webSocketConstructor = ws;

// Use only the database configured for E2E testing.
const databaseUrl = process.env.DATABASE_URL_TEST;

if (!databaseUrl) {
  throw new Error('DATABASE_URL_TEST is required.');
}

const pool = new Pool({
  connectionString: databaseUrl,
});

try {
  const client = await pool.connect();

  try {
    // Require existing Prisma migration history.
    const migrationsBefore = await client.query(`
      SELECT COUNT(*)::integer AS count
      FROM public."_prisma_migrations"
    `);

    const migrationCount = migrationsBefore.rows[0].count;

    // Find all public tables except Prisma migration history.
    const result = await client.query(`
      SELECT format('%I.%I', schemaname, tablename) AS name
      FROM pg_tables
      WHERE schemaname = 'public'
        AND tablename <> '_prisma_migrations'
      ORDER BY tablename
    `);

    const tables = result.rows.map((row) => row.name);

    if (tables.length === 0) {
      throw new Error('No application tables found.');
    }

    console.log(`Resetting ${tables.length} test database tables...`);

    await client.query('BEGIN');

    try {
      await client.query(
        `TRUNCATE TABLE ${tables.join(', ')} RESTART IDENTITY RESTRICT`,
      );

      // Verify that migration history was preserved.
      const migrationsAfter = await client.query(`
        SELECT COUNT(*)::integer AS count
        FROM public."_prisma_migrations"
      `);

      if (migrationsAfter.rows[0].count !== migrationCount) {
        throw new Error('Migration history verification failed.');
      }

      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    }

    console.log('Test database tables cleared successfully.');
    console.log(`Preserved ${migrationCount} migration records.`);
  } finally {
    client.release();
  }
} finally {
  await pool.end();
}

// Seed the SAME test database using the existing Prisma seed script.
console.log('Seeding test database...');

const seed = spawnSync(
  process.execPath,
  [
    resolve('node_modules', 'ts-node', 'dist', 'bin.js'),
    '--compiler-options',
    '{"module":"CommonJS"}',
    resolve('prisma', 'seed.ts'),
  ],
  {
    stdio: 'inherit',
    env: {
      ...process.env,
      DATABASE_URL: databaseUrl,
      NODE_ENV: 'test',
    },
  },
);

if (seed.error) {
  throw seed.error;
}

if (seed.status !== 0) {
  throw new Error('Test database seeding failed.');
}

console.log('Test database reset and seeding completed.');
