# Prisma + NeonDB Workflow

## Setup overview

| File | Purpose |
|---|---|
| `prisma/schema.prisma` | Single source of truth — all models live here |
| `prisma/seed.ts` | Idempotent seed — permissions, roles, and the default admin user |
| `prisma.config.ts` | Prisma v7 CLI config — points the CLI at the database via `DIRECT_URL` |
| `.env` | Connection strings (git-ignored) |
| `scripts/apply-schema.sql` | Generated SQL — always regenerated before applying |
| `scripts/run-migration.mjs` | Applies the SQL to NeonDB via the HTTP/WebSocket driver |

### Why the custom script instead of `prisma migrate dev`?

**Port 5432 is completely unreachable on this network** — both the direct endpoint and the pooler endpoint are blocked. The `@neondatabase/serverless` driver connects via **HTTPS/WebSocket on port 443**, which is always open. `run-migration.mjs` uses that driver to apply SQL, and `prisma/seed.ts` uses the same driver via `PrismaNeon` adapter so it can also reach the database.

---

## Making a schema change (the day-to-day workflow)

### Step 1 — Edit `prisma/schema.prisma`

Add your new model, field, enum, or relation. Example — adding a `Notification` model:

```prisma
model Notification {
  id        String   @id @default(uuid())
  userId    String
  message   String
  read      Boolean  @default(false)
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  user User @relation(fields: [userId], references: [id])
}
```

Don't forget to add the back-relation to `User` if needed:
```prisma
model User {
  // ... existing fields ...
  notifications Notification[]
}
```

---

### Step 2 — Generate the migration SQL

This compares the last-applied schema snapshot against the current schema and outputs only the **diff** (the changes needed). No database connection required.

```powershell
npx prisma migrate diff `
  --from-schema prisma/schema.applied.prisma `
  --to-schema prisma/schema.prisma `
  --script | Out-File -Encoding utf8 scripts/apply-schema.sql
```

> **Never use `>` to redirect the output on PowerShell.** PowerShell's `>` writes UTF-16 LE, which Node.js reads as garbled UTF-8 and PostgreSQL rejects with "invalid message format". Always pipe to `Out-File -Encoding utf8`.

> `prisma/schema.applied.prisma` is a snapshot of what is currently in the database. After every successful migration (Step 4), copy `schema.prisma` over it to keep it in sync — see Step 4 below.

**First time ever / fresh database only:** Use `--from-empty` instead:
```powershell
npx prisma migrate diff `
  --from-empty `
  --to-schema prisma/schema.prisma `
  --script | Out-File -Encoding utf8 scripts/apply-schema.sql
```

---

### Step 3 — Review the generated SQL

Open `scripts/apply-schema.sql` and verify it contains only what you expect — no accidental `DROP TABLE` or `ALTER COLUMN` that would lose data.

> **dotenvx header:** The `npx prisma` command may prepend a status line like `◇ injected env (6) from .env ...` at the top of the file. Delete that line before applying — it is not SQL and will cause an "invalid message format" error.

---

### Step 4 — Apply the migration

```bash
node scripts/run-migration.mjs
```

The script applies each statement one by one and prints a result for each:
- `✓` — applied successfully
- `⚠ skipped (already exists)` — already in the database, safe to ignore
- `✗ FAILED` — something went wrong; the script stops and prints the error

Once it succeeds, **update the snapshot** so the next diff is correct:

```bash
# Windows (PowerShell)
Copy-Item prisma/schema.prisma prisma/schema.applied.prisma

# Mac / Linux
cp prisma/schema.prisma prisma/schema.applied.prisma
```

---

### Step 5 — Regenerate the Prisma client

After any schema change, regenerate the TypeScript client so your code reflects the new types:

```bash
npx prisma generate
```

---

### Step 6 — Seed the database (fresh environments only)

Run the seed after applying migrations to a database that has no data yet — a new developer environment, a staging reset, or any fresh NeonDB branch:

```bash
npx prisma db seed
```

The seed is idempotent — running it twice is safe and will not create duplicates. It uses `DATABASE_URL` (the pooler endpoint) which works on this network.

Expected output:
```
Seeded permissions: 24
Seeded roles: 5
Seeded role-permission assignments: 35
Seeded admin user: admin@constructpro.com
```

> **Skip this step** if the database already has data — the seed only creates missing records, but it is still unnecessary noise in an already-populated environment.

---

## Full example end-to-end

```bash
# 1. Edit prisma/schema.prisma (add your model)

# 2. Generate the diff SQL (no DB connection needed)
# Use Out-File -Encoding utf8, NOT > (PowerShell > writes UTF-16 which breaks the migration script)
npx prisma migrate diff --from-schema prisma/schema.applied.prisma --to-schema prisma/schema.prisma --script | Out-File -Encoding utf8 scripts/apply-schema.sql

# 3. Review scripts/apply-schema.sql

# 4. Apply to NeonDB
node scripts/run-migration.mjs

# 4b. Update the snapshot
Copy-Item prisma/schema.prisma prisma/schema.applied.prisma

# 5. Regenerate client
npx prisma generate

# 6. Seed (fresh environment only)
npx prisma db seed
```

---

## Connection string reference

```
# .env

# Used by the app at runtime (NestJS via @neondatabase/serverless)
DATABASE_URL=postgresql://...@ep-xxx-pooler.region.aws.neon.tech/neondb?sslmode=require

# Used by Prisma CLI and run-migration.mjs for migrations
DIRECT_URL=postgresql://...@ep-xxx-pooler.region.aws.neon.tech/neondb?sslmode=require
```

> Port 5432 is unreachable from this network on **both** endpoints (pooler and direct). All DB operations go through the Neon serverless driver on port 443. `DIRECT_URL` is still needed by the Prisma CLI for commands that read config — but it is never actually dialled over TCP in this setup.

---

## Useful Prisma commands (no DB connection needed)

| Command | What it does |
|---|---|
| `npx prisma generate` | Regenerates the TypeScript client from schema |
| `npx prisma format` | Auto-formats `schema.prisma` |
| `npx prisma validate` | Validates the schema without touching the DB |

## Useful Prisma commands (DB connection required)

| Command | What it does |
|---|---|
| `npx prisma db seed` | Runs `prisma/seed.ts` — permissions, roles, admin user |

> `prisma migrate diff` no longer needs a DB connection — it now uses `--from-schema` to compare two local schema files.

---

## What NOT to do

- **Do not run `npx prisma migrate dev`** — it requires TCP port 5432 and will fail.
- **Do not run `npx prisma db push`** — same reason.
- **Do not edit `scripts/apply-schema.sql` by hand** — always regenerate it with `migrate diff`.
- **Do not commit `.env`** — it contains database credentials. It is already git-ignored.
