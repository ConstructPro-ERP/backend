# [DDP-#] fix(quotations): align quotation actions with backend roles and API contracts

**Assignee:** Person 2  
**Repository:** `frontend`  
**Labels:** `epic:integration`, `epic:ui-frontend`, `fix`  
**Priority:** P1  
**Sprint:** Sprint 7 – Integration & UX  
**Phase:** Development  
**Estimate:** 5 hours  
**Suggested Branch:** `fix/#-quotation-api-role-alignment`

## User Story

As a quotation user, I want actions and statuses to match backend rules so that approval, rejection, revision and conversion behave consistently.

## Background / Context

The quotation UI already contains approval/conversion work, but Sprint 7 must finalize role names, status mappings and error contracts against the actual backend.

### Traceability

- SRS: FR-003, FR-004; Business Rule 10.2 Quotation Approval Policy
- SDS: Section 5.2.2 Lead–Quotation–Project flow; Chapter 6 Security Design

## Acceptance Criteria

### AC1: Role consistency

**Given** users with different roles
**When** quotation actions render
**Then** approve/reject/convert controls match backend authorization rules.

### AC2: Status consistency

**Given** backend statuses
**When** rendered
**Then** one consistent frontend mapping is used.

### AC3: Invalid transitions

**Given** an incompatible state
**When** an invalid action is attempted
**Then** the backend error is shown clearly.

### AC4: Duplicate conversion

**Given** an already converted quotation
**When** conversion is retried
**Then** the conflict is handled idempotently and the existing project is surfaced when available.

## Technical Notes

- Compare frontend types with current backend DTOs/enums.
- Centralize response/error mapping.
- Backend status/permissions are authoritative.
- Do not add frontend-only transitions.

## Test Requirements

- [ ] Role/action visibility.
- [ ] Status mapper.
- [ ] 409/invalid-transition handling.

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

- Quotation integration PR.
- Shared RBAC helpers where used.
