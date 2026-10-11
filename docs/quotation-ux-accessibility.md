# [DDP-#] feat(quotations): improve quotation form UX, accessibility and responsive behavior

**Assignee:** Person 2  
**Repository:** `frontend`  
**Labels:** `epic:ui-frontend`, `feat`  
**Priority:** P2  
**Sprint:** Sprint 7 – Integration & UX  
**Phase:** Development  
**Estimate:** 6 hours  
**Suggested Branch:** `feature/#-quotation-ux-accessibility`

## User Story

As a sales or management user, I want the quotation workflow to be clear and accessible so that I can complete quotation tasks efficiently on supported devices.

## Background / Context

Sprint 7 includes UI completion and UX polish. The SDS targets WCAG 2.1 AA and requires keyboard-operable forms, visible focus, clear errors and textual status labels.

### Traceability

- SRS: NFR-05, NFR-06, NFR-14
- SDS: Section 5.3 Accessibility Considerations

## Acceptance Criteria

### AC1: Accessible forms

**Given** quotation inputs
**When** keyboard/assistive technology is used
**Then** fields, instructions and errors are associated correctly.

### AC2: Keyboard dialogs

**Given** edit/reject/convert dialogs
**When** operated without a mouse
**Then** all required actions remain available.

### AC3: Status clarity

**Given** quotation statuses
**When** rendered
**Then** meaning is conveyed by text as well as color.

### AC4: Responsive behavior

**Given** desktop, tablet or mobile
**When** quotation screens are used
**Then** core actions and line items remain usable.

## Technical Notes

- Preserve the dashboard visual language.
- Use semantic controls and visible focus.
- Keep form simplification in mind.
- Ensure PDF/download actions have accessible labels.

## Test Requirements

- [ ] Keyboard interaction.
- [ ] Validation message association.
- [ ] Responsive smoke checks.

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

Estimated: 6 hours

## Dependencies

- Core quotation UI stable.
