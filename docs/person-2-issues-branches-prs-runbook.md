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

> ℹ️ *Note the Issue Number assigned by GitHub (e.g., `#63`). Replace `<ISSUE_ID>` with this number below.*

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

*Example with Issue #63:*
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

## Work Item 2 (Week 10): Approval, Rejection & Revision UI + Error Handling

### Step 1: Create GitHub Issue

Go to GitHub &rarr; **Issues** &rarr; **New Issue**:

- **Issue Title:**
  ```text
  [Quotations] Approval, rejection, and revision UI with status transitions & validation errors
  ```
- **Issue Configuration:**
  - **Assignee:** `@me`
  - **Labels:** `feature`, `quotations`, `sprint-7`
  - **Project Board:** `Sprint 7` &rarr; Column: `Todo`
  - **Milestone:** `Sprint 7`

- **Issue Body:**
  ```markdown
  ## User Story
  As a Sales Manager and Admin,
  I want to review pending quotations, approve them, reject them with a mandatory reason, or send them for revision,
  So that quotations transition through a clear status lifecycle and display friendly backend validation errors.

  ## Acceptance Criteria
  - [ ] State Machine: `DRAFT` -> `PENDING_APPROVAL` -> `APPROVED` or `REJECTED`.
  - [ ] `PATCH /quotations/:id/reject` requires a non-empty `rejectionReason` (min 5 chars).
  - [ ] `PATCH /quotations/:id/revise` resets `REJECTED` quotations to editable state.
  - [ ] API Gateway enforces `@Roles('ADMIN', 'SALES_MANAGER')` on approval/rejection endpoints.
  - [ ] Rejection modal in frontend prompts for reason and records it in quotation notes.
  - [ ] Status transition badges render distinct visual styles per status.
  - [ ] Backend validation errors (400, 403, 404) render in UI alert banners.

  ## Definition of Done
  - [ ] Unit & E2E tests for rejection and revision flow pass.
  - [ ] Frontend displays rejection reason on rejected quotation cards.
  - [ ] PR created, reviewed, and merged into `develop`.
  ```

---

### Step 2: Project Board Action
1. Move the card for Issue `#<ISSUE_ID>` from **Todo** &rarr; **In Progress**.

---

### Step 3: Create Git Feature Branch

```bash
git checkout develop
git pull origin develop
git checkout -b feature/<ISSUE_ID>-quotation-approval-rejection-revision
```

---

### Step 4: Make Changes & Commit

```bash
# Verify formatting and linting
npm run format:check
npm run lint

# Run tests
npm test

# Commit changes
git add .
git commit -m "feat(quotation): implement rejection and revision backend endpoints"
git commit -m "feat(quotation): add approval and rejection modal UI with status badges"
git commit -m "fix(quotation): display structured backend validation errors in UI"

# Push to origin
git push -u origin feature/<ISSUE_ID>-quotation-approval-rejection-revision
```

---

### Step 5: Open Pull Request (PR)

- **Base Branch:** `develop` &larr; **Compare Branch:** `feature/<ISSUE_ID>-quotation-approval-rejection-revision`
- **PR Title:**
  ```text
  feat(quotation): complete approval, rejection and revision UI with validation errors (#<ISSUE_ID>)
  ```
- **PR Description:**
  ```markdown
  ## Summary
  Implements the full quotation review lifecycle including manager approval, rejection with required comments, quotation revision requests, and standardized error messaging.

  Closes #<ISSUE_ID>

  ## Changes Included
  - Added `PATCH /quotations/:id/reject` with validation for rejection reason.
  - Added `PATCH /quotations/:id/revise` to allow re-submitting rejected quotations.
  - Updated API Gateway guards to restrict approvals and rejections to `ADMIN` and `SALES_MANAGER`.
  - Created Frontend `RejectionReasonModal` and visual status timeline.
  - Standardized backend error extraction to show clear field-level validation messages.

  ## Checklist
  - [x] `npm run lint` passes.
  - [x] Status transition edge cases tested.
  - [x] Verified manager rejection and revision flow in UI.
  ```

---

### Step 6: Project Board Action (In Review)
1. Move the card from **In Progress** &rarr; **In Review**.

---

### Step 7: Merge & Move to "Completed"
1. Perform **Squash and merge**.
2. Verify GitHub closes `#<ISSUE_ID>` and card moves to **Completed** (or move it manually).
3. Clean up local branch:
   ```bash
   git checkout develop
   git pull origin develop
   git branch -d feature/<ISSUE_ID>-quotation-approval-rejection-revision
   ```

---
---

## Work Item 3 (Week 11): PDF Generation/Download & Quotation-to-Project Conversion

### Step 1: Create GitHub Issue

Go to GitHub &rarr; **Issues** &rarr; **New Issue**:

- **Issue Title:**
  ```text
  [Quotations] Quotation PDF generation/download & project conversion integration
  ```
- **Issue Configuration:**
  - **Assignee:** `@me`
  - **Labels:** `feature`, `quotations`, `sprint-7`
  - **Project Board:** `Sprint 7` &rarr; Column: `Todo`
  - **Milestone:** `Sprint 7`

- **Issue Body:**
  ```markdown
  ## User Story
  As a Sales Manager and Project Manager,
  I want to download a PDF copy of an approved quotation and convert the quotation into an active Project,
  So that project execution begins seamlessly and duplicate conversions are safely prevented.

  ## Acceptance Criteria
  - [ ] `GET /quotations/:id/pdf` generates and returns quotation PDF download URL or file stream.
  - [ ] UI provides a "Download PDF" action that downloads the quotation document.
  - [ ] `PATCH /quotations/:id/approve` (or convert) calls `project-service` to create a project record.
  - [ ] Idempotency: If quotation is already `CONVERTED`, returns HTTP `409 Conflict` with `{ code: 'ALREADY_CONVERTED', projectId }`.
  - [ ] Frontend displays "Convert to Project" modal with project parameters (manager, start date, budget).
  - [ ] When 409 Conflict occurs, UI displays: "Already converted to Project" with link to project page.

  ## Definition of Done
  - [ ] Integration test for duplicate conversion (409) passes.
  - [ ] PDF generation and download verified.
  - [ ] PR created, reviewed, and merged into `develop`.
  ```

---

### Step 2: Project Board Action
1. Move the card for Issue `#<ISSUE_ID>` from **Todo** &rarr; **In Progress**.

---

### Step 3: Create Git Feature Branch

```bash
git checkout develop
git pull origin develop
git checkout -b feature/<ISSUE_ID>-quotation-pdf-and-project-conversion
```

---

### Step 4: Make Changes & Commit

```bash
# Verify formatting and linting
npm run format:check
npm run lint

# Run tests
npm test

# Commit changes
git add .
git commit -m "feat(quotation): connect PDF generation and download endpoint"
git commit -m "feat(quotation): integrate project service conversion with 409 idempotency guard"
git commit -m "feat(quotation): add project conversion modal and duplicate conversion UI banner"

# Push to origin
git push -u origin feature/<ISSUE_ID>-quotation-pdf-and-project-conversion
```

---

### Step 5: Open Pull Request (PR)

- **Base Branch:** `develop` &larr; **Compare Branch:** `feature/<ISSUE_ID>-quotation-pdf-and-project-conversion`
- **PR Title:**
  ```text
  feat(quotation): quotation PDF download and project conversion integration (#<ISSUE_ID>)
  ```
- **PR Description:**
  ```markdown
  ## Summary
  Connects PDF document generation for approved quotations and integrates project creation with duplicate conversion conflict handling (HTTP 409 Conflict).

  Closes #<ISSUE_ID>

  ## Changes Included
  - Added PDF download route proxy in `api-gateway` and `quotation-service`.
  - Implemented Quotation-to-Project conversion calling `project-service` `/projects/from-quotation`.
  - Enforced Business Rule 10.2: Idempotent 409 Conflict guard against double-conversion.
  - Added "Download PDF" button in Quotation UI.
  - Added "Convert to Project" action modal with navigation to the created project.

  ## Checklist
  - [x] `npm run lint` passes.
  - [x] Duplicate conversion returns 409 and does not spawn orphan projects.
  - [x] PDF download verified.
  ```

---

### Step 6: Project Board Action (In Review)
1. Move the card from **In Progress** &rarr; **In Review**.

---

### Step 7: Merge & Move to "Completed"
1. Perform **Squash and merge**.
2. Verify GitHub closes `#<ISSUE_ID>` and card moves to **Completed**.
3. Clean up local branch:
   ```bash
   git checkout develop
   git pull origin develop
   git branch -d feature/<ISSUE_ID>-quotation-pdf-and-project-conversion
   ```

---
---

## Work Item 4 (Week 12): Full Workflow Testing, Bug Fixing & Demo Data

### Step 1: Create GitHub Issue

Go to GitHub &rarr; **Issues** &rarr; **New Issue**:

- **Issue Title:**
  ```text
  [Quotations] E2E workflow testing, bug fixes and Sprint 7 demo data preparation
  ```
- **Issue Configuration:**
  - **Assignee:** `@me`
  - **Labels:** `testing`, `quotations`, `sprint-7`
  - **Project Board:** `Sprint 7` &rarr; Column: `Todo`
  - **Milestone:** `Sprint 7`

- **Issue Body:**
  ```markdown
  ## User Story
  As the Sprint 7 Demo Team,
  We want comprehensive test coverage and realistic seed data for the quotation-to-project workflow,
  So that the Sprint 7 live demonstration executes smoothly without failures or edge-case errors.

  ## Acceptance Criteria
  - [ ] All Supertest E2E specs in `test/quotation-service/quotation.e2e-spec.ts` pass cleanly.
  - [ ] Unit test coverage for quotation calculations and status transitions exceeds 85%.
  - [ ] Seed script creates sample leads, draft quotations, pending quotations, and approved quotations.
  - [ ] Edge cases resolved: zero prices, empty item list, invalid lead IDs, network timeouts.
  - [ ] Sprint 7 live demo walkthrough script tested end-to-end.

  ## Definition of Done
  - [ ] All automated tests pass in CI pipeline.
  - [ ] Demo database seeded and verified in staging/local environment.
  - [ ] PR merged into `develop`.
  ```

---

### Step 2: Project Board Action
1. Move the card for Issue `#<ISSUE_ID>` from **Todo** &rarr; **In Progress**.

---

### Step 3: Create Git Feature Branch

```bash
git checkout develop
git pull origin develop
git checkout -b feature/<ISSUE_ID>-quotation-e2e-tests-and-demo-data
```

---

### Step 4: Make Changes & Commit

```bash
# Run full test suite
npm run test:e2e
npm test

# Verify seed script
npx ts-node prisma/seeds/quotation-demo.seed.ts

# Commit changes
git add .
git commit -m "test(quotation): add comprehensive E2E test cases for quotation workflow"
git commit -m "fix(quotation): handle edge cases for empty line items and timeout fallbacks"
git commit -m "chore(quotation): add Sprint 7 demo data seed script"

# Push to origin
git push -u origin feature/<ISSUE_ID>-quotation-e2e-tests-and-demo-data
```

---

### Step 5: Open Pull Request (PR)

- **Base Branch:** `develop` &larr; **Compare Branch:** `feature/<ISSUE_ID>-quotation-e2e-tests-and-demo-data`
- **PR Title:**
  ```text
  test(quotation): E2E test suites, bug fixes and Sprint 7 demo data (#<ISSUE_ID>)
  ```
- **PR Description:**
  ```markdown
  ## Summary
  Completes automated testing across the quotation-to-project workflow, fixes remaining edge cases, and provides seed data for the Sprint 7 demo.

  Closes #<ISSUE_ID>

  ## Changes Included
  - Completed Supertest E2E test suite in `test/quotation-service/quotation.e2e-spec.ts`.
  - Added unit test specs for item calculations and status guards.
  - Added demo seed script in `prisma/seeds/quotation-demo.seed.ts` with 2 demo leads and 4 sample quotations.
  - Fixed edge-case bug when submitting empty items array.

  ## Checklist
  - [x] All unit and E2E tests pass (`npm run test:e2e`).
  - [x] Database seed runs without error.
  - [x] Demo walkthrough executed successfully.
  ```

---

### Step 6: Project Board Action (In Review)
1. Move the card from **In Progress** &rarr; **In Review**.

---

### Step 7: Merge & Move to "Completed"
1. Perform **Squash and merge**.
2. Verify GitHub closes `#<ISSUE_ID>` and card moves to **Completed**.
3. Clean up local branch:
   ```bash
   git checkout develop
   git pull origin develop
   git branch -d feature/<ISSUE_ID>-quotation-e2e-tests-and-demo-data
   ```

---
---

## Summary Cheat Sheet

| Week | Work Item | Branch Name Pattern | PR Keyword | Board Final State |
| :--- | :--- | :--- | :--- | :--- |
| **Week 9** | Quotation List, Create, Edit & Calculations | `feature/<ID>-quotation-list-edit-calculations` | `Closes #<ID>` | **Completed** |
| **Week 10** | Approval, Rejection & Revision UI | `feature/<ID>-quotation-approval-rejection-revision` | `Closes #<ID>` | **Completed** |
| **Week 11** | PDF Download & Project Conversion | `feature/<ID>-quotation-pdf-and-project-conversion` | `Closes #<ID>` | **Completed** |
| **Week 12** | E2E Testing, Bug Fixes & Demo Data | `feature/<ID>-quotation-e2e-tests-and-demo-data` | `Closes #<ID>` | **Completed** |
