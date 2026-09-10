# Migration Guide — ConstructPro ERP Data Layer

## 1. Prerequisites

| Requirement | Version |
|---|---|
| Node.js | 22 or later (see `engines` in `package.json`) |
| npm | 10 or later |
| PostgreSQL-compatible database | Neon (recommended) or any Postgres 15+ |

Ensure `DATABASE_URL` is present in `.env` before running any Prisma command.  
For migrations you also need `DIRECT_URL` (a direct connection string without connection pooling) because Prisma's migration engine cannot use a pooled/serverless URL.

---

## 2. First-Time Setup

```bash
# 1. Clone the repository
git clone <repo-url>
cd backend

# 2. Install dependencies
npm install

# 3. Copy the environment template and fill in values
cp .env.example .env
```

Open `.env` and set the required variables:

```dotenv
# Runtime connection — may use a pooler endpoint
DATABASE_URL="postgresql://<user>:<password>@<pooler-host>/<db>?sslmode=require"

# Direct connection for Prisma CLI (migrate, db push)
DIRECT_URL="postgresql://<user>:<password>@<direct-host>/<db>?sslmode=require"

# Separate Neon branch used by the test suite
DATABASE_URL_TEST="postgresql://<user>:<password>@<test-branch-host>/<db>?sslmode=require"

NODE_ENV=development
JWT_SECRET=<your-secret>
JWT_REFRESH_SECRET=<your-refresh-secret>
```

---

## 3. Applying Migrations in Development

Use `migrate dev` when you want to evolve the schema locally. It:

1. Generates SQL from your `schema.prisma` diff.
2. Applies the migration to your dev database.
3. Regenerates the Prisma Client.

```bash
npx prisma migrate dev --name <descriptive-name>
```

**Examples:**

```bash
npx prisma migrate dev --name add_project_tags
npx prisma migrate dev --name rename_customer_fullname
```

The migration files land in `prisma/migrations/<timestamp>_<name>/` and should be committed to version control.

> **Tip:** `migrate dev` requires `DIRECT_URL` in `prisma.config.ts` (or a direct connection in `schema.prisma`'s `datasource.directUrl`). Neon's pooler endpoint will cause the command to hang.

---

## 4. Applying Migrations in CI / Production

Use `migrate deploy` in automated pipelines and production environments. It:

- Applies **only** already-committed migration files.
- Does **not** generate new migrations or prompt interactively.
- Is safe to run multiple times (idempotent).

```bash
npx prisma migrate deploy
```

Typical CI step (GitHub Actions example):

```yaml
- name: Run database migrations
  env:
    DIRECT_URL: ${{ secrets.DIRECT_URL }}
    DATABASE_URL: ${{ secrets.DATABASE_URL }}
  run: npx prisma migrate deploy
```

> **Important:** Never run `migrate dev` or `migrate reset` in production.

---

## 5. Running the Seed

The seed script populates Roles, Permissions, and an initial admin user. It is idempotent — safe to run multiple times.

```bash
npx prisma db seed
```

The seed command is configured in `package.json`:

```json
"prisma": {
  "seed": "ts-node --compiler-options {\"module\":\"CommonJS\"} prisma/seed.ts"
}
```

**What the seed creates:**

| Entity | Count |
|---|---|
| Permissions | 24 (4 actions × 6 resources) |
| Roles | 5 (ADMIN, SALES_MANAGER, PROJECT_MANAGER, ACCOUNTANT, CLIENT_PORTAL_USER) |
| Admin user | 1 (`admin@constructpro.com` / `Admin@1234!`) |

> **Note:** Change the admin password immediately after the first deployment.

---

## 6. Resetting the Development Database

`migrate reset` drops the entire database, re-applies all migrations from scratch, and re-runs the seed.

```bash
npx prisma migrate reset
```

> **WARNING: This deletes all data.** Only use this on a local or isolated development database, never in staging or production.

Use it when:

- You need a clean slate after a failed or messy migration.
- You want to replay all migrations to verify history is consistent.
- Seed data has drifted and you want to start fresh.

---

## 7. Test Database Setup

The test suite connects to a separate database specified by `DATABASE_URL_TEST`. The recommended approach is a **Neon branch**.

### Create a Neon Test Branch

**Via the Neon Console:**

1. Open your project at [console.neon.tech](https://console.neon.tech).
2. Go to **Branches** → **Create Branch**.
3. Name it `test` (or `ci-test`).
4. Copy the connection string for the new branch.
5. Set it as `DATABASE_URL_TEST` in your `.env`.

**Via the Neon CLI (`neonctl`):**

```bash
# Install the CLI
npm install -g neonctl

# Authenticate
neonctl auth

# Create a branch
neonctl branches create --name test --project-id <your-project-id>

# Get the connection string
neonctl connection-string --branch test --project-id <your-project-id>
```

### Apply Migrations to the Test Branch

Run the deploy command with the test URL as the direct connection:

```bash
DIRECT_URL="<test-branch-direct-url>" npx prisma migrate deploy
```

### Run Tests

```bash
npm test
# or with coverage
npm run test:cov
```

The test suite uses `DATABASE_URL_TEST` and cleans up all rows after each test — seed data on the test branch is never required.

---

## 8. Troubleshooting

### `P1000` — Authentication failed

```
Error: P1000: Authentication failed against database server
```

**Cause:** Wrong username, password, or database name in the connection string.  
**Fix:** Double-check `DATABASE_URL` (and `DIRECT_URL`) in `.env`. Ensure the role exists and the password has no special characters that need URL-encoding (`@`, `#`, `%` must be percent-encoded).

---

### `P1001` — SSL required / connection refused (general)

```
Error: P1001: Can't reach database server
```

**Cause:** Missing `?sslmode=require` on a Neon connection, or the host/port is wrong.  
**Fix:** Append `?sslmode=require` to both `DATABASE_URL` and `DIRECT_URL`. Confirm the host is the direct endpoint (not the pooler) when running Prisma CLI commands.

> For the specific case of `migrate deploy` failing on the Neon test branch, see **`P1001` on Neon test branch** below.

---

### `P3006` / Table not found after migration

```
Error: The table `public.User` does not exist in the current database.
```

**Cause:** Migrations have not been applied to the target database.  
**Fix:**

```bash
# For dev
npx prisma migrate dev

# For CI / production
npx prisma migrate deploy
```

If running tests, ensure `DATABASE_URL_TEST` points to a database where migrations have been applied.

---

### `migrate dev` hangs indefinitely

**Cause:** `DATABASE_URL` points to a Neon pooler endpoint. The migration engine requires a direct connection.  
**Fix:** Set `DIRECT_URL` to the direct (non-pooler) endpoint and reference it in `prisma.config.ts` or `schema.prisma` via `directUrl = env("DIRECT_URL")`.

---

### `P1001` on Neon test branch — `migrate deploy` fails even with correct credentials

```
Error: P1001: Can't reach database server at `<host>:5432`
```

**Cause:** Prisma's migration engine always uses a raw TCP connection on port 5432, regardless of whether you supply a pooler URL or a direct URL. Neon's pooler speaks HTTP/WebSocket (port 443), not TCP — so `migrate deploy` cannot reach it. The direct endpoint only responds on port 5432 when the branch's compute is **Active**; idle or Schema-only branches drop the connection.

**This affects `DIRECT_URL_TEST` in `prisma.config.ts`** — even setting it to the pooler URL does not help because Prisma ignores the protocol and always tries port 5432.

**Workaround — use the Neon SQL Editor (HTTP-based, bypasses port 5432)**

When you need to apply a new migration to the test branch, paste the migration SQL directly into the Neon console SQL Editor for that branch and run it. The SQL Editor uses Neon's HTTP API and works regardless of compute state.

Steps:
1. Open [console.neon.tech](https://console.neon.tech) → your project → **Branches** → **test**
2. Click **SQL Editor**
3. Paste the migration SQL from `prisma/migrations/<migration-folder>/migration.sql`
4. Click **Run**

> **Note:** Running SQL manually does not write a record to the `_prisma_migrations` table. Because all ConstructPro migrations use `CREATE TABLE IF NOT EXISTS`, `CREATE INDEX IF NOT EXISTS`, and guarded `DO $$` blocks, the SQL is safe to re-run. When the test branch compute is eventually active and you run `npx prisma migrate deploy`, Prisma will re-execute the SQL (which is a no-op due to `IF NOT EXISTS`) and record the migration properly.

---

### `P2002` — Unique constraint violation in seed

```
Error: P2002: Unique constraint failed on the fields: (`roleName`)
```

**Cause:** Seed has already been run and records exist.  
**Fix:** The ConstructPro seed uses `upsert`/`findFirst` guards and is idempotent. If you still hit this, reset and re-seed:

```bash
npx prisma migrate reset
```

---

## 9. Migration History

All migration files live in `prisma/migrations/`. Each directory name encodes a UTC timestamp and a short description.

---

### `20260611000001_add_cascade_deletes`

Tightened referential integrity by upgrading three FK constraints from `RESTRICT` / `SET NULL` to `CASCADE`:

| Table | Column | Old behaviour | New behaviour |
|---|---|---|---|
| `RefreshToken` | `userId` | `RESTRICT` | `CASCADE` — tokens are deleted when the parent `User` is deleted |
| `Customer` | `leadId` | `SET NULL` | `CASCADE` — customer record is deleted when the parent `Lead` is deleted |
| `QuotationItem` | `quotationId` | `RESTRICT` | `CASCADE` — line items are deleted when the parent `Quotation` is deleted |

---

### `20260618000001_add_quotation_tables`

Restructured the quotation data model to link quotations to `Lead` instead of directly to `Customer`, and aligned the table with the CRM flow:

- Dropped the old `Quotation` and `QuotationItem` tables and the `quotationId` column on `Project`.
- Created new `quotation` and `quotation_item` tables (lowercase, mapped names).
- `quotation.leadId` → `Lead` (`RESTRICT`); `quotation.projectId` → `Project` (`SET NULL`).
- `quotation_item.quotationId` → `quotation` (`CASCADE`).
- Added `CONVERTED` value to the `QuotationStatus` enum.

---

### `20260622000001_ddp23_invoice_crud`

DDP-23 — Invoice CRUD and project invoice generation:

- Renamed `InvoiceStatus` enum value `SENT` → `ISSUED`.
- Added `PARTIALLY_PAID` value to `InvoiceStatus`.
- Added `notes`, `createdBy`, and `updatedBy` columns to `Invoice`.
- Changed `Invoice.totalAmount` precision to `DECIMAL(12,2)`.
- Created indexes: `Invoice_projectId_idx`, `Invoice_customerId_idx`, `Invoice_status_idx`.

---

### `20260622000002_ddp24_payment_tracking`

DDP-24 — Payment tracking and persisted invoice balances:

- Added `paidAmount DECIMAL(12,2)` and `outstandingAmount DECIMAL(12,2)` to `Invoice` (both default `0`).
- Added `referenceNumber TEXT UNIQUE NOT NULL`, `notes TEXT`, and `createdBy TEXT` to `Payment`.
- Changed `Payment.amount` precision to `DECIMAL(12,2)`.
- Backfilled `paidAmount`, `outstandingAmount`, and `status` on all existing invoices from existing payment history.
- Created indexes: `Payment_referenceNumber_key` (unique), `Payment_invoiceId_idx`, `Payment_paymentDate_idx`.

---

### `20260622000003_ddp26_invoice_number_pdf`

DDP-26 — Invoice numbering and PDF support:

- Added `invoiceNumber TEXT UNIQUE`, `pdfPath TEXT`, `pdfUrl TEXT`, and `pdfGeneratedAt TIMESTAMP` to `Invoice`.
- Created unique index `Invoice_invoiceNumber_key` and regular index `Invoice_invoiceNumber_idx`.

---

### `20260624000001_ddp32_ai_knowledge_chunks`

DDP-32 — AI knowledge chunk storage with vector embeddings:

- Enabled the `pgvector` PostgreSQL extension (`CREATE EXTENSION IF NOT EXISTS vector`).
- Created `AiKnowledgeSourceType` enum (`PROJECT`, `MILESTONE`, `INVOICE`, `PAYMENT`, `EXPENSE`).
- Created `ai_knowledge_chunks` table with a `vector(1536)` embedding column and `onDelete: CASCADE` from `Project`.
- Created indexes: `ai_knowledge_chunks_projectId_idx`, `ai_knowledge_chunks_sourceType_sourceId_idx`, and an IVFFlat index on the embedding column for approximate nearest-neighbour search.

---

### `20260624000002_ddp33_rag_indexing_retrieval`

DDP-33 — RAG indexing and retrieval:

- Added a unique composite index `ai_knowledge_chunks_projectId_sourceType_sourceId_key` on `(projectId, sourceType, sourceId)` to prevent duplicate chunks per source entity.
