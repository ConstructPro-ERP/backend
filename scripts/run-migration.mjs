import { readFileSync } from 'fs'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'
import { config } from 'dotenv'
import { Pool, neonConfig } from '@neondatabase/serverless'
import ws from 'ws'

const __dirname = dirname(fileURLToPath(import.meta.url))
config({ path: resolve(__dirname, '../.env') })

neonConfig.webSocketConstructor = ws

const pool = new Pool({ connectionString: process.env.DATABASE_URL })

const migration = readFileSync(resolve(__dirname, 'apply-schema.sql'), 'utf8')

// Split on semicolons at end of lines (handles multi-line statements with blank lines inside)
const statements = migration
  .split(/;[ \t]*\n/)
  .map((s) => s.trim())
  .filter((s) => {
    const sqlLines = s.split('\n').filter((l) => !l.trim().startsWith('--') && l.trim().length > 0)
    return sqlLines.length > 0
  })

console.log(`Applying ${statements.length} SQL statements to NeonDB...\n`)

for (const statement of statements) {
  const preview = statement.replaceAll('\n', ' ').slice(0, 80)
  try {
    await pool.query(statement)
    console.log(`✓ ${preview}`)
  } catch (err) {
    if (err.message.includes('already exists')) {
      console.log(`⚠ skipped (already exists): ${preview}`)
    } else {
      console.error(`✗ FAILED: ${preview}`)
      console.error(`  Error: ${err.message}`)
      await pool.end()
      process.exit(1)
    }
  }
}

await pool.end()
console.log('\n✅ All tables created successfully in NeonDB.')
