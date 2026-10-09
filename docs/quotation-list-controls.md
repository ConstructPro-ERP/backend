# [DDP-#] feat(quotations): complete quotation search, filtering and pagination

**Assignee:** Person 2  
**Repository:** `frontend`  
**Labels:** `epic:ui-frontend`, `epic:integration`, `feat`  
**Priority:** P2  
**Sprint:** Sprint 7 – Integration & UX  
**Phase:** Development  
**Estimate:** 5 hours  
**Suggested Branch:** `feature/#-quotation-list-controls`

## User Story

As a sales or management user, I want to search and filter quotations so that I can quickly find records by workflow state.

## Background / Context

The quotation integration already includes status-oriented behavior. This ticket completes list controls and keeps them backend-backed rather than prototype-driven.

### Traceability

- SRS: FR-003
- SDS: Section 5.1.3 Quotations UI

## Acceptance Criteria

### AC1: Status filtering

**Given** quotations in multiple statuses
**When** a status filter is selected
**Then** matching backend results are displayed.

### AC2: Search

**Given** supported searchable data
**When** a search term is entered
**Then** matching backend results are shown.

### AC3: Pagination

**Given** multiple result pages
**When** page changes
**Then** the correct backend page is rendered.

### AC4: Empty results

**Given** no results match
**When** filters/search are active
**Then** a meaningful empty state is shown.

## Technical Notes

- Use supported backend query parameters.
- Do not keep a duplicate authoritative list in local/session storage.
- Preserve current selection where reasonable.

## Test Requirements

- [ ] Filter/search query mapping.
- [ ] Pagination boundaries.
- [ ] Empty results.

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

- Quotation integration PR must be merged.
