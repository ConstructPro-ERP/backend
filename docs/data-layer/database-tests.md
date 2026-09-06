# Database Integration Tests — ConstructPro ERP

**File:** `src/database/__tests__/database.spec.ts`  
**Runner:** Jest (configured in `package.json`)  
**Database:** NeonDB (PostgreSQL) — isolated test branch via `DATABASE_URL_TEST`

---

## How to Run

```powershell
# Run only the database spec
npm test -- --testPathPatterns="database.spec"

# Run with coverage
npm run test:cov -- --testPathPatterns="database.spec"

# Run all tests in the project
npm test
```

> **Note:** Jest 30 renamed `--testPathPattern` (singular) to `--testPathPatterns` (plural). Always use the plural form.

---

## What Kind of Tests Are These

These are **integration tests**, not unit tests. They connect to a real PostgreSQL database (your Neon test branch) and execute actual SQL. Nothing is mocked.

This means they verify:
- That Prisma models map correctly to real database tables
- That foreign key constraints and cascade rules defined in `schema.prisma` are enforced by the database engine
- That Prisma `include` (JOIN) queries return the correct related records
- That unique constraints reject duplicate data with the expected Prisma error code

Unit tests mock everything and only test business logic in isolation. Integration tests like these catch problems that mocks never would — wrong FK direction, missing cascade rules, incorrect column types.

---

## Prerequisites

Before running these tests you need:

1. A separate Neon branch for testing (not your production or dev branch)
2. `DATABASE_URL_TEST` set in `.env` pointing to that branch's **pooler** connection string
3. All migrations deployed to the test branch (see `docs/data-layer/migration-guide.md` section 7)

```dotenv
DATABASE_URL_TEST=postgresql://<user>:<password>@<test-branch-pooler-host>/<db>?sslmode=require
```

---

## How the Test File is Structured

### 1. Connection setup

```ts
import { PrismaClient } from '@prisma/client';
import { PrismaNeon } from '@prisma/adapter-neon';
import { neonConfig } from '@neondatabase/serverless';
import ws from 'ws';

neonConfig.webSocketConstructor = ws;

const adapter = new PrismaNeon({
  connectionString: process.env.DATABASE_URL_TEST!,
});
const prisma = new PrismaClient({ adapter });
```

- **`PrismaNeon` adapter** — NeonDB uses HTTP/WebSocket transport (port 443) instead of raw TCP (port 5432). The adapter tells Prisma to use `@neondatabase/serverless` for all queries. Without it, Prisma would try port 5432 and fail against a Neon serverless endpoint.
- **`neonConfig.webSocketConstructor = ws`** — Neon's serverless driver needs a WebSocket implementation. In a browser it uses the built-in WebSocket API; in Node.js we supply the `ws` package manually.
- **`process.env.DATABASE_URL_TEST`** — The connection string is read from the environment, never hardcoded. This keeps credentials out of source control and makes it easy to point at different branches.

---

### 2. Timeout

```ts
jest.setTimeout(30000);
```

NeonDB connections go over the internet. Each query has network latency on top of normal database time. The default Jest timeout of 5 seconds is too short — even a single `prisma.role.create()` can take 1–2 seconds over a transatlantic connection. `30000` (30 seconds) gives each test and each lifecycle hook enough headroom.

---

### 3. `cleanDatabase` function

```ts
async function cleanDatabase() {
  await prisma.$executeRawUnsafe(`
    TRUNCATE TABLE
      "Payment", "Invoice", "AnalyticsReport", "Task", "Expense",
      "Document", "Milestone", "Project",
      "quotation_item", "quotation",
      "Lead", "Customer", "AuditLog", "RefreshToken", "RolePermission",
      "User", "Permission", "Role", "DocumentCategory"
    CASCADE
  `);
}
```

This deletes every row from every table in one SQL statement.

**Why `TRUNCATE` instead of calling `prisma.<model>.deleteMany()` for each table?**

The first version of this function called `deleteMany()` 20 times in sequence — one per table. Each call is a separate round trip to NeonDB, so cleanup alone took 10–15 seconds per test, which caused the lifecycle hooks (`beforeAll`, `afterEach`) to hit the 30-second timeout.

`TRUNCATE TABLE ... CASCADE` is a single SQL statement. PostgreSQL empties all listed tables atomically and follows the `CASCADE` keyword to also clear any child tables that have a foreign key pointing at a listed table. Total time: under 1 second.

**Why `CASCADE` on `TRUNCATE`?**

Some tables have foreign keys to tables in the list. Without `CASCADE`, PostgreSQL would raise a constraint error if a child table still has rows. `CASCADE` tells it to also truncate those child tables in the correct order automatically.

**Why is `ai_knowledge_chunks` not listed?**

That table's FK to `Project` has `onDelete: Cascade` in the schema, so truncating `"Project"` cascades to it automatically. It is also excluded because the migration that creates it (`20260624000001_ddp32_ai_knowledge_chunks`) may not yet be deployed to the test branch — see `docs/data-layer/migration-guide.md` for details.

---

### 4. Lifecycle hooks

```ts
beforeAll(async () => {
  await prisma.$connect();
  await cleanDatabase();
});

afterAll(async () => {
  await prisma.$disconnect();
});

afterEach(cleanDatabase);
```

| Hook | When it runs | What it does |
|---|---|---|
| `beforeAll` | Once, before the first test | Opens the DB connection and wipes any stale data left by a previous failed run |
| `afterAll` | Once, after the last test | Closes the DB connection cleanly |
| `afterEach` | After every single test | Wipes all test data so the next test starts with a completely empty database |

**Why clean in `beforeAll` as well as `afterEach`?**

If a test run crashes mid-way (process killed, power cut, connection dropped), `afterEach` never runs and stale data remains in the test database. The next run would then fail immediately because a `create` for a unique field (e.g. `roleName: 'TEST_ROLE'`) would hit a duplicate constraint. The `beforeAll` cleanup is a safety net that guarantees a clean slate regardless of what the previous run left behind.

---

### 5. AAA pattern

Every test follows the **Arrange / Act / Assert** pattern, marked with inline comments:

```ts
// Arrange  — set up the data needed for the test
// Act      — perform the operation being tested
// Assert   — verify the result
```

This keeps each test readable as a story: what exists before, what happens, what should be true after.

---

### 6. Test naming — Given-When-Then

All tests are named using the **Given-When-Then** style:

```
'should [expected result] given [precondition]'
```

Examples:
- `'should create a user and find it by email given all required fields are provided'`
- `'should throw a Prisma P2002 error given a duplicate email is inserted'`
- `'should cascade delete RefreshTokens given the parent User is deleted'`

This naming makes test output self-documenting. When a test fails in CI, the failure message tells you exactly what broke and under what condition, without having to read the test code.

---

## Test Groups

### `describe('User model')` — 3 tests

Tests the `User` model and its relationship with `Role` and `RefreshToken`.

---

**`should create a user and find it by email given all required fields are provided`**

Creates a `Role`, then creates a `User` linked to that role, then fetches the user back with `findUnique` using the email as the lookup key.

Verifies:
- The returned record is not null
- The `id` matches the one returned by `create`
- `fullName` is stored correctly
- `status` defaults to `'ACTIVE'` without being explicitly set (schema default)

---

**`should throw a Prisma P2002 error given a duplicate email is inserted`**

Creates a user, then tries to create a second user with the exact same email address.

Verifies that Prisma throws a `PrismaClientKnownRequestError` with `code: 'P2002'` — the code for a unique constraint violation. This confirms the `@unique` constraint on `User.email` is enforced at the database level, not just in application code.

---

**`should cascade delete RefreshTokens given the parent User is deleted`**

Creates a `User` and a `RefreshToken` linked to that user, then deletes the user directly.

Verifies that `RefreshToken` rows are automatically deleted by the database because `RefreshToken.userId` has `onDelete: Cascade` in the schema. After the user is deleted, `findMany` on `RefreshToken` for that userId returns an empty array.

This test catches a regression if someone accidentally removes the cascade rule from the schema.

---

### `describe('Role and Permission')` — 2 tests

Tests the RBAC (Role-Based Access Control) data model: `Role`, `Permission`, and the `RolePermission` junction table.

---

**`should create a Role and assign a Permission via the RolePermission junction given valid IDs`**

Creates a `Role` and a `Permission` separately, then links them by creating a `RolePermission` record with both IDs.

Fetches the role back using `include: { permissions: { include: { permission: true } } }` — a two-level nested include that traverses the junction table.

Verifies the permission's `action` and `resource` are correct on the returned object.

`RolePermission` is a **junction table** (also called a join table or associative table). It has no auto-generated ID — its primary key is the composite `[roleId, permissionId]`. This pattern is how Prisma models many-to-many relationships explicitly, giving you control over extra fields you might add to the junction in future.

---

**`should return a User with their Role and Permissions given Prisma include is used`**

Sets up a full chain: `Permission` → `RolePermission` → `Role` → `User`.

Fetches the user with a deeply nested `include` that joins all four tables in one query:

```ts
include: {
  role: {
    include: {
      permissions: { include: { permission: true } }
    }
  }
}
```

Verifies that the user's role name and the permission's action/resource are all accessible on the single returned object. This is the same query pattern used in the auth service to check whether a user has a specific permission.

---

### `describe('Client and Lead')` — 2 tests

Tests the CRM models: `Lead` and `Customer`.

**Relationship direction:** A `Lead` is a sales prospect. When a lead converts, a `Customer` record is created and linked back to the lead via `Customer.leadId`. The FK lives on `Customer`, not on `Lead`. One Lead can have at most one Customer (the `leadId` column is `@unique`).

---

**`should create a Client and attach a Lead to it given both entities are created and linked`**

Creates a `Lead` with status `QUALIFIED`, then creates a `Customer` with `leadId` set to that lead's ID.

Fetches the customer back using `include: { lead: true }` and verifies the joined lead record has the correct `customerName` and `status`.

---

**`should cascade delete the linked Customer given the parent Lead is deleted`**

Creates a Lead–Customer pair, then deletes only the Lead.

Verifies that the Customer is automatically deleted because `Customer.leadId` has `onDelete: Cascade`. After the Lead is deleted, `findUnique` on the Customer returns `null`.

Note: the cascade runs **Lead → Customer**, not Customer → Lead. Deleting a Customer does not delete the Lead.

---

### `describe('Quotation and QuotationItem')` — 2 tests

Tests the quotation data model. `Quotation` belongs to a `Lead` via `quotation.leadId`. `QuotationItem` belongs to a `Quotation` via `quotation_item.quotationId`.

---

**`should create a Quotation with nested QuotationItems given a Lead exists`**

Creates a `Lead`, then creates a `Quotation` with two `QuotationItem` records using Prisma's nested `create` syntax inside the same call:

```ts
prisma.quotation.create({
  data: {
    leadId: lead.id,
    totalAmount: 4500,
    items: {
      create: [
        { itemName: 'Foundation Work', quantity: 1, unitPrice: 2000, amount: 2000 },
        { itemName: 'Roofing',         quantity: 5, unitPrice: 500,  amount: 2500 },
      ],
    },
  },
  include: { items: true },
});
```

Verifies `totalAmount`, the count of items, and the item names. `totalAmount` is a `Decimal` type in the database — it must be converted with `Number()` before comparing to a JavaScript number literal.

---

**`should cascade delete QuotationItems given the parent Quotation is deleted`**

Creates a `Quotation` with two items, then deletes the quotation directly.

Verifies that both `QuotationItem` rows are gone because `quotation_item.quotationId` has `onDelete: Cascade`. `findMany` on items for that quotation ID returns an empty array.

---

### `describe('Project and Milestone')` — 2 tests

Tests `Project` and `Milestone`. Projects require a `projectManagerId` (a `User` FK), so these tests also create a `Role` and `User` in the Arrange step.

---

**`should create a Project linked to a Quotation given both a Lead and Quotation exist`**

The FK relationship here is unusual: **`Quotation` holds the FK to `Project`** (`quotation.projectId`), not the other way around. This means you cannot set the link at project creation time — you must update the quotation afterwards:

```ts
const project = await prisma.project.create({ data: { ... } });
await prisma.quotation.update({
  where: { id: quotation.id },
  data: { projectId: project.id },
});
```

Then fetches the project with `include: { quotation: true }` and verifies the quotation is accessible on the returned object.

This test documents the correct way to link a Project to a Quotation in the ConstructPro data model.

---

**`should cascade delete Milestones when the parent Project is deleted given Milestones are removed first`**

Creates a `Project` with two `Milestone` records, then cleans up.

Unlike `QuotationItem` or `RefreshToken`, **`Milestone.projectId` does NOT have `onDelete: Cascade`** — it defaults to `RESTRICT`. This means the database will refuse to delete a Project that still has Milestones attached, raising a foreign key constraint error.

The test demonstrates the correct deletion order for this relationship:

```ts
// Must delete children first
await prisma.milestone.deleteMany({ where: { projectId: project.id } });
// Only then can the parent be deleted
await prisma.project.delete({ where: { id: project.id } });
```

Verifies that both the milestones and the project are gone after this sequence.

This pattern applies to any model that references `Project` without an explicit `onDelete: Cascade`: `Milestone`, `Task`, `Expense`, `Invoice`, `Document`, `AnalyticsReport`.

---

## FK Cascade Reference

| Child table | FK column | `onDelete` behaviour |
|---|---|---|
| `RefreshToken` | `userId → User` | **CASCADE** — deleted with user |
| `Customer` | `leadId → Lead` | **CASCADE** — deleted with lead |
| `quotation_item` | `quotationId → quotation` | **CASCADE** — deleted with quotation |
| `ai_knowledge_chunks` | `projectId → Project` | **CASCADE** — deleted with project |
| `Milestone` | `projectId → Project` | **RESTRICT** — must delete manually first |
| `Task` | `projectId → Project` | **RESTRICT** — must delete manually first |
| `Expense` | `projectId → Project` | **RESTRICT** — must delete manually first |
| `Invoice` | `projectId → Project` | **RESTRICT** — must delete manually first |
| `Document` | `projectId → Project` | **RESTRICT** — must delete manually first |
| `AnalyticsReport` | `projectId → Project` | **RESTRICT** — must delete manually first |
| `quotation` | `projectId → Project` | **SET NULL** — `projectId` is set to null when project is deleted |

---

## Adding New Tests

1. Add a new `describe` block at the bottom of the file, or add a new `it` inside an existing block.
2. Follow the AAA pattern with `// Arrange`, `// Act`, `// Assert` comments.
3. Name the test `'should [result] given [condition]'`.
4. Do not clean up inside the test — `afterEach` handles it.
5. Do not share data between tests — every test must create everything it needs in its own Arrange step.
6. If the model you are testing has a `RESTRICT` FK parent, delete the record under test before deleting the parent (see the Milestone test as an example).
