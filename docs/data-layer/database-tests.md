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

NeonDB connections go over the internet. Each query has network latency on top of normal database time. The default Jest timeout of 5 seconds is too short — even a single `prisma.role.create()` can take 1–2 seconds. `30000` (30 seconds) gives each test and each lifecycle hook enough headroom.

---

### 3. `cleanDatabase` function (recommended)

> **Note:** `src/database/__tests__/database.spec.ts` currently cleans the database via sequential `deleteMany()` calls. The `TRUNCATE TABLE ... CASCADE` helper below is a recommended optimization if cleanup becomes a bottleneck on Neon.

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

The original approach called `deleteMany()` 20 times sequentially — one per table. Each call is a separate round trip to NeonDB, so cleanup alone took 10–15 seconds per test, causing lifecycle hooks to hit the 30-second timeout.

`TRUNCATE TABLE ... CASCADE` is a single SQL statement. PostgreSQL empties all listed tables atomically and the `CASCADE` keyword clears any child tables that have a foreign key pointing at a listed table. Total time: under 1 second.

**Why is `ai_knowledge_chunks` not listed?**

The FK on `ai_knowledge_chunks.projectId` has `onDelete: Cascade`, so truncating `"Project"` cascades to it automatically. It is also excluded because the migration that creates it (`20260624000001_ddp32_ai_knowledge_chunks`) may not yet be deployed to the test branch — see `docs/data-layer/migration-guide.md` for the Neon TCP/HTTP issue.

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

If a test run crashes mid-way (process killed, connection dropped), `afterEach` never runs and stale data remains in the test database. The next run would then fail immediately — for example, a `create` for a unique field like `roleName: 'TEST_ROLE'` would hit a duplicate constraint. The `beforeAll` cleanup is a safety net that guarantees a clean slate regardless of what the previous run left behind.

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

This makes test output self-documenting. When a test fails in CI, the failure message tells you exactly what broke and under what condition without having to read the test code.

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

Verifies that `RefreshToken` rows are automatically deleted because `RefreshToken.userId` has `onDelete: Cascade` in the schema. After the user is deleted, `findMany` on `RefreshToken` for that userId returns an empty array.

This test would catch a regression if someone accidentally removed the cascade rule from the schema.

---

### `describe('Role and Permission')` — 2 tests

Tests the RBAC (Role-Based Access Control) data model: `Role`, `Permission`, and the `RolePermission` junction table.

---

**`should create a Role and assign a Permission via the RolePermission junction given valid IDs`**

Creates a `Role` and a `Permission` separately, then links them by creating a `RolePermission` record with both IDs.

Fetches the role back using `include: { permissions: { include: { permission: true } } }` — a two-level nested include that traverses the junction table.

`RolePermission` is a **junction table** (also called a join table). It has no auto-generated ID — its primary key is the composite `[roleId, permissionId]`. This pattern models many-to-many relationships explicitly, giving you control to add extra fields to the junction later if needed.

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

**Relationship direction:** A `Lead` is a sales prospect. When a lead converts, a `Customer` record is created and linked back to the lead via `Customer.leadId`. The FK lives on `Customer`, not on `Lead`. One Lead can have at most one Customer because `leadId` is `@unique`.

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

Creates a `Lead`, then creates a `Quotation` with two `QuotationItem` records using Prisma's nested `create` syntax in a single call:

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

Fetches the project with `include: { quotation: true }` and verifies the quotation is accessible on the returned object.

This test documents the correct way to link a Project to a Quotation in the ConstructPro data model.

---

**`should cascade delete Milestones when the parent Project is deleted given Milestones are removed first`**

Creates a `Project` with two `Milestone` records, then cleans up.

Unlike `QuotationItem` or `RefreshToken`, **`Milestone.projectId` does NOT have `onDelete: Cascade`** — it defaults to `RESTRICT`. This means the database will refuse to delete a Project that still has Milestones attached.

The test demonstrates the correct deletion order:

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

1. Add a new `describe` block at the bottom of the file, or a new `it` inside an existing block
2. Follow the AAA pattern with `// Arrange`, `// Act`, `// Assert` comments
3. Name the test `'should [result] given [condition]'`
4. Do not clean up inside the test — `afterEach` handles it
5. Do not share data between tests — every test must create everything it needs in its own Arrange step
6. If the model you are testing has a `RESTRICT` FK parent, delete the child records before the parent (see the Milestone test as an example)

---

# Quotation Service — E2E Tests

**File:** `test/quotation-service/quotation.e2e-spec.ts`  
**Runner:** Jest (configured in `test/jest-e2e.json`)  
**Database:** NeonDB (PostgreSQL) — same test branch as the database integration tests  
**Env:** Set `DATABASE_URL_TEST` and set `DATABASE_URL` to the same test-branch connection string before running, so `PrismaService` does not connect to a non-test database.  
**HTTP client:** Supertest (spins up the full NestJS app in-process)

---

## How to Run

```powershell
# Run only the quotation E2E spec
npx jest --config test/jest-e2e.json --testPathPatterns="quotation.e2e-spec"

# Run all E2E specs
npx jest --config test/jest-e2e.json
```

---

## What Kind of Tests Are These

These are **HTTP-level E2E tests**. They:

- Bootstrap the real `QuotationModule` (controllers, services, Prisma) via `@nestjs/testing`
- Fire HTTP requests against a live in-process server using Supertest
- Connect to a real PostgreSQL database — nothing about the data layer is mocked
- Assert both the HTTP response **and** the resulting database state

The only things mocked are the three external HTTP clients that call services that are not yet deployed in the test environment:

| Provider | Mock behaviour |
|---|---|
| `DocumentClient` | `generatePdf` returns `null` (PDF skipped) |
| `ProjectClient` | `createFromQuotation` returns a pre-seeded `realProjectId` |
| `NotificationClient` | `notifyProjectCreated` resolves silently |

This is different from the database integration tests in `src/database/__tests__/database.spec.ts`, which only test the data layer directly and never touch HTTP routes.

---

## Test Module Setup

```ts
const module = await Test.createTestingModule({
  imports: [QuotationModule],
})
  .overrideProvider(DocumentClient)
  .useValue({ generatePdf: jest.fn().mockResolvedValue(null) })
  .overrideProvider(ProjectClient)
  .useValue(mockProjectClient)
  .overrideProvider(NotificationClient)
  .useValue({ notifyProjectCreated: jest.fn().mockResolvedValue(undefined) })
  .compile();

app = module.createNestApplication();
app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true, forbidNonWhitelisted: true }));
app.useGlobalFilters(new HttpExceptionFilter());
await app.init();
```

This mirrors exactly what `main.ts` does — same `ValidationPipe` options, same `HttpExceptionFilter` — so validation errors and exception shapes match the production app.

---

## FK Constraint Seeding (beforeAll)

`Quotation.projectId` is a foreign key to `Project`. When TC-E2E-009 and TC-E2E-010 need to seed or produce a `CONVERTED` quotation, a real `Project` row must exist in the database.

`beforeAll` creates the minimum chain required to satisfy all FK constraints:

```
Role → User → Project
```

```ts
const role    = await prisma.role.create({ data: { roleName: `e2e-role-${Date.now()}` } });
const user    = await prisma.user.create({ data: { ..., roleId: role.id } });
const project = await prisma.project.create({ data: { ..., projectManagerId: user.id } });
realProjectId = project.id;
```

`mockProjectClient.createFromQuotation` is then wired to return this `realProjectId` so the approve endpoint writes a valid FK value into `quotation.projectId`.

The `roleName` uses `Date.now()` as a suffix to avoid unique-constraint collisions if the test suite is run multiple times against the same database branch without a full cleanup.

---

## Lifecycle Hooks

| Hook | Scope | What it does |
|---|---|---|
| `beforeAll` | Once, before any test | Bootstraps the NestJS app; creates the Role/User/Project chain; wires `mockProjectClient` |
| `beforeEach` | Before every test | Cleans all quotation data; creates a fresh `Lead` and assigns its id to `leadId` |
| `afterEach` | After every test | Cleans `QuotationItem → Quotation → Lead` with `deleteMany` |
| `afterAll` | Once, after all tests | Runs a final cleanup; calls `app.close()` |

The `cleanQuotations` helper:

```ts
async function cleanQuotations() {
  await prisma.quotationItem.deleteMany();
  await prisma.quotation.deleteMany();
  await prisma.lead.deleteMany();
}
```

It does not delete the Role/User/Project created in `beforeAll` because those are needed for the full test run and are not generated by any test case.

---

## Test Cases

### `describe('POST /quotations')`

---

**TC-E2E-001 — returns 201 and persists quotation with items in DB**

Sends a valid `{ leadId, items: [Concrete, Steel] }` body. Asserts:
- HTTP 201
- `body.status === 'PENDING_APPROVAL'`
- `body.totalAmount === 2500` (5×200 + 10×150)
- `prisma.quotation.findUnique({ include: { items: true } })` returns the row with 2 items

This is the only test that asserts a DB side-effect on the happy path for creation.

---

**TC-E2E-002 — returns 400 VALIDATION_ERROR when items array is empty**

Sends `items: []`. Asserts HTTP 400 and `body.code === 'VALIDATION_ERROR'`.  
Caught by `@ArrayMinSize(1)` on `CreateQuotationDto.items`.

---

**TC-E2E-003 — returns 400 when leadId is missing from request body**

Sends a body with no `leadId`. Asserts HTTP 400 and `body.code === 'VALIDATION_ERROR'`.  
Caught by `@IsUUID()` + `@IsNotEmpty()` on `CreateQuotationDto.leadId`.

---

**TC-E2E-004 — returns 404 when leadId does not exist in the database**

Sends a well-formed UUID that is not in the `Lead` table. Asserts HTTP 404 and `body.code === 'LEAD_NOT_FOUND'`.  
Thrown by `QuotationService.create` after the `prisma.lead.findUnique` returns null.

---

**TC-E2E-005 — returns 403 when user has ACCOUNTANT role** *(skipped)*

Skipped with `it.skip()`. `QuotationController` does not yet have `@UseGuards(JwtAuthGuard, RolesGuard)` applied. Enable and populate the token once guards are wired.

---

**TC-E2E-006 — returns 401 when no Authorization header is provided** *(skipped)*

Skipped for the same reason as TC-E2E-005.

---

### `describe('GET /quotations/:id')`

---

**TC-E2E-007 — returns 200 with quotation data for a valid id**

Seeds a `Quotation` + one `QuotationItem` directly via `PrismaService`. Sends `GET /quotations/:id`. Asserts:
- HTTP 200
- `body.id` matches the seeded quotation
- `body.items` has length 1

---

**TC-E2E-008 — returns 404 for a non-existent quotation id**

Sends `GET /quotations/00000000-0000-0000-0000-000000000000`. Asserts HTTP 404 and `body.code === 'QUOTATION_NOT_FOUND'`.

---

### `describe('PATCH /quotations/:id/approve')`

---

**TC-E2E-009 — returns 200 and flips status to CONVERTED with a projectId**

Seeds a `PENDING_APPROVAL` quotation. Calls `PATCH /quotations/:id/approve`. Asserts:
- HTTP 200
- `body.quotation.status === 'CONVERTED'`
- `body.projectId` is defined

Then reads the row back from the DB and asserts `status === 'CONVERTED'` and `projectId === realProjectId`.

Note: `approveAndConvert` returns `{ quotation, projectId }` — not a flat quotation object. Assertions use `res.body.quotation.*`.

---

**TC-E2E-010 — returns 409 when quotation is already CONVERTED (BR-10.2)**

Seeds a quotation with `status: 'CONVERTED'` and `projectId: realProjectId` (the real FK value). Calls approve again. Asserts HTTP 409 and `body.code === 'ALREADY_CONVERTED'`.  
Enforces business rule BR-10.2: a converted quotation is immutable.
