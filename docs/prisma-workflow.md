# Prisma + NeonDB Workflow

## Setup overview

| File | Purpose |
|---|---|
| `prisma/schema.prisma` | Single source of truth — all models live here |
| `prisma/schema.applied.prisma` | Snapshot of what is currently in the database |
| `prisma/seed.ts` | Idempotent seed — permissions, roles, and the default admin user |
| `prisma.config.ts` | Prisma v7 CLI config — points the CLI at the database |
| `scripts/apply-schema.sql` | Generated SQL — always regenerated before applying |
| `scripts/run-migration.mjs` | Applies the SQL to NeonDB via the HTTP/WebSocket driver |

### Why not `prisma migrate dev`?

**Port 5432 is blocked on this network.** The `@neondatabase/serverless` driver connects via HTTPS/WebSocket on port 443, which is always open. `run-migration.mjs` uses that driver to apply SQL directly.

---

## Making a schema change — step by step

### Step 1 — Edit `prisma/schema.prisma`

Add your model, field, enum, or relation. Example:

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

If the model has a relation to `User`, also add the back-relation in the `User` model:

```prisma
model User {
  // ... existing fields ...
  notifications Notification[]
}
```

---

### Step 2 — Generate the migration SQL

This compares `schema.applied.prisma` (what is in the database) against `schema.prisma` (what you want) and writes only the **diff** to `scripts/apply-schema.sql`. No database connection is needed.

```powershell
npx prisma migrate diff --from-schema prisma/schema.applied.prisma --to-schema prisma/schema.prisma --script -o scripts/apply-schema.sql
```

> **Use the `-o` flag, not `>` or `Out-File`.** The `-o` flag writes only the SQL to the file. PowerShell's `>` writes UTF-16 LE, which Node.js reads as garbled text and PostgreSQL rejects with "invalid message format". Piping to `Out-File -Encoding utf8` also risks including a dotenvx status line at the top of the file, which is not SQL.

**First time / fresh database only** — use `--from-empty` instead of `--from-schema`:

```powershell
npx prisma migrate diff --from-empty --to-schema prisma/schema.prisma --script -o scripts/apply-schema.sql
```

---

### Step 3 — Review the generated SQL

Open `scripts/apply-schema.sql` and confirm it contains only what you expect — no accidental `DROP TABLE` or destructive `ALTER COLUMN`.

The file should start directly with SQL (e.g. `CREATE TABLE`, `ALTER TABLE`, `CREATE TYPE`). If you see a line like `◇ injected env ...` at the top, delete it — it is not SQL and will cause an error.

---

### Step 4 — Apply the migration

```powershell
node scripts/run-migration.mjs
```

The script applies each SQL statement one at a time and prints:
- `✓` — applied successfully
- `⚠ skipped (already exists)` — already in the database, safe to ignore
- `✗ FAILED` — something went wrong; the script stops and prints the error

---

### Step 5 — Update the snapshot

After a successful migration, copy `schema.prisma` over `schema.applied.prisma` so the next diff is calculated correctly:

```powershell
Copy-Item prisma/schema.prisma prisma/schema.applied.prisma
```

---

### Step 6 — Regenerate the Prisma client

```powershell
npx prisma generate
```

This regenerates the TypeScript client so your code reflects the new types.

---

### Step 7 — Seed (fresh environments only)

Run this only if the database has no data yet (new dev environment, staging reset, fresh NeonDB branch):

```powershell
npx prisma db seed
```

The seed is idempotent — running it twice is safe. Expected output:

```
Seeded permissions: 24
Seeded roles: 5
Seeded role-permission assignments: 35
Seeded admin user: admin@constructpro.com
```

---

## Quick reference — full workflow

```powershell
# 1. Edit prisma/schema.prisma

# 2. Generate the diff SQL (no DB connection needed)
npx prisma migrate diff --from-schema prisma/schema.applied.prisma --to-schema prisma/schema.prisma --script -o scripts/apply-schema.sql

# 3. Review scripts/apply-schema.sql

# 4. Apply to NeonDB
node scripts/run-migration.mjs

# 5. Update the snapshot
Copy-Item prisma/schema.prisma prisma/schema.applied.prisma

# 6. Regenerate the client
npx prisma generate

# 7. Seed (fresh environment only)
npx prisma db seed
```

---

## Useful commands (no DB connection needed)

| Command | What it does |
|---|---|
| `npx prisma generate` | Regenerates the TypeScript client from schema |
| `npx prisma format` | Auto-formats `schema.prisma` |
| `npx prisma validate` | Validates the schema without touching the DB |

## Useful commands (DB connection required)

| Command | What it does |
|---|---|
| `npx prisma db seed` | Runs `prisma/seed.ts` — permissions, roles, admin user |

---

## Connection strings

```
# .env

# Used by the app at runtime and by run-migration.mjs
DATABASE_URL=postgresql://...@ep-xxx-pooler.region.aws.neon.tech/neondb?sslmode=require

# Used by the Prisma CLI
DIRECT_URL=postgresql://...@ep-xxx-pooler.region.aws.neon.tech/neondb?sslmode=require
```

Port 5432 is unreachable from this network. All DB operations go through the Neon serverless driver on port 443.

---

## What NOT to do

- **Do not run `npx prisma migrate dev`** — requires TCP port 5432, will fail.
- **Do not run `npx prisma db push`** — same reason.
- **Do not use `>` or `Out-File` to write the SQL** — use the `-o` flag on `migrate diff` instead.
- **Do not edit `scripts/apply-schema.sql` by hand** — always regenerate it with `migrate diff`.
- **Do not commit `.env`** — it contains database credentials and is already git-ignored.
