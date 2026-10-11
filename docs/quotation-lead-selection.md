# [DDP-#] feat(quotations): integrate quotation creation with real lead selection

**Assignee:** Person 2  
**Repository:** `frontend`  
**Labels:** `epic:ui-frontend`, `epic:integration`, `feat`  
**Priority:** P1  
**Sprint:** Sprint 7 – Integration & UX  
**Phase:** Development  
**Estimate:** 5 hours  
**Suggested Branch:** `feature/#-quotation-lead-selection`

## User Story

As a sales user, I want to select an existing lead when creating a quotation so that quotations stay linked to the sales pipeline.

## Background / Context

Quotation creation should use real lead data. The SRS requires a lead to exist before a quotation can be generated.

### Traceability

- SRS: FR-003, UC-03 — Generate Quotation
- SDS: Section 5.1.3 Quotations UI; Section 5.2.2 Lead–Quotation–Project flow

## Acceptance Criteria

### AC1: Load eligible leads

**Given** the quotation form is opened
**When** lead data is available
**Then** eligible leads are loaded from the backend.

### AC2: Select lead

**Given** available leads
**When** one is selected
**Then** its identifier and client context are attached to the form.

### AC3: Submit quotation

**Given** a selected lead and valid items
**When** submitted
**Then** the backend receives the real lead identifier.

### AC4: Invalid lead

**Given** a lead is deleted/unavailable
**When** submission occurs
**Then** the backend error is shown and no false success appears.

## Technical Notes

- Reuse the lead API/service.
- Avoid raw UUID entry where a user-friendly selector is possible.
- Keep form state consistent with current quotation components.

## Test Requirements

- [ ] Lead selector mapping.
- [ ] Quotation payload includes selected lead ID.
- [ ] Unavailable-lead handling.

## Definition of Done (DoD)

- [ ] Code implemented and follows team coding standards.
- [ ] All acceptance criteria are satisfied.
- [ ] Required tests are added/updated and passing.
- [ ] New testable logic meets the project coverage target where applicable.
- [ ] Lint and format checks pass.
- [ ] Production build passes.
- [ ] Pull request raised against `develop`.
- [ ] At least one peer review completed and all comments resolved.
- [ ] No secrets or credentials committed.
- [ ] Issue referenced in commits and PR.
- [ ] Issue moved to `Done` after merge.

## Estimate

Estimated: 5 hours

## Dependencies

- Lead backend/API integration.
- Existing quotation UI integration.
