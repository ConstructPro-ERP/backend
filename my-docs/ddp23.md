# DDP-23 — Invoice CRUD and project invoice generation

## Implementation summary

DDP-23 is implemented as a dedicated NestJS invoice service behind the API gateway.

- Invoice service: `apps/invoice-service/src`
- Gateway controller: `apps/api-gateway/src/controllers/invoices-gateway.controller.ts`
- Prisma model: `prisma/schema.prisma`
- Migration: `prisma/migrations/20260622000001_ddp23_invoice_crud/migration.sql`
- Swagger:
  - Gateway: `http://localhost:3000/api/docs`
  - Invoice service: `http://localhost:4010/docs`

Implemented behavior:

- Create an invoice as `DRAFT` or `ISSUED`.
- Generate an invoice through a project-scoped route.
- List with pagination, project/customer/status/date filters, and sorting.
- Return project, customer, payment, paid amount, and outstanding amount details.
- Update only editable (`DRAFT` or `ISSUED`) invoices with no payments.
- Cancel an active invoice by changing its status to `CANCELLED`.
- Reject missing project/customer IDs and mismatched converted-project customers.
- Record gateway user IDs in `createdBy` and `updatedBy`.
- Protect all gateway invoice routes with JWT and finance/admin/management roles.

## Dependency check

| Dependency | State found | DDP-23 behavior |
| --- | --- | --- |
| Project database model | Implemented | Project existence is checked directly through Prisma. |
| Project service/API | Not implemented; its files are zero-byte stubs | DDP-23 does not call it and remains usable with existing database records. |
| Customer/client database model | Implemented as `Customer` | Customer existence is checked directly through Prisma. |
| Customer/client service/API | Not implemented | DDP-23 does not call it and remains usable with existing database records. |
| Project-to-customer relation | Only derivable for converted quotations through `Project -> Quotation -> Lead -> Customer` | That ownership is enforced when present; otherwise the supplied existing customer is accepted. |
| JWT authentication | Implemented | `/auth/me` was adapted to return a role name so gateway RBAC works. |
| Payment handling (DDP-24) | Implemented after DDP-23 | Payments now persist balances and update invoice statuses atomically. |

## Future adaptations when dependencies arrive

1. Replace `InvoiceRepository.findProjectWithCustomer` and `findCustomer` with project/client service clients if each microservice becomes the authoritative owner of its data.
2. Add an explicit `customerId` relation to `Project`, backfill it from converted quotations, and always validate `invoice.customerId === project.customerId`. The current fallback is necessary because standalone projects have no customer relation.
3. Ensure quotation-to-project conversion persists the quotation/project/customer link before generating an invoice.
4. DDP-24 now owns payment writes and automatic `PARTIALLY_PAID`/`PAID` transitions. DDP-23 deliberately prevents edits after any payment exists.
5. Add and seed dedicated `FINANCE` or `MANAGEMENT` roles if the team adopts those names. Current seeded finance access is `ACCOUNTANT`; the gateway also accepts future `FINANCE` and `MANAGEMENT` roles.
6. Add invoice service orchestration to Docker/deployment configuration when those environments are updated.

## Setup

Use a dedicated development/test database. Do not run destructive tests against shared or production data.

```bash
npm install
npx prisma generate
npx prisma migrate deploy
npm run start:dev:auth-service
npm run start:dev:invoice-service
npm run start:dev:api-gateway
```

Required environment variables are documented in `.env.example`. The important local defaults are:

```env
PORT=3000
AUTH_SERVICE_PORT=3333
AUTH_SERVICE_URL=http://localhost:3333
INVOICE_SERVICE_PORT=4010
INVOICE_SERVICE_URL=http://localhost:4010
```

The repository currently reports all three checked-in migrations as pending on the configured database. Apply them in order on the intended development database before API verification.

Because project and client creation APIs are absent, obtain `projectId` and `customerId` from existing development data or create those dependency records using the approved seed/database workflow. For strict ownership verification, use a project produced from a quotation whose lead has a `Customer`.

## Postman environment

Create these Postman variables:

| Variable | Example |
| --- | --- |
| `baseUrl` | `http://localhost:3000` |
| `adminEmail` | `admin@constructpro.com` |
| `adminPassword` | value configured for the seeded admin |
| `token` | access token returned by login |
| `projectId` | existing project UUID |
| `customerId` | existing customer UUID |
| `invoiceId` | invoice UUID returned by create |

Each block below can be imported into Postman as raw cURL.

## Postman cURLs

### 1. Login

```bash
curl --location '{{baseUrl}}/api/auth/login' \
  --header 'Content-Type: application/json' \
  --data-raw '{
    "email": "{{adminEmail}}",
    "password": "{{adminPassword}}"
  }'
```

Copy `data.accessToken` from the gateway response into `{{token}}`.

### 2. Create invoice

```bash
curl --location '{{baseUrl}}/api/invoices' \
  --header 'Authorization: Bearer {{token}}' \
  --header 'Content-Type: application/json' \
  --data-raw '{
    "projectId": "{{projectId}}",
    "customerId": "{{customerId}}",
    "invoiceDate": "2026-06-22",
    "dueDate": "2026-07-22",
    "totalAmount": 125000.50,
    "notes": "First construction progress invoice",
    "status": "DRAFT"
  }'
```

Expected: `201`; save `data.id` as `{{invoiceId}}`. `paidAmount` is `0` and `outstandingAmount` is `125000.5`.

### 3. Generate an invoice from a project route

```bash
curl --location '{{baseUrl}}/api/projects/{{projectId}}/invoices' \
  --header 'Authorization: Bearer {{token}}' \
  --header 'Content-Type: application/json' \
  --data-raw '{
    "customerId": "{{customerId}}",
    "invoiceDate": "2026-06-22",
    "dueDate": "2026-07-22",
    "totalAmount": 75000,
    "notes": "Project-scoped invoice",
    "status": "ISSUED"
  }'
```

Expected: `201`, linked to the route's `projectId` and supplied existing customer.

### 4. List, filter, paginate, and sort

```bash
curl --location --get '{{baseUrl}}/api/invoices' \
  --header 'Authorization: Bearer {{token}}' \
  --data-urlencode 'page=1' \
  --data-urlencode 'limit=10' \
  --data-urlencode 'projectId={{projectId}}' \
  --data-urlencode 'customerId={{customerId}}' \
  --data-urlencode 'status=DRAFT' \
  --data-urlencode 'fromDate=2026-01-01' \
  --data-urlencode 'toDate=2026-12-31' \
  --data-urlencode 'sortBy=createdAt' \
  --data-urlencode 'sortOrder=desc'
```

Expected: `200`, `data` array plus `meta.total`, `meta.page`, `meta.limit`, and `meta.totalPages`.

Valid `sortBy` values: `invoiceDate`, `dueDate`, `totalAmount`, `status`, `createdAt`, `updatedAt`.

### 5. Invoice detail

```bash
curl --location '{{baseUrl}}/api/invoices/{{invoiceId}}' \
  --header 'Authorization: Bearer {{token}}'
```

Expected: `200` with project, customer, total, paid amount, outstanding amount, payments, and status.

### 6. Update an editable invoice

```bash
curl --location --request PATCH '{{baseUrl}}/api/invoices/{{invoiceId}}' \
  --header 'Authorization: Bearer {{token}}' \
  --header 'Content-Type: application/json' \
  --data-raw '{
    "dueDate": "2026-08-01",
    "totalAmount": 130000,
    "notes": "Updated after finance review",
    "status": "ISSUED"
  }'
```

Expected: `200`. Paid/cancelled/overdue invoices and invoices with payments reject edits with `409`.

### 7. Cancel invoice

```bash
curl --location --request PATCH '{{baseUrl}}/api/invoices/{{invoiceId}}/cancel' \
  --header 'Authorization: Bearer {{token}}'
```

Expected: `200` and `data.status` equals `CANCELLED`. Repeating the request is idempotent.

### 8. Reject an invalid dependency ID

```bash
curl --location '{{baseUrl}}/api/invoices' \
  --header 'Authorization: Bearer {{token}}' \
  --header 'Content-Type: application/json' \
  --data-raw '{
    "projectId": "00000000-0000-4000-8000-000000000099",
    "customerId": "{{customerId}}",
    "invoiceDate": "2026-06-22",
    "totalAmount": 1000
  }'
```

Expected: `404` with code `PROJECT_NOT_FOUND`.

### 9. Verify authentication protection

```bash
curl --location '{{baseUrl}}/api/invoices'
```

Expected: `401` because the bearer token is absent. A valid user outside the allowed roles receives `403`.

## Automated verification performed

- `npx prisma validate`: passed.
- `npm run build`: passed.
- Targeted ESLint for all DDP-23 and touched auth/RBAC files: passed.
- Focused Jest run: 22/22 tests passed (invoice service plus gateway role behavior).
- Full repository Jest run: 38 tests passed and 19 database-backed tests failed because `DATABASE_URL_TEST` is not configured. This is an existing test-environment prerequisite, not a DDP-23 unit failure.
- Migration status: database is reachable, but the three checked-in migrations are pending; no migration was applied automatically.
