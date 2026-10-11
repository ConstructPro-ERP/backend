const path = require('path');
const dotenv = require('dotenv');
const { Pool, neonConfig } = require('@neondatabase/serverless');
const ws = require('ws');

// 1. Load environment variables from backend/.env
dotenv.config({ path: path.resolve(__dirname, '../.env') });

const testDatabaseUrl = process.env.DATABASE_URL_TEST;

if (!testDatabaseUrl) {
  console.error('❌ Error: DATABASE_URL_TEST is not defined in .env');
  process.exit(1);
}

// 2. Setup Neon WebSocket transport for Node environment
neonConfig.webSocketConstructor = ws;

async function resetTestDatabase() {
  console.log('🔄 Connecting to test database (DATABASE_URL_TEST)...');
  const pool = new Pool({ connectionString: testDatabaseUrl });

  try {
    // 3. Find all user tables in the public schema excluding _prisma_migrations
    const result = await pool.query(`
      SELECT tablename
      FROM pg_tables
      WHERE schemaname = 'public'
        AND tablename NOT IN ('_prisma_migrations', 'spatial_ref_sys');
    `);

    const tables = result.rows.map((row) => row.tablename);

    if (tables.length === 0) {
      console.log('ℹ️ No user tables found to truncate.');
    } else {
      console.log(
        `🧹 Wiping records from ${tables.length} tables (preserving _prisma_migrations)...`,
      );
      const quotedTableList = tables.map((t) => `"${t}"`).join(', ');
      await pool.query(
        `TRUNCATE TABLE ${quotedTableList} RESTART IDENTITY CASCADE;`,
      );
      console.log('✅ All data records wiped successfully.');
    }
  } catch (error) {
    console.error(
      '❌ Error while wiping test database:',
      error.message || error,
    );
    process.exit(1);
  } finally {
    await pool.end();
  }

  // 4. Run `npx prisma db seed` with DATABASE_URL set to DATABASE_URL_TEST
  console.log('\n🌱 Running `npx prisma db seed` against DATABASE_URL_TEST...');
  try {
    const { execSync } = require('child_process');
    execSync('npx prisma db seed', {
      stdio: 'inherit',
      env: {
        ...process.env,
        DATABASE_URL: testDatabaseUrl,
        DIRECT_URL: process.env.DIRECT_URL_TEST || testDatabaseUrl,
      },
      cwd: path.resolve(__dirname, '..'),
    });
  } catch (error) {
    console.error('❌ Failed to run prisma db seed:', error.message || error);
    process.exit(1);
  }

  console.log('\n🎉 Test database reset and seeded successfully!');
}

resetTestDatabase();
