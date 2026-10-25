# Person 2 Sprint 8 verification — issue #117

Branch: `sprint8/117-person2-quotation-quality`  
Base: `develop`  
Verification date: 2026-10-12

## Implemented backend hardening

- Calculate line amounts and aggregate totals with Prisma Decimal; reject non-finite, negative, integer-overflow, and Decimal(12, 2) monetary-overflow inputs.
- Restrict creation to DRAFT or PENDING_APPROVAL. Block DRAFT conversion until submission.
- Retain project-service transaction locking and linked-project recovery to prevent duplicate project creation.
- Default a new project's budget to the quotation total when no explicit budget is provided.
- Invalidate cached PDFs after approval, submission, rejection, and conversion as well as edits and revision.
- Wrap long PDF fields and paginate large quotations; use decimal subtotal arithmetic.
- Bound document, project, and notification HTTP calls to 10 seconds. Reject malformed project responses and mask downstream server failures.
- Allow SALES_MANAGER and ADMIN to approve and convert through the gateway.
- Add an independent CI coverage job, coverage artifacts, and pushes on `sprint8/**` branches.
- Apply compatible dependency security updates in the lockfile, including NestJS platform/microservices, multer, proxy-addr, and fast-uri.

## Repeatable validation

```sh
npm ci
npx prisma generate
npm run build:all
npm run test:quotation-quality
npm run test:unit -- --runInBand
npm run test:e2e -- --runInBand quotation-service
npm audit --omit=dev
```

Integration tests require a dedicated `DATABASE_URL_TEST`. The existing E2E setup redirects application connections to that test database. These suites create and remove their own fixtures; never point them at production.

Quotation quality suite: **141 tests pass across 6 suites**. Coverage: **98.92% lines**, **98.97% statements**, **100% functions** across the four measured files; quotation service **90.08% branches** and **97.72% lines**. All measured files exceed 80% line coverage. The configuration enforces 80% overall lines/statements/functions and 90% quotation-service branches. This is focused coverage, not a repository-wide coverage claim.

Generated HTML evidence: `coverage/quotation-quality/lcov-report/index.html`. CI publishes this directory as `quotation-quality-coverage`. Coverage PDFs and the team test-register PDF must be assembled from these results for final submission.

Final checks: **852 unit tests pass across 48 suites**; **31 database integration/E2E tests pass across 3 suites**, with **2 existing tests skipped**. `npm run build:all` and ESLint on all changed TypeScript files pass with zero warnings. Changed-file Prettier verification passes. These are local results; remote CI and staging are separate gates.

## Test register inputs

| Area | Evidence |
| --- | --- |
| Monetary rounding, zero prices, large values, aggregate overflow, invalid quantities | `test/quotation-service/quotation-hardening.spec.ts` |
| Create/read/list/edit, approval, rejection, revision, submission, conversion, PDF cache/failure, missing records | `test/quotation-service/quotation.service.spec.ts` |
| Every quotation gateway route: authentication, sales-manager access; project-manager write denial | `test/quotation-service/quotation-gateway-http.spec.ts` |
| Role boundaries and forwarding contracts | `test/quotation-service/quotations-gateway.controller.spec.ts` |
| PDF fallback, failure, empty items, long fields, pagination, totals, cross-reference offsets | `test/quotation-service/document.client.spec.ts` |
| Project-service errors, payloads, malformed success responses, safe server failures | `test/quotation-service/project.client.spec.ts` |
| Real database persistence and validation | `test/quotation-service/quotation.integration.spec.ts`, `quotation.e2e-spec.ts` |
| Full HTTP lifecycle with revision, real project creation, duplicate conversion, concurrent requests, invalid-manager recovery, default budget mapping | `test/quotation-service/quotation-project.integration.spec.ts` |

## Contract and failure semantics

The existing backend states are `DRAFT → PENDING_APPROVAL → APPROVED → CONVERTED`, with `PENDING_APPROVAL → REJECTED → DRAFT` for revision. The action plan's SENT and REVISED labels are not schema enum values. Submission is `PATCH /quotations/:id/submit`; conversion is `PATCH /quotations/:id/approve`; separate approval is `PATCH /quotations/:id/direct-approve`. No POST `/convert` route was introduced.

Quotation totals use `totalAmount`, list responses contain `items`, `total`, `page`, `limit`, and `totalPages`, PDF responses contain `pdfUrl`, and conversion responses contain `quotation`, `projectId`, and `projectStatus`. Monetary fields persisted as Decimal may serialize as strings; consumers must support that existing contract.

On project creation failure, an approved quotation remains approved and retryable. Combined approval/conversion may retain the approved state after project-service failure. The project service creates the project and links the quotation in one locked transaction. If its response is lost after commit, retry uses the linked project. Do not reset status or delete a project on an ambiguous timeout. Successful concurrent requests may return the same project; subsequent conversion returns 409.

List and detail use eager relation loading, with no per-item lead or line-item lookup loop. The real workflow test logs single-sample list, detail, and conversion timings. Those include test database network latency and are not a production latency guarantee. Measure staging pagination/filtering with realistic record counts before performance sign-off.

## Outstanding release gates

- The compatible dependency fix reduced production audit findings from **15 (1 critical, 9 high, 5 moderate)** to **9 (0 critical, 6 high, 3 moderate)**. The zero-high/critical release gate remains blocked. Remaining paths include Vercel Blob → undici/@fastify/busboy and Prisma → @prisma/config/deepmerge-ts/mysql2; moderate findings also include Swagger/js-yaml. npm's suggested forced fixes include a Blob major upgrade and a Prisma downgrade. Review and validate those separately before release; do not claim security sign-off.
- SALES_REPRESENTATIVE assigned-record access and client read access are absent from the current quotation authorization model. Current reads allow SALES_MANAGER, ADMIN, PROJECT_MANAGER, and ACCOUNTANT. Record-level sales assignment enforcement requires agreed policy and coordinated implementation; gateway tests verify the current policy.
- Tax and discount fields are absent from the current quotation schema. The current total is the sum of line amounts. Do not claim tax/discount verification or add these features during the freeze.
- Staging deployment, migrations, browser PDF preview, frontend rounding parity and navigation to the created project require the actual staging application.
- Rehearsal, final candidate smoke testing, team PDF/report packaging, panel participation, and peer evaluation remain team/manual deliverables.
- Internal services assume gateway-controlled access. Keep their network exposure restricted; these tests do not establish direct-service JWT authorization.

Keep issue #117 open until its outstanding release criteria are verified.

## Staging and demo checklist

- [ ] Record staging URL, deployment commit, CI result, and migration verification.
- [ ] Use a qualified lead with realistic contact details and a designated project manager.
- [ ] Prepare one DRAFT quotation with editable line items, one APPROVED quotation, and one CONVERTED quotation linked to a project.
- [ ] Demonstrate create → edit → submit → approve → download PDF → convert → open project.
- [ ] Verify totals match the browser, API, persisted records, and PDF.
- [ ] Verify manager/admin writes, project-manager read access, and 401/403 failures.
- [ ] Verify repeated conversion creates no additional project and converted edits are rejected.
- [ ] Verify unavailable PDF/project-service handling and recovery without exposing stack traces.
- [ ] Record list/detail/conversion timings with representative data and agreed latency thresholds.
- [ ] Rehearse the lead/quotation/project team handoff and record fallback steps.
- [ ] Repeat critical smoke checks on the release candidate and attach evidence.

For safe demo preparation, use staging UI/API operations with valid existing users. The existing `prisma/seeds/quotation-demo.seed.ts` is a reference, but its placeholder password is not a usable login credential. Do not execute seeds against a shared environment without reviewing its fixtures.
