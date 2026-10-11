# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- **DDP-65 — Project Service foundation** ([issue #74](https://github.com/ConstructPro-ERP/backend/issues/74), [PR #79](https://github.com/ConstructPro-ERP/backend/pull/79))
  - Introduced the deployable NestJS Project Service, Project domain CRUD and API Gateway routes; standalone Projects start in `PLANNING`, while quotation-driven creation/attachment follows the approved-quotation activation and idempotent recovery rules already recorded under Issue #65 and ADR-10.
- **DDP-68 — Project operations and access control** ([issue #80](https://github.com/ConstructPro-ERP/backend/issues/80), [PR #89](https://github.com/ConstructPro-ERP/backend/pull/89))
  - Added assigned-Project-Manager authorization, Admin-only manager assignment, validated status transitions, project search/filter/pagination, activation checks and stable domain error codes.
  - Permitted Admin-only deletion of unused `PLANNING` Projects without related domain records; Projects with business history are cancelled instead of permanently deleted.
- **DDP-77 — Milestones and canonical weighted progress** ([issue #92](https://github.com/ConstructPro-ERP/backend/issues/92), [PRs #97](https://github.com/ConstructPro-ERP/backend/pull/97) and [#99](https://github.com/ConstructPro-ERP/backend/pull/99))
  - Added milestone CRUD, progress/status management, derived overdue indicators, completion validation, and transactional recalculation of Project progress using relative integer weights from `1` to `10`.
  - Added Project Service, API Gateway and Analytics integration with unit, database integration and E2E regression tests.
- **DDP-81 — Project Task Service** ([issue #104](https://github.com/ConstructPro-ERP/backend/issues/104), [PR #107](https://github.com/ConstructPro-ERP/backend/pull/107))
  - Implemented Task Service CRUD, assignment/reassignment, independent task status transitions, project-level and optionally milestone-linked tasks, filtering, sorting, pagination, and validated project/assignee access.
  - Added authenticated API Gateway task routes, DTO/repository/service coverage, database integration tests and gateway-to-service E2E tests.
- **DDP-82 — Project expense tracking** ([issue #108](https://github.com/ConstructPro-ERP/backend/issues/108), [PR #109](https://github.com/ConstructPro-ERP/backend/pull/109))
  - Added Project Service expense CRUD and category-based summaries with amount/date validation, project lifecycle restrictions, and permissions for Admin (CRUD), Accountant (create/read/update), and assigned Project Manager (read-only).
  - Added expense queries with filtering, sorting and pagination; transaction/concurrency handling; unit, database integration and API Gateway E2E coverage.
- **Project-domain Architecture Decision Records**
  - Added proposed ADR-11 (Project/Task service boundaries and expense ownership), ADR-12 (relative milestone weights and progress) and ADR-13 (controlled deletion of unused planning Projects). They record implemented decisions pending team/supervisor review; ADR-09 and ADR-10 are unchanged.

- **UC-04 / FR-004 — Convert Quotation to Project** (issue #2)
  - `PATCH /quotations/:id/approve` — approves and converts a quotation to a project; allowed roles: `Admin`, `Management`
  - Business Rule 10.2 enforced: `CONVERTED` status or existing `projectId` → `409 ALREADY_CONVERTED` (idempotent, project service never called); `REJECTED` → `400 QUOTATION_REJECTED`
  - State machine: `PENDING_APPROVAL → APPROVED → CONVERTED`; project service is only called after `APPROVED` is persisted; `CONVERTED` + `projectId` are stored only after project service confirms success — safe to retry on failure
  - `ProjectClient` — HTTP client for `POST {PROJECT_SERVICE_URL}/projects/from-quotation`; supports `PROJECT_SERVICE_STUB=true` env flag that returns a fake `projectId` while the real project service is not yet deployed (clearly marked as temporary)
  - `NotificationClient` — best-effort HTTP client for `POST {NOTIFICATION_SERVICE_URL}/notifications/project-created`; failure is logged as `warn` and never propagates to the caller
  - **ADR-09** (`docs/adr/ADR-09-quotation-orchestrates-project-creation.md`) — records why the quotation service orchestrates the approve → create → notify chain
  - Tests: 16 unit tests on `approveAndConvert` (≥87.5% branch coverage; `approveAndConvert` at 100%); 3 integration tests (happy path + 409 idempotency + 404); 5 gateway RBAC tests for the new endpoint (Sales/Accountant/PM → 403); total 39 tests, all green
- **quotation-service** (`apps/quotation-service`) — new NestJS microservice on port 4009
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

- **Issue #65 — Project Domain Foundation and Quotation Conversion**
  - Added `POST /projects/from-quotation` to support Project creation from an approved Quotation or attachment of an approved Quotation to an existing Project.
  - Added `CreateProjectFromQuotationDto` for quotation-driven Project conversion requests.
  - Added shared Project conversion request and response contracts for communication between quotation-service and project-service.
  - Added Project Service transaction handling for quotation conversion using `SERIALIZABLE` isolation and `SELECT ... FOR UPDATE` row locking.
  - Added retry handling for Prisma transaction conflicts and PostgreSQL serialization conflicts surfaced through the Neon driver adapter.
  - Added ADR-10 (`docs/adr/ADR-10-project-activation-and-multiple-quotations.md`) to record Project activation, multiple-Quotation cardinality, retry behavior, concurrency handling, and Project budget semantics.
  - Added Project Service unit and integration coverage for standalone Project creation, quotation-driven activation, existing Project attachment, partial-conversion recovery, and concurrent conversion idempotency.
  - Added Quotation Service, ProjectClient, API Gateway, integration, and E2E coverage for the revised Project conversion workflow.
  - Added real cross-service integration coverage for Quotation Service → ProjectClient → Project Service using the test database and actual HTTP communication.

### Changed

- **DDP-77 — Relative milestone weights and progress semantics** ([PR #99](https://github.com/ConstructPro-ERP/backend/pull/99))
  - Changed the initial issue-level 100-point allocation rule to normalized relative weights of `1`–`10` without a total-weight requirement. Project completion requires 100% canonical progress and all recorded milestones completed; task status does not automatically update milestone progress.
- **DDP-81 — Shared transaction retry support** ([PR #107](https://github.com/ConstructPro-ERP/backend/pull/107))
  - Centralized retry utilities for Prisma/Neon serialization conflicts, reusing them across Project, Milestone, Task and Expense operations.
- **DDP-82 — Expense financial precision** ([PR #109](https://github.com/ConstructPro-ERP/backend/pull/109))
  - Changed `Expense.amount` from floating-point storage to PostgreSQL `DECIMAL(12,2)`; added `expenseDate`, optional category/description and query indexes; updated Analytics and AI consumers for Prisma Decimal compatibility.

- `docker-compose.yml` — added `api-gateway`, `auth-service`, and `quotation-service` service definitions (file was previously empty)
- `libs/config/src/configuration.ts` — added `quotation.port` (env `QUOTATION_SERVICE_PORT`, default `3009`)
- `libs/config/src/env.validation.ts` — added Joi rule for `QUOTATION_SERVICE_PORT`
- `package.json` — added `start:dev:quotation-service` script; installed `@nestjs/axios` and `axios` (were listed as dependencies but not installed)
- `src/database/__tests__/database.spec.ts` — updated `Quotation` tests to use `leadId` (schema migration)

- **Issue #65 — Project lifecycle and Quotation conversion**
  - Standalone Projects now start in `PLANNING` status.
  - A Project created from an approved Quotation is created as `ACTIVE`.
  - An approved Quotation may create a new Project or attach to an existing Project.
  - A `PLANNING` Project becomes `ACTIVE` when an associated Quotation reaches `APPROVED` or `CONVERTED`.
  - Automatic quotation-driven activation is limited to `PLANNING → ACTIVE` and does not overwrite `ON_HOLD`, `COMPLETED`, or `CANCELLED`.
  - Multiple Quotations may belong to the same Project while each Quotation references at most one Project.
  - Quotation approval requests now forward Project conversion details through the API Gateway and quotation-service.
  - An `APPROVED` Quotation that already contains a `projectId` is treated as a recoverable partial conversion and reuses the existing Project.
  - Project `budget` is treated independently from an individual Quotation's `totalAmount`.
  - Project and database architecture documentation now records the implemented Project 1:N Quotation relationship and its traceability to the original SRS/SDS baseline and later client-confirmed refinement.
  - Removed the temporary `PROJECT_SERVICE_STUB` fallback now that quotation conversion is integrated with the real Project Service.

### Fixed

- **DDP-66 — Prisma schema and database reconciliation** ([issue #66](https://github.com/ConstructPro-ERP/backend/issues/66), [PR #76](https://github.com/ConstructPro-ERP/backend/pull/76))
  - Reconciled migration metadata and existing Neon tables/relations and aligned User authentication nullability and related schema mappings without dropping existing application data.
- **DDP-79 — Replayable Prisma migration history** ([issue #95](https://github.com/ConstructPro-ERP/backend/issues/95), [PR #96](https://github.com/ConstructPro-ERP/backend/pull/96))
  - Added missing baseline and lead contact/note migrations and corrected the incompatible embedding migration; preserved the migration sequence rather than squashing it.
- **DDP-77 — Milestone deletion and E2E reliability** ([PRs #99](https://github.com/ConstructPro-ERP/backend/pull/99) and [#103](https://github.com/ConstructPro-ERP/backend/pull/103))
  - Prevented deleting milestones referenced by tasks and reduced shared-test-database contention by adjusting transaction handling and integration/E2E test execution.
- **DDP-82 — API Gateway response pagination detection** ([PR #109](https://github.com/ConstructPro-ERP/backend/pull/109))
  - Corrected the shared response interceptor so an expense summary's decimal-string `total` does not produce incorrect pagination metadata, while genuine paginated responses retain their metadata.

- Installed missing `@nestjs/axios` package (was declared in `package.json` but absent from `node_modules`, causing TypeScript errors across all HTTP-using guards and controllers)
- **DDP-67 — Project/Quotation cardinality**
  - Changed Project → Quotation from one-to-one to one-to-many based on client-confirmed requirements.
  - Removed the unique constraint on `quotation.projectId` and added a non-unique index.
  - Updated affected invoice validation and database tests for multiple quotations per project.

- **Issue #65 — Project conversion reliability**
  - Prevented duplicate Projects when the same approved Quotation is converted concurrently.
  - Added retry support for PostgreSQL `40001` serialization conflicts returned through Prisma and the Neon driver adapter.
  - Scoped Quotation integration and E2E database cleanup to suite-owned fixtures so parallel test suites no longer delete each other's Leads and Quotations.
