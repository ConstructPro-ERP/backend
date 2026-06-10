# Migration Guide — ConstructPro ERP Data Layer

## 1. Prerequisites

| Requirement | Version |
|---|---|
| Node.js | 20 LTS or later |
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

### `P1001` — SSL required / connection refused

```
Error: P1001: Can't reach database server
```

**Cause:** Missing `?sslmode=require` on a Neon connection, or the host/port is wrong.  
**Fix:** Append `?sslmode=require` to both `DATABASE_URL` and `DIRECT_URL`. Confirm the host is the direct endpoint (not the pooler) when running Prisma CLI commands.

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

## 9. Migration History — Sprint 5

All three migrations below were shipped in Sprint 5 as part of the Data Layer initiative (feature branch `feature/7-prisma-schema-setup`).

### Migration 1 — Auth Models

**Name:** `0001_auth_models`

Creates the authentication and access-control foundation:

| Model | Purpose |
|---|---|
| `Role` | Named roles (`ADMIN`, `SALES_MANAGER`, etc.) |
| `Permission` | Action + resource pairs (`create:users`, `read:leads`, …) |
| `RolePermission` | Junction table linking roles to permissions (composite PK) |
| `User` | Application users with `email` unique constraint and `status` enum |
| `RefreshToken` | JWT refresh tokens tied to a `User` |
| `AuditLog` | Append-only audit trail for mutations |

Enums introduced: `UserStatus` (`ACTIVE`, `INACTIVE`).

---

### Migration 2 — CRM & Sales Models

**Name:** `0002_crm_models`

Adds the customer relationship management layer:

| Model | Purpose |
|---|---|
| `Lead` | Inbound or prospected contacts; optional assignment to a `User` |
| `Customer` | Converted leads; optional 1-to-1 back-link to `Lead` via `leadId` |
| `Quotation` | Sales quotations linked to a `Customer` |
| `QuotationItem` | Line items within a quotation |

Enums introduced: `LeadStatus` (`NEW`, `CONTACTED`, `QUALIFIED`, `CONVERTED`, `LOST`), `QuotationStatus` (`DRAFT`, `PENDING_APPROVAL`, `APPROVED`, `REJECTED`).

---

### Migration 3 — Operations, Finance & Documents

**Name:** `0003_operations_finance_documents`

Adds the full project execution, finance, and document management layer:

| Model | Purpose |
|---|---|
| `Project` | Core project entity; linked to a `Quotation` and a project manager `User` |
| `Milestone` | Phases within a project |
| `Task` | Work items within a project, optionally assigned to a `Milestone` and `User` |
| `Expense` | Cost entries recorded against a project |
| `Invoice` | Billing documents linking a project to a `Customer` |
| `Payment` | Payments received against an `Invoice` |
| `DocumentCategory` | Classification labels for uploaded files |
| `Document` | Files uploaded against a project with an optional uploader |
| `AnalyticsReport` | Aggregated financial/progress snapshots per project |

Enums introduced: `ProjectStatus`, `MilestoneStatus`, `TaskStatus`, `InvoiceStatus`, `PaymentMethod`.
