# Finance, analytics and AI verification register

Reviewed: 2026-10-09 (Asia/Colombo). Owner: Sprint 8 Person 4.

Implementation is available for review. Database and deployed E2E runs remain
to be recorded, repository-wide blockers resolved, and peer review completed.

## Repeatable checks

From the backend repository:

```bash
npx prisma generate
npm run test:finance-quality
npm run test:quality-routes
npm run test:quality:typecheck
npm run test:quality:lint
npm run test:finance-workflow
```

The unit and route suites use deterministic records and mocked provider/auth
transports. No live AI calls are needed. The authorization tests execute the
actual gateway JWT and role guards over HTTP; the auth-service HTTP transport
supplies controlled identities. They do not verify the remote auth service.

The database suite uses real controllers, services, repositories, transactions
and Prisma against `DATABASE_URL_TEST`. Only the paid AI provider is mocked.
`test/jest-e2e.setup.ts` refuses to run without that explicit database URL and
overrides the application connection to use it. Use a dedicated migrated test
database compatible with the existing Neon adapter. Do not supply a production
database. This suite does not migrate or seed the entire database.

Fixtures use generated UUIDs and a unique invoice timestamp. Cleanup only removes
payments, invoices, milestones, project, customer and user records belonging to
this suite. Database tests are excluded from the unit/default test suites and
included in the existing `test:e2e` integration command.

## Recorded results

Local runtime: Node 24.12.0; shared CI selects Node 22. CI execution remains
required for release evidence.

| Check                                     | Observed result                                                                                         |
| ----------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| Finance/analytics/AI unit suite           | 14 suites, 148 tests passed; coverage thresholds passed                                                 |
| HTTP/authorization suite                  | 5 suites, 54 tests passed                                                                               |
| Scoped TypeScript check                   | Passed                                                                                                  |
| Changed TypeScript files lint             | Passed                                                                                                  |
| Database-backed workflow suite            | Not executed: fails before tests because `DATABASE_URL_TEST` is absent                                  |
| Existing full unit suite                  | 29 suites passed, 410 tests passed; 2 calendar suites failed to load because `googleapis` is missing    |
| Full backend build                        | Failed: unresolved `cookie-parser` and `googleapis` dependencies                                        |
| Full backend lint                         | Failed: existing dependency-related typing errors and existing formatting errors (55 errors, 1 warning) |
| Full formatting check                     | Failed: reported existing formatting differences in 229 files                                           |
| Deployed finance/dashboard and ERP/AI E2E | Not executed: test URLs, accounts and record IDs are not configured locally                             |

## Coverage review

`npm run test:finance-quality` writes JSON, JSON summary, text and LCOV output under
`coverage/finance-analytics-ai/`. Generated reports are ignored by Git; attach them to the PR/CI
run and the team test register after rerunning on the approved candidate.

Coverage measures eight business-service files: invoice, finance summary, PDF,
payment, analytics, AI forecasting, provider and prompt. It excludes declarative
DTOs, service bootstrap/modules, controllers and repositories. It is not a
whole-backend coverage claim. Repository persistence is checked separately by
the database suite, whose execution is still pending.

| Service                  | Statements | Branches |
| ------------------------ | ---------: | -------: |
| Invoice                  |     98.94% |   96.55% |
| Finance summary          |       100% |   97.77% |
| Invoice PDF              |       100% |     100% |
| Payment                  |     98.52% |   97.36% |
| Analytics                |     94.44% |   91.17% |
| AI forecasting           |       100% |   92.20% |
| AI provider              |       100% |   97.67% |
| AI prompt                |       100% |   95.23% |
| Aggregate measured scope |     98.46% |   94.29% |

Aggregate line coverage is 98.55%; function coverage is 96.40%. The config
enforces 80% statements/lines/functions and 90% branches, plus explicit 90%
branch thresholds for invoice/payment lifecycle, PDF, AI forecasting and
provider validation. Every measured service exceeds 90% branch coverage.

Remaining uncovered paths include analytics activity descriptions for some
entity types and defensive/unreachable invoice-number and retry exhaustion
paths. The measured targets pass; these do not establish concurrent invoice
number allocation correctness, which is outside the payment concurrency test.

## Acceptance coverage

| Ticket criterion        | Evidence                                                                                                                                                                                                                                                           |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| AC1 finance unit tests  | Invoice creation/issuance, customer matching, empty/forbidden edits, cancellation, cached/regenerated PDFs, PDF byte offsets/text escaping, local storage and mocked Blob upload/failure; partial/full payment, invalid/duplicate payments and transaction retries |
| AC2 finance integration | Existing HTTP request validation plus real gateway 401/403/allowed-role tests pass. New persisted creation/status/balance/rollback/concurrent-payment tests are written and type checked, but their database run is pending                                        |
| AC3 dashboard/analytics | Aggregation, project metrics, empty dashboards/reports, inclusive date ranges, pagination, expense sorting and missing project data covered; persisted payment-to-dashboard assertion awaits database run                                                          |
| AC4 AI paths            | Valid provider output, insufficient history, rule-based prediction, invalid JSON/schema, empty completions, provider/network errors and safe fallback covered without paid calls                                                                                   |
| AC5 coverage            | Scoped report generated and targets enforced as described above                                                                                                                                                                                                    |
| AC6 cross-module E2E    | Existing `tests/e2e/finance-dashboard.spec.ts` and `tests/e2e/ai-analytics.spec.ts` identified; deployed execution/evidence remains open                                                                                                                           |

## Defects and follow-up register

These are local tracking IDs, not GitHub issue numbers.

| ID     | Priority             | Finding / reproduction                                                                                             | Owner and required action                                                                                                                                    |
| ------ | -------------------- | ------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| DEF-01 | High, fixed          | Provider JSON `null` or a numeric overflow confidence (`1e400`) was not consistently rejected as an invalid schema | Person 4: object-shape and finite-number validation added with regression tests                                                                              |
| DEF-02 | Release blocker      | `npm run build:all` cannot resolve `cookie-parser` or `googleapis`; two full-unit calendar suites cannot load      | Gateway/calendar owners: reconcile dependency manifests/lockfile, install declared packages and rerun full checks                                            |
| DEF-03 | Verification blocker | `npm run test:finance-workflow` fails before running tests without `DATABASE_URL_TEST`                             | Person 4 / test database owner: configure an isolated migrated database, run all 6 database cases, attach logs and inspect cleanup                           |
| DEF-04 | Verification blocker | No local deployed E2E URLs, accounts or disposable invoice/project IDs                                             | Person 4 / shared tests maintainers: run the two critical Playwright workflows and authorization cases on staging; record actual passes/failures and defects |
| DEF-05 | Release blocker      | Full lint and format checks fail on existing source files                                                          | Respective module owners: resolve recorded typing/formatting failures and rerun mandatory backend checks                                                     |

For DEF-04, use the existing tests repository instructions. Configure
`FRONTEND_BASE_URL`, `API_BASE_URL`, `E2E_USER_EMAIL`, `E2E_USER_PASSWORD`,
`E2E_INVOICE_ID`, `E2E_PROJECT_ID` and restricted-role test account variables.
The payment E2E consumes outstanding balance: use disposable test data. Keep
credentials in environment/secret stores, never in this register.

## Sign-off remaining

- Record the database suite execution and both deployed critical workflows.
- Resolve full backend build/unit/lint/format blockers with their owners.
- Attach reports to the team Sprint 8 coverage/test-register evidence.
- Link the actual issue and reviewed PR against `develop`; complete peer review.

No staging/manual verification, CI success, PR approval or release sign-off is
claimed by this document.
