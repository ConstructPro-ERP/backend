# PR title

Sprint 8: Harden quotation calculations, lifecycle, PDFs, and project conversion

# PR description

## Changes

Quotation creation could accept terminal statuses, draft quotations could bypass submission during conversion, monetary calculations used floating point, and large fallback PDFs could overflow a single page.

This change adds decimal calculations and range validation, restricts creation and conversion states, invalidates stale PDFs on status changes, wraps and paginates PDFs, and bounds downstream calls. Sales managers can approve/convert through the gateway. New projects default to the quotation total when no budget is supplied. Malformed project responses and downstream server failures produce safe errors.

Regression tests cover gateway permissions, the full quotation HTTP lifecycle, real project creation, simultaneous conversions, failure recovery, PDF structure, and monetary boundaries. A dedicated CI job enforces quotation coverage and publishes evidence. Compatible security updates are included in the lockfile.

## Validation

- `npm run test:quotation-quality`: 141 tests pass; 98.92% measured line coverage; 90.08% quotation-service branch coverage.
- `npm run test:unit -- --runInBand`: 852 tests pass across 48 suites.
- `npm run test:e2e -- --runInBand quotation-service`: 31 tests pass across 3 suites; 2 existing tests skipped.
- `npm run build:all`, changed-file ESLint, and changed-file Prettier checks pass.
- Production dependency audit improved from 1 critical/9 high to 0 critical/6 high. The remaining findings prevent release security sign-off.

## Release follow-up

Staging/browser checks, realistic performance verification, demo rehearsal, and final evidence packaging remain pending. The backend currently has no tax/discount fields or sales-representative assigned-record authorization; these plan differences are documented. Existing PENDING_APPROVAL states and PATCH approval/conversion routes are retained.

See `docs/person-2-sprint-8-verification.md` for the test register, contracts, recovery semantics, and staging checklist.

Related to #117. Keep the issue open until the outstanding release gates are complete.
