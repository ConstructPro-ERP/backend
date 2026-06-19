# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added
- **quotation-service** (`apps/quotation-service`) — new NestJS microservice on port 3009
  - `POST /quotations` — creates a quotation for a lead; server-computes all item amounts and `totalAmount` (Decimal 12,2); status defaults to `PENDING_APPROVAL`; triggers async PDF generation via document-service and stores `pdfUrl` (non-blocking — failure is logged, quotation still returns)
  - `GET /quotations/:id` — returns a quotation with its line items
  - `DocumentClient` — isolated HTTP client for document-service calls; reads `DOCUMENT_SERVICE_URL` from env
- **API Gateway** — `/quotations` routes proxied to quotation-service with `JwtAuthGuard` → `RolesGuard`
  - `POST /quotations`: roles `Sales Manager`, `Admin`
  - `GET /quotations/:id`: roles `Sales Manager`, `Admin`, `Project Manager`, `Accountant`
- **Prisma schema** — updated `Quotation` and `QuotationItem` models:
  - `Quotation`: switched FK from `customerId → Customer` to `leadId → Lead`; added `pdfUrl`, `notes`, `projectId` (nullable); changed `totalAmount` to `Decimal(12,2)`; mapped to table `quotation`
  - `QuotationItem`: changed `unitPrice` and `amount` to `Decimal(12,2)`; removed timestamps; mapped to table `quotation_item`
  - `QuotationStatus` enum: added `CONVERTED` value
  - Migration `20260618000001_add_quotation_tables` applied
- **Validation** — `CreateQuotationDto` / `CreateQuotationItemDto` using class-validator: `leadId` (UUID), `items` (array, min 1), `itemName` (non-empty), `quantity` (positive int), `unitPrice` (≥ 0); invalid input returns `400 VALIDATION_ERROR`
- **Tests** — 23 tests, coverage ≥ 80% on new code
  - Unit: service totals, lead-not-found, PDF success/failure, quotation-not-found
  - Unit: `RolesGuard` role matrix for both quotation endpoints (incl. 403 for Accountant on POST)
  - Unit: `DocumentClient` HTTP success, failure, missing pdfUrl field
  - Integration (real test DB): POST 201 + DB row verification, POST 400 validations, GET 200 + 404

### Changed
- `docker-compose.yml` — added `api-gateway`, `auth-service`, and `quotation-service` service definitions (file was previously empty)
- `libs/config/src/configuration.ts` — added `quotation.port` (env `QUOTATION_SERVICE_PORT`, default `3009`)
- `libs/config/src/env.validation.ts` — added Joi rule for `QUOTATION_SERVICE_PORT`
- `package.json` — added `start:dev:quotation-service` script; installed `@nestjs/axios` and `axios` (were listed as dependencies but not installed)
- `src/database/__tests__/database.spec.ts` — updated `Quotation` tests to use `leadId` (schema migration)

### Fixed
- Installed missing `@nestjs/axios` package (was declared in `package.json` but absent from `node_modules`, causing TypeScript errors across all HTTP-using guards and controllers)
