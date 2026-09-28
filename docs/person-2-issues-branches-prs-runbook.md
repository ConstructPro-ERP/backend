# Person 2: Issues, Branches & PRs Execution Runbook

This document is your step-by-step operating checklist for **Person 2 (Quotations and Project Conversion Integration)**. It contains **only** the sequential workflow for each deliverable: **GitHub Issue &rarr; Project Board &rarr; Branch Name &rarr; Commits &rarr; Pull Request &rarr; Project Board Completed**.

---

## The Standard Cycle (Repeat for Each Work Item)

```text
[1. Create Issue] ──> [2. Board: Move to "In Progress"] ──> [3. Create Branch]
         ▲                                                               │
         │                                                               ▼
[6. Board: "Completed"] <── [5. Board: "In Review"] <── [4. Open PR with Closes #ID]
```

---

## Work Item 1 (Week 9): Quotation List, Create, Edit & Calculations

### Step 1: Create GitHub Issue

Go to GitHub &rarr; **Issues** &rarr; **New Issue**, and paste the following:

- **Issue Title:**
  ```text
  [Quotations] Connect quotation list, create, edit & details pages with item calculations
  ```
- **Issue Configuration:**
  - **Assignee:** `@me`
  - **Labels:** `feature`, `quotations`, `sprint-7`
  - **Project Board:** `Sprint 7` &rarr; Column: `Todo`
  - **Milestone:** `Sprint 7`

- **Issue Body:**
  ```markdown
  ## User Story

  As a Sales Representative and Sales Manager,
  I want to view all quotations in a list, create a new quotation for a lead, edit draft quotations, and view detailed quotation items,
  So that quotations accurately calculate line items and match backend precision without calculation drift.

  ## Acceptance Criteria

  - [ ] `GET /quotations` returns paginated list of quotations with lead info and items.
  - [ ] `GET /quotations/:id` returns full details of a single quotation.
  - [ ] `PUT /quotations/:id` updates notes and recalculates line items for editable quotations.
  - [ ] API Gateway forwards all 3 endpoints with appropriate JWT and RBAC guards.
  - [ ] Item calculations synced between frontend and backend: `amount = round2(quantity * unitPrice)` and `totalAmount = round2(sum(amounts))`.
  - [ ] Frontend `QuotationsDashboardClient` loads live quotations from backend on mount.

  ## Definition of Done

  - [ ] Unit tests for quotation calculations pass.
  - [ ] Frontend displays quotation list with correct status badges and currency formatting.
  - [ ] PR created, reviewed, and merged into `develop`.
  ```

> ℹ️ _Note the Issue Number assigned by GitHub (e.g., `#63`). Replace `<ISSUE_ID>` with this number below._

---

### Step 2: Project Board Action

1. Open your GitHub **Sprint 7 Project Board**.
2. Find the card for Issue `#<ISSUE_ID>`.
3. Drag the card from **Todo** &rarr; **In Progress**.

---

### Step 3: Create Git Feature Branch

Run these commands in your local terminal:

```bash
# 1. Switch to develop and pull latest upstream commits
git checkout develop
git pull origin develop

# 2. Create and switch to your feature branch (use your actual issue number)
git checkout -b feature/<ISSUE_ID>-quotation-list-edit-calculations
```

_Example with Issue #63:_

```bash
git checkout -b feature/63-quotation-list-edit-calculations
```

---

### Step 4: Make Changes & Commit

Work through the implementation, then run validation checks and commit:

```bash
# Verify formatting and linting
npm run format:check
npm run lint

# Run quotation unit tests
npm test quotation

# Stage and commit using conventional commit messages
git add .
git commit -m "feat(quotation): implement quotation list, details, and edit endpoints"

# If fixing frontend calculations:
git commit -m "fix(quotation): sync 2-decimal item calculation precision with backend"

# Push the branch to remote
git push -u origin feature/<ISSUE_ID>-quotation-list-edit-calculations
```

---

### Step 5: Open Pull Request (PR)

Go to GitHub &rarr; click **Compare & pull request**:

- **Base Branch:** `develop` &larr; **Compare Branch:** `feature/<ISSUE_ID>-quotation-list-edit-calculations`
- **PR Title:**
  ```text
  feat(quotation): connect quotation list, create, edit and details pages (#<ISSUE_ID>)
  ```
- **PR Description (copy-paste):**
  ```markdown
  ## Summary

  Implements full quotation browsing, creation, editing, and details viewing. Fixes floating-point calculation drift across frontend and backend.

  Closes #<ISSUE_ID>

  ## Changes Included

  - Added `GET /quotations` with pagination and status/lead filtering in `quotation-service`.
  - Added `GET /quotations/:id` and `PUT /quotations/:id` for editing draft quotations.
  - Forwarded routes in `api-gateway` (`QuotationsGatewayController`).
  - Synced `round2` calculation logic on client and server (`quantity * unitPrice`).
  - Switched `QuotationsDashboardClient` from preview mock state to live API fetching.

  ## Checklist

  - [x] Code passes `npm run lint`.
  - [x] Code passes `npm run format:check`.
  - [x] Unit tests pass.
  - [x] Tested locally end-to-end.
  ```

---

### Step 6: Project Board Action (In Review)

1. Go to your **Sprint 7 Project Board**.
2. Drag the card for `#<ISSUE_ID>` from **In Progress** &rarr; **In Review**.
3. Request review from a teammate or lead.

---

### Step 7: Merge & Move to "Completed"

1. Once approved and all CI checks pass, click **Squash and merge**.
2. Confirm the merge commit message.
3. **Move to Completed:**
   - Because your PR contained `Closes #<ISSUE_ID>`, GitHub automatically closes the issue.
   - If your Project Board has workflow automation, the card moves automatically to **Done / Completed**.
   - If not automated, drag the card into the **Completed** column manually.
4. Clean up local branch:
   ```bash
   git checkout develop
   git pull origin develop
   git branch -d feature/<ISSUE_ID>-quotation-list-edit-calculations
   ```

---

---

## Work Item 2 (Weeks 10–12 Consolidated): Full Quotation Workflow, Rejection/Revision, PDF Generation, Project Conversion & Demo Data

> ℹ️ **Consolidation Note:** Because repository branch protection requires peer review approvals with write access before merging to `develop`, all remaining deliverables for Weeks 10, 11, and 12 are unified into **one single GitHub Issue** and **one consolidated Pull Request** to streamline approvals and avoid review bottlenecks.

---

### Step 1: Create GitHub Issue

Go to GitHub &rarr; **Issues** &rarr; **New Issue**, and paste the following:

- **Issue Title:**
  ```text
  [Quotations] Complete quotation review lifecycle, PDF generation, project conversion & demo seed data
  ```
- **Issue Configuration:**
  - **Assignee:** `@me`
  - **Labels:** `feature`, `quotations`, `testing`, `sprint-7`
  - **Project Board:** `Sprint 7` &rarr; Column: `Todo`
  - **Milestone:** `Sprint 7`

- **Issue Body:**
  ```markdown
  ## User Story

  As a Sales Manager, Project Manager, and Admin,
  I want a complete quotation lifecycle — including approving/rejecting quotations with mandatory feedback, revising rejected quotes, generating quotation PDFs, converting approved quotations to projects with duplicate prevention, and having realistic demo data,
  So that the entire quotation-to-project pipeline operates reliably without data inconsistencies or approval bottlenecks.

  ## Acceptance Criteria

  ### Week 10: Lifecycle & Rejection/Revision

  - [ ] State Machine: `DRAFT` &rarr; `PENDING_APPROVAL` &rarr; `APPROVED` or `REJECTED` &rarr; `CONVERTED`.
  - [ ] `PATCH /quotations/:id/reject` requires a mandatory reason (minimum 5 characters) and appends it to notes.
  - [ ] `PATCH /quotations/:id/revise` safely moves `REJECTED` quotations back to `DRAFT` for updates.
  - [ ] Strict status transition guards reject invalid state changes with HTTP 400 (`INVALID_STATUS_TRANSITION`).
  - [ ] API Gateway enforces RBAC with `@Roles('ADMIN', 'SALES_MANAGER')` on review actions.

  ### Week 11: PDF Retrieval & Project Conversion Integration

  - [ ] `GET /quotations/:id/pdf` generates and returns PDF URL via `DocumentClient`, persisting `pdfUrl`.
  - [ ] `PATCH /quotations/:id/approve` integrates with `project-service` (`POST /projects/from-quotation`).
  - [ ] Duplicate conversion prevention: Returns HTTP 409 Conflict (`ALREADY_CONVERTED`) if quotation is already converted.
  - [ ] Downstream notification dispatching upon successful project conversion (`notifyProjectCreated`).

  ### Week 12: Testing, Edge Cases & Sprint 7 Demo Data

  - [ ] Comprehensive unit tests for `reject()`, `revise()`, `getPdf()`, `round2()`, and API Gateway forwarding.
  - [ ] Realistic Sprint 7 demo seed script (`prisma/seeds/quotation-demo.seed.ts`) covering all 5 quotation statuses (`DRAFT`, `PENDING_APPROVAL`, `APPROVED`, `REJECTED`, `CONVERTED`) and realistic lead profiles.

  ## Definition of Done

  - [ ] All unit and integration test suites pass cleanly.
  - [ ] Zero linting or formatting errors (`npm run lint` & `npm run format:check`).
  - [ ] Single consolidated PR created, reviewed, and merged into `develop`.
  ```

> ℹ️ _Issue Number assigned by GitHub: `#86`._

---

### Step 2: Project Board Action

1. Open your GitHub **Sprint 7 Project Board**.
2. Find the card for Issue `#86`.
3. Drag the card from **Todo** &rarr; **In Progress**.

---

### Step 3: Create Git Feature Branch

Run these commands in your local terminal:

```bash
# 1. Fetch latest commits from origin
git fetch origin

# 2. Branch from your Week 9 work branch (feature/84-quotation-list-edit-calculations)
git checkout feature/84-quotation-list-edit-calculations
git pull origin feature/84-quotation-list-edit-calculations
git checkout -b feature/86-quotation-workflow-completion
```

---

### Step 4: Make Changes & Commit

```bash
# Verify formatting and linting
npm run format:check
npm run lint

# Run quotation unit and E2E tests
node node_modules/jest/bin/jest.js test/quotation-service/quotation.service.spec.ts test/quotation-service/quotations-gateway.controller.spec.ts
node node_modules/jest/bin/jest.js --config ./test/jest-e2e.json test/quotation-service/quotation.e2e-spec.ts

# Stage and commit using conventional commit messages
git add .
git commit -m "feat(quotation): complete approval, rejection, PDF generation, conversion, and demo data (#86)"

# Push the branch to remote
git push -u origin feature/86-quotation-workflow-completion
```

---

### Step 5: Open Consolidated Pull Request (PR)

Go to GitHub &rarr; click **Compare & pull request**:

- **Base Branch:** `develop` &larr; **Compare Branch:** `feature/86-quotation-workflow-completion`
- **PR Title:**
  ```text
  feat(quotation): complete approval, rejection, PDF generation, conversion, and demo data (#86)
  ```
- **PR Description (copy-paste):**
  ```markdown
  ## Summary

  Consolidates all remaining deliverables for Person 2 (Weeks 10, 11, and 12) into a single unified PR to accelerate peer review and merging. Covers the complete quotation review lifecycle, PDF generation/retrieval, project conversion integration with duplicate-conversion prevention, and realistic Sprint 7 demo seed data.

  Closes #86

  ## Changes Included

  ### Week 10: Lifecycle & Review Flow

  - Added `RejectQuotationDto` with `@MinLength(5)` validation on `reason`.
  - Implemented `reject(id, reason)` in `QuotationService`: moves `PENDING_APPROVAL` to `REJECTED` and records rejection reason.
  - Implemented `revise(id)` in `QuotationService`: moves `REJECTED` to `DRAFT` allowing sales reps to update and re-submit.
  - Added transition guards throwing `INVALID_STATUS_TRANSITION` on disallowed status changes.
  - Exposed routes `@Patch(':id/reject')` and `@Patch(':id/revise')` in `QuotationController` and `QuotationsGatewayController` with RBAC `@Roles('ADMIN', 'SALES_MANAGER')`.

  ### Week 11: PDF Generation & Project Conversion

  - Implemented `getPdf(id)` in `QuotationService`: returns existing URL or delegates to `DocumentClient` to generate PDF and persist `pdfUrl`.
  - Exposed `@Get(':id/pdf')` on service and gateway controllers with `@Roles('ADMIN', 'SALES_MANAGER', 'PROJECT_MANAGER', 'ACCOUNTANT')`.
  - Verified `approveAndConvert(id, dto)` with idempotency guard throwing HTTP 409 Conflict (`ALREADY_CONVERTED`) if already converted.

  ### Week 12: Testing, Demo Data & Hardening

  - Created realistic Sprint 7 demo seed script `prisma/seeds/quotation-demo.seed.ts` seeding demo leads (Skyline Heights, Lotus Villa, Ocean Breeze) and quotations across all 5 statuses (`DRAFT`, `PENDING_APPROVAL`, `APPROVED`, `REJECTED`, `CONVERTED`).
  - Added comprehensive unit tests in `quotation.service.spec.ts` covering `reject()`, `revise()`, `getPdf()`, and precision calculation.
  - Added RolesGuard and controller forwarding tests in `quotations-gateway.controller.spec.ts`.
  - Added full Supertest E2E test suites in `quotation.e2e-spec.ts` for reject, revise, and PDF generation.

  ## Verification

  - [x] Unit tests pass: `node node_modules/jest/bin/jest.js test/quotation-service/quotation.service.spec.ts test/quotation-service/quotations-gateway.controller.spec.ts` (63/63 passing).
  - [x] E2E tests pass: `node node_modules/jest/bin/jest.js --config ./test/jest-e2e.json test/quotation-service/quotation.e2e-spec.ts` (14/14 passing).
  - [x] Code passes `npm run format:check`.
  ```

---

### Step 6: Project Board Action (In Review)

1. Go to your **Sprint 7 Project Board**.
2. Drag the card for `#86` from **In Progress** &rarr; **In Review**.
3. Request review from a teammate with write access.

---

### Step 7: Merge & Move to "Completed"

1. Once approved and all CI checks pass, click **Squash and merge**.
2. GitHub automatically closes Issue `#86`.
3. Move the card on the Project Board to **Completed**.
4. Clean up local branch:
   ```bash
   git checkout develop
   git pull origin develop
   git branch -d feature/86-quotation-workflow-completion
   ```

---

---

## Summary Cheat Sheet

| Deliverable            | Scope                                            | Branch Name Pattern                           | PR Keyword   | Board Final State      |
| :--------------------- | :----------------------------------------------- | :-------------------------------------------- | :----------- | :--------------------- |
| **PR 1 (Week 9)**      | Quotation List, Create, Edit & Calculations      | `feature/84-quotation-list-edit-calculations` | `Closes #84` | **In Review / Merged** |
| **PR 2 (Weeks 10–12)** | Rejection, Revision, PDF, Conversion & Demo Data | `feature/86-quotation-workflow-completion`    | `Closes #86` | **Completed**          |

