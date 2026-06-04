# Prisma + NeonDB Workflow

## Setup overview

| File | Purpose |
|---|---|
| `prisma/schema.prisma` | Single source of truth — all models live here |
| `prisma.config.ts` | Prisma v7 CLI config — points the CLI at the database via `DIRECT_URL` |
| `.env` | Connection strings (git-ignored) |
| `scripts/apply-schema.sql` | Generated SQL — always regenerated before applying |
| `scripts/run-migration.mjs` | Applies the SQL to NeonDB via the HTTP/WebSocket driver |

### Why the custom script instead of `prisma migrate dev`?

Prisma CLI migrations (`migrate dev`, `db push`) require a direct TCP connection on **port 5432**. This port is blocked on this network. The `@neondatabase/serverless` driver connects via **HTTPS/WebSocket on port 443**, which is always open. `run-migration.mjs` uses that driver to apply the generated SQL.

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

This compares your current schema against what is already in the database and outputs only the **diff** (the changes needed).

```bash
npx prisma migrate diff \
  --from-config-datasource \
  --to-schema prisma/schema.prisma \
  --script > scripts/apply-schema.sql
```

> `--from-config-datasource` tells Prisma to introspect the live database (via `DIRECT_URL` in `prisma.config.ts`) as the "before" state. This ensures you only apply the net-new changes, not the full schema again.

**First time ever / fresh database only:** Use `--from-empty` instead:
```bash
npx prisma migrate diff \
  --from-empty \
  --to-schema prisma/schema.prisma \
  --script > scripts/apply-schema.sql
```

---

### Step 3 — Review the generated SQL

Open `scripts/apply-schema.sql` and verify it contains only what you expect — no accidental `DROP TABLE` or `ALTER COLUMN` that would lose data.

---

### Step 4 — Apply the migration

```bash
node scripts/run-migration.mjs
```

The script applies each statement one by one and prints a result for each:
- `✓` — applied successfully
- `⚠ skipped (already exists)` — already in the database, safe to ignore
- `✗ FAILED` — something went wrong; the script stops and prints the error

---

### Step 5 — Regenerate the Prisma client

After any schema change, regenerate the TypeScript client so your code reflects the new types:

```bash
npx prisma generate
```

---

## Full example end-to-end

```bash
# 1. Edit prisma/schema.prisma (add your model)

# 2. Generate the diff SQL
npx prisma migrate diff --from-config-datasource --to-schema prisma/schema.prisma --script > scripts/apply-schema.sql

# 3. Review scripts/apply-schema.sql

# 4. Apply to NeonDB
node scripts/run-migration.mjs

# 5. Regenerate client
npx prisma generate
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

> Both currently point to the pooler endpoint because the direct endpoint (port 5432) is unreachable from this network. If you ever have direct TCP access, switch `DIRECT_URL` to the non-pooler hostname (`ep-xxx.region.aws.neon.tech`).

---

## Useful Prisma commands (no DB connection needed)

| Command | What it does |
|---|---|
| `npx prisma generate` | Regenerates the TypeScript client from schema |
| `npx prisma format` | Auto-formats `schema.prisma` |
| `npx prisma validate` | Validates the schema without touching the DB |

---

## What NOT to do

- **Do not run `npx prisma migrate dev`** — it requires TCP port 5432 and will fail.
- **Do not run `npx prisma db push`** — same reason.
- **Do not edit `scripts/apply-schema.sql` by hand** — always regenerate it with `migrate diff`.
- **Do not commit `.env`** — it contains database credentials. It is already git-ignored.
