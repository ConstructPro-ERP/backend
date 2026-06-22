# DDP-24 — Payment tracking and automatic invoice status updates

## Implementation summary

DDP-24 is implemented as a NestJS payment service behind the authenticated API gateway.

- Payment service: `apps/payment-service/src`
- Gateway controller: `apps/api-gateway/src/controllers/payments-gateway.controller.ts`
- Prisma models: `prisma/schema.prisma`
- Migration: `prisma/migrations/20260622000002_ddp24_payment_tracking/migration.sql`
- Swagger:
  - Gateway: `http://localhost:3000/api/docs`
  - Payment service: `http://localhost:3005/docs`

Implemented behavior:

- Record a payment against an existing issued, partially paid, or overdue invoice.
- Reject draft, cancelled, and fully paid invoices.
- Reject zero, negative, and excessive payment amounts.
- Require a globally unique payment reference number.
- Save payment date, method, amount, notes, customer link, and creator ID.
- Update persisted `paidAmount`, `outstandingAmount`, and invoice status in the same transaction.
- Set status to `PARTIALLY_PAID` or `PAID` automatically.
- Return complete invoice payment history and current balances.
- Protect gateway payment routes with JWT and finance/admin/management roles.
- Serialize concurrent payments by locking the invoice row and using a serializable transaction with retry handling.

## Dependency check

| Dependency | State found | DDP-24 behavior |
| --- | --- | --- |
| DDP-23 invoice code | Implemented in the current worktree | DDP-24 uses its invoice statuses, customer relation, audit fields, and service routes. |
| DDP-23 database migration | Created but not deployed on the configured database | DDP-24 migration must be applied after DDP-23. |
| Invoice service deployment | Implemented locally, not in Docker/deployment orchestration | Payment validation uses the shared Prisma database and does not require an HTTP call to the invoice service. |
| Payment database model | Existing minimal model | Extended with decimal amounts, unique references, notes, creator audit, and indexes. |
| Payment service | Previously zero-byte stubs | Fully implemented by DDP-24. |
| Customer/client service | Not implemented | Customer ID is copied from the invoice inside the transaction; the request cannot substitute another customer. |
| JWT/RBAC | Implemented and adapted during DDP-23 | Gateway permits `ADMIN`, `ACCOUNTANT`, and future `FINANCE`/`MANAGEMENT` roles. |

## Future adaptations

1. If invoice and payment data move to separate databases, replace the shared-database transaction with a finance-owned boundary or a saga/outbox workflow. An HTTP call alone cannot provide the current atomicity guarantee.
2. After cleaning any legacy unallocated payments, make `Payment.invoiceId` non-null at the database level. DDP-24 requires it in the API, but the existing nullable schema is retained for legacy compatibility.
3. Publish a `payment.recorded` event for notifications, audit streams, and future reporting once the event infrastructure is agreed.
4. Add reversal/refund entries as immutable ledger transactions. Do not delete or overwrite recorded payments when that scope is introduced.
5. Use payment-provider idempotency keys in addition to `referenceNumber` for online gateway callbacks.
6. Add and seed dedicated `FINANCE` or `MANAGEMENT` roles if the project adopts those role names; the currently seeded finance role is `ACCOUNTANT`.
7. Add payment service startup to Docker/deployment orchestration when deployment work is in scope.

## Setup

Use a dedicated development/test database.

```bash
npm install
npx prisma generate
npx prisma migrate deploy
npm run start:dev:auth-service
npm run start:dev:invoice-service
npm run start:dev:payment-service
npm run start:dev:api-gateway
```

Relevant environment variables:

```env
PORT=3000
AUTH_SERVICE_PORT=3333
AUTH_SERVICE_URL=http://localhost:3333
INVOICE_SERVICE_PORT=4010
INVOICE_SERVICE_URL=http://localhost:4010
PAYMENT_SERVICE_PORT=3005
PAYMENT_SERVICE_URL=http://localhost:3005
```

The configured database currently reports all four checked-in migrations as pending. Apply them in timestamp order on the intended development database; DDP-24 depends on `20260622000001_ddp23_invoice_crud`.

## Postman environment

Create these Postman variables:

| Variable | Example |
| --- | --- |
| `baseUrl` | `http://localhost:3000` |
| `adminEmail` | `admin@constructpro.com` |
| `adminPassword` | configured seeded-admin password |
| `token` | access token returned by login |
| `projectId` | existing project UUID |
| `customerId` | existing customer UUID linked to the project |
| `invoiceId` | issued invoice UUID |
| `paymentId` | payment UUID returned by create |

Each block can be imported into Postman as raw cURL. Use new reference numbers for each successful payment.

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

Copy `data.accessToken` into `{{token}}`.

### 2. Create an issued invoice dependency

```bash
curl --location '{{baseUrl}}/api/invoices' \
  --header 'Authorization: Bearer {{token}}' \
  --header 'Content-Type: application/json' \
  --data-raw '{
    "projectId": "{{projectId}}",
    "customerId": "{{customerId}}",
    "invoiceDate": "2026-06-22",
    "dueDate": "2026-07-22",
    "totalAmount": 100000,
    "notes": "DDP-24 verification invoice",
    "status": "ISSUED"
  }'
```

Expected: `201`. Save `data.id` as `{{invoiceId}}`.

### 3. Record a partial payment

```bash
curl --location '{{baseUrl}}/api/payments' \
  --header 'Authorization: Bearer {{token}}' \
  --header 'Content-Type: application/json' \
  --data-raw '{
    "invoiceId": "{{invoiceId}}",
    "referenceNumber": "PAY-2026-0001",
    "paymentDate": "2026-06-22",
    "amount": 25000,
    "paymentMethod": "BANK_TRANSFER",
    "notes": "First progress payment"
  }'
```

Expected: `201`. Save `data.payment.id` as `{{paymentId}}`. The returned invoice has `paidAmount: 25000`, `outstandingAmount: 75000`, and `status: PARTIALLY_PAID`.

### 4. Get one payment

```bash
curl --location '{{baseUrl}}/api/payments/{{paymentId}}' \
  --header 'Authorization: Bearer {{token}}'
```

Expected: `200` with reference, amount, method, customer, notes, and audit fields.

### 5. Get invoice payment history

```bash
curl --location '{{baseUrl}}/api/invoices/{{invoiceId}}/payments' \
  --header 'Authorization: Bearer {{token}}'
```

Expected: `200`; `data.invoice` contains current balances and `data.payments` contains all payments ordered newest first.

### 6. Verify invoice detail after payment

```bash
curl --location '{{baseUrl}}/api/invoices/{{invoiceId}}' \
  --header 'Authorization: Bearer {{token}}'
```

Expected: `paidAmount: 25000`, `outstandingAmount: 75000`, and `status: PARTIALLY_PAID`.

### 7. Pay the remaining balance

```bash
curl --location '{{baseUrl}}/api/payments' \
  --header 'Authorization: Bearer {{token}}' \
  --header 'Content-Type: application/json' \
  --data-raw '{
    "invoiceId": "{{invoiceId}}",
    "referenceNumber": "PAY-2026-0002",
    "paymentDate": "2026-06-23",
    "amount": 75000,
    "paymentMethod": "CHEQUE",
    "notes": "Final settlement"
  }'
```

Expected: `201` with `paidAmount: 100000`, `outstandingAmount: 0`, and `status: PAID`.

### 8. Reject an excessive payment

Run against a fresh issued invoice with an outstanding balance lower than the amount:

```bash
curl --location '{{baseUrl}}/api/payments' \
  --header 'Authorization: Bearer {{token}}' \
  --header 'Content-Type: application/json' \
  --data-raw '{
    "invoiceId": "{{invoiceId}}",
    "referenceNumber": "PAY-2026-OVERPAY",
    "paymentDate": "2026-06-24",
    "amount": 100000.01,
    "paymentMethod": "CASH"
  }'
```

Expected: `422` with code `PAYMENT_EXCEEDS_OUTSTANDING`. If the invoice was already fully paid, the earlier business rule returns `409 INVOICE_ALREADY_PAID`.

### 9. Reject zero and negative amounts

```bash
curl --location '{{baseUrl}}/api/payments' \
  --header 'Authorization: Bearer {{token}}' \
  --header 'Content-Type: application/json' \
  --data-raw '{
    "invoiceId": "{{invoiceId}}",
    "referenceNumber": "PAY-2026-ZERO",
    "paymentDate": "2026-06-24",
    "amount": 0,
    "paymentMethod": "CASH"
  }'
```

Expected: `400 VALIDATION_ERROR`. Change `amount` to `-1` to verify the negative case.

### 10. Reject a duplicate reference

```bash
curl --location '{{baseUrl}}/api/payments' \
  --header 'Authorization: Bearer {{token}}' \
  --header 'Content-Type: application/json' \
  --data-raw '{
    "invoiceId": "{{invoiceId}}",
    "referenceNumber": "PAY-2026-0001",
    "paymentDate": "2026-06-24",
    "amount": 100,
    "paymentMethod": "ONLINE"
  }'
```

Expected: `409 PAYMENT_REFERENCE_EXISTS` when tested on a payable invoice.

### 11. Verify cancelled-invoice rejection

Cancel a fresh invoice, then attempt payment:

```bash
curl --location --request PATCH '{{baseUrl}}/api/invoices/{{invoiceId}}/cancel' \
  --header 'Authorization: Bearer {{token}}'

curl --location '{{baseUrl}}/api/payments' \
  --header 'Authorization: Bearer {{token}}' \
  --header 'Content-Type: application/json' \
  --data-raw '{
    "invoiceId": "{{invoiceId}}",
    "referenceNumber": "PAY-2026-CANCELLED",
    "paymentDate": "2026-06-24",
    "amount": 100,
    "paymentMethod": "CASH"
  }'
```

Expected: `409 CANCELLED_INVOICE_PAYMENT_REJECTED`.

### 12. Verify authentication protection

```bash
curl --location '{{baseUrl}}/api/invoices/{{invoiceId}}/payments'
```

Expected: `401`. A valid user outside the allowed roles receives `403`.

## Automated verification performed

- `npx prisma validate`: passed.
- `npm run build`: passed after generating the DDP-24 Prisma client.
- Focused Jest run: 28/28 payment, invoice, and payment-RBAC tests passed.
- Migration status: the database is reachable, but all four checked-in migrations are pending; none were applied automatically.
- Full repository integration tests still require a separately configured `DATABASE_URL_TEST`, as documented in `ddp23.md`.
