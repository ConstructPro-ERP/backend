# ADR-13: Controlled Deletion of Unused Planning Projects

**Status:** Proposed — implemented, pending team/supervisor review  
**Date:** 2026-10-10  
**Deciders:** ConstructPro ERP team and academic supervisor (approval not yet recorded)  
**Issue:** DDP-68 — [#80](https://github.com/ConstructPro-ERP/backend/issues/80)  
**Related ADR:** ADR-10 — Project Activation and Multiple Quotations  
**Requirements/design traceability:** SRS FR-004 / UC-04 (creation of Projects from quotations); SDS §2.1.1 (Project domain), §2.2.3 (Project relations) and §5.2.3 (Project management flow). The no-hard-delete rule is explicit in Issue #80, but is **not established as a blanket prohibition in the inspected SRS/SDS**.

---

## Context

The initial DDP-68 scope said not to support hard deletion: a project should be marked `CANCELLED` to preserve business history. During implementation the team retained a narrowly scoped deletion route to allow an administrator to remove an _unused_ project still in `PLANNING`.

PR #89 identifies this as an intentional deviation from Issue #80. The SRS/SDS document the Project domain and lifecycle context, but the reviewed passages do not explicitly forbid all Project hard deletion. The decision is therefore an **issue-scope refinement**; it should not be labeled as a confirmed SDS deviation without separate evidence. It must not be interpreted as permission to delete active Projects or Projects with operational history.

## Decision

`DELETE /projects/:id` is retained under these conditions:

1. The actor must be an authenticated, active **ADMIN**.
2. The target project must exist and have status **`PLANNING`**.
3. The repository must find **zero related records** across the currently checked domains:
   - quotations
   - milestones
   - tasks
   - expenses
   - invoices
   - documents
   - reports
   - AI knowledge chunks
4. If the status is not `PLANNING`, or if any checked related records exist, return **409 `PROJECT_DELETION_NOT_ALLOWED`**, directing the operator to cancel the project instead.
5. If the conditions are satisfied, delete the unused Project record and return the current success response.
6. Preserve `CANCELLED` as the normal terminal state for projects with any business history.

This is a **cleanup exception**, not a general hard-delete workflow.

## Rationale

- A draft project created accidentally before any associated records exist can be cleaned up without accumulating empty entries.
- Admin-only authorization limits accidental or unauthorized deletion.
- Status and related-record checks protect normal construction projects and their financial/operational history.
- `CANCELLED` remains the correct auditable alternative after business activity begins.

## Alternatives considered

| Alternative                                              | Why not selected                                                                                                       |
| -------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| Never permit hard deletion, including unused drafts      | Preserves all drafts but creates permanent noise from accidental empty records.                                        |
| Allow administrators to delete any project               | Creates unacceptable loss of quotations, financial entries, task and milestone history, and other operational records. |
| Allow assigned Project Managers to delete draft projects | Gives broader permanent-deletion authority than needed for routine management.                                         |
| Implement soft-deletion for all projects                 | Adds a separate data-visibility/retention model beyond the current issue scope.                                        |

## Consequences and limitations

**Positive:** controlled cleanup of empty draft records without compromising intentional lifecycle cancellation.

**Trade-off:** deletion requires checking multiple relationships; future Project relations must be added to the dependency check. A new relationship that is not included in the check could otherwise make the policy incomplete.

**Concurrency note:** the current code checks dependencies and then invokes `prisma.project.delete(...)`; unlike the project-lifecycle transitions, this particular method does not wrap the check and delete in an explicit serializable transaction with row locking. Database foreign-key constraints may reject conflicting deletes, but this ADR does not claim fully atomic delete-policy enforcement. Consider a follow-up hardening issue if concurrent dependent-record insertion becomes a realistic risk.

## Design and approval follow-up

- [ ] Review the exception with the team/supervisor, distinguishing the documented Issue #80 deviation from any SDS change that still requires verification.
- [ ] Reflect the Admin-only, `PLANNING`-only deletion exception in the next approved SDS lifecycle/update appendix.
- [ ] Keep the current eight relationship checks in sync with future schema changes.
- [ ] Track transaction/foreign-key race hardening separately if required by the project risk review.

## Implementation evidence

- [Issue #80](https://github.com/ConstructPro-ERP/backend/issues/80)
- [PR #89](https://github.com/ConstructPro-ERP/backend/pull/89)
- Source: `apps/project-service/src/project.service.ts` (`remove`), `apps/project-service/src/repositories/project.repository.ts` (`findDeletionDetails`), `apps/project-service/src/project-access.service.ts`
