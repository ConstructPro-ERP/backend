import { defineConfig } from 'prisma/config'
import { config } from 'dotenv'

config()

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: {
    seed: 'ts-node --compiler-options {"module":"CommonJS"} prisma/seed.ts',
  },
  datasource: {
    url: process.env.DIRECT_URL_TEST,
  },
})
