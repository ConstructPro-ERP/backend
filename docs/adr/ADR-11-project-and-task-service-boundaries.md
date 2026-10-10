# ADR-11: Project and Task Service Boundaries in the Deployed Backend

**Status:** Proposed — implemented, pending team/supervisor review  
**Date:** 2026-10-10  
**Deciders:** ConstructPro ERP team and academic supervisor (approval not yet recorded)  
**Related issues:** DDP-65 (#74), DDP-68 (#80), DDP-77 (#92), DDP-81 (#104), DDP-82 (#108)  
**Related ADRs:** ADR-09 (quotation orchestration), ADR-10 (project activation and quotation cardinality)  
**Relevant design baseline:** SRS FR-004 / UC-04 (quotation-to-Project conversion), FR-005 / UC-05 (milestone progress); SDS Chapter 1 (§§1.1–1.4), §2.1.1, §2.2.3 (Project, Task and Milestone relationships, Tables 11–14), and §6.2 (role authorization); Final Design Report, project/finance workflows and SDS reproduction

---

## Context

The approved SDS describes a hybrid layered design with a centralized NestJS backend for core ERP operations and supporting microservices for specialized workloads. During development the backend repository evolved into a NestJS multi-application codebase with a gateway and separately bootstrapped HTTP services. The Project domain is now implemented within `apps/project-service`, and Task Management within `apps/task-service`.

The SDS describes centralized core business logic with separate supporting microservices, whereas the implementation has separately bootstrapped core-domain NestJS applications. This is an **as-built architectural refinement** that merits review against the approved SDS; it is not a claim that the original SDS prescribed separately deployed Project and Task Services. SRS FR-004 and FR-005 establish the business outcomes, not these specific deployment boundaries.

## Decision

1. Keep Project creation, quotation attachment/conversion, lifecycle control, manager assignment, milestones, weighted project progress, and project expenses in **Project Service**.
2. Keep project-level and milestone-linked task CRUD, assignment, filtering, and task status changes in **Task Service**.
3. Expose public Project, Milestone, Expense, and Task routes through **API Gateway**; gateway routes use JWT authentication and role guards, forward the resolved actor context, and propagate controlled downstream errors.
4. Use HTTP between the gateway and the relevant NestJS service. The shared codebase currently uses **one Prisma schema and Neon PostgreSQL database**; this decision does **not** imply database-per-service isolation.
5. Retain Quotation Service as the orchestrator of quotation approval and conversion, and let Project Service handle the transactional project-side operation, as already documented by ADR-09/ADR-10.
6. Keep task status **independent of** milestone progress. Task completion does not automatically change milestone/project progress; the canonical project progress calculation is owned by Project Service.
7. Support **project-level Tasks with no linked Milestone** as well as Milestone-linked Tasks. This is an implementation refinement of the SDS §2.2.3 model (Tables 13–14), which presents Tasks referencing Milestones; the optional relationship must be reflected in the updated design baseline.
8. Store operational expenses in Project Service as **project-scoped financial records**, rather than introducing a separate Expense Service. Expense amount is stored as PostgreSQL `DECIMAL(12,2)`; invoices and payments remain separate workflows.
9. Interpret **SDS §6.2** as granting the Accountant finance write access while retaining read-only access to Project management: for **project expenses only**, Admin may create/read/update/delete, Accountant may create/read/update but **not** delete, and an assigned Project Manager may read but not modify financial records. The authorization policy should be confirmed against the approved role matrix during review.
10. Support separate service startup through the root `server.ts` and `DEPLOY_APP` selection for supported deployed applications.

## Current HTTP path

```text
Frontend / external caller
          |
          v
API Gateway  -- JWT verification / route RBAC / actor forwarding
      |                                      |
      v                                      v
Project Service                         Task Service
- projects / quotations                 - tasks
- milestones / progress                 - assignments
- expenses / summaries                  - task lifecycle
      |                                      |
      +----------- Prisma / Neon PostgreSQL--+
```

The API Gateway normally exposes these routes under `/api`. Downstream Project and Task Service routes are not prefixed with `/api` in the corresponding controllers.

## Rationale

- The Project Service owns project lifecycle invariants, so milestone progress and financial entries can be validated against the same project state.
- Task Service provides a separate operational workflow while still referencing Projects and optional Milestones relationally.
- Finance users need to manage actual expenses without granting them permission to alter Project lifecycle or manager assignments. Keeping financial CRUD permissions scoped to expense endpoints preserves this distinction.
- Keeping the existing HTTP gateway and Prisma infrastructure avoids introducing an event bus or distributed transaction solely for task management.
- Separately bootstrapped NestJS applications match the currently deployed monorepo layout and allow independent runtime configuration.

## Alternatives considered

| Alternative                                                     | Reason not selected for the current implementation                                                                                                       |
| --------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Keep every domain in one deployed NestJS modular monolith       | Does not match the now-implemented multi-application deployment and separate Task Service workflow.                                                      |
| Create a standalone Expense Service                             | Expense data is tightly coupled to project state, project access, and project date bounds; the accepted implementation places it inside Project Service. |
| Store task status as the source of milestone progress           | Would make progress dependent on task-count/status semantics and conflict with the deterministic milestone-weight model.                                 |
| Add a message broker or distributed saga for Project/Task calls | Not necessary for the current synchronous CRUD interfaces and adds an operational dependency.                                                            |

## Consequences and operational requirements

**Benefits:** clear code ownership; independently startable Task/Project services; shared Project lifecycle rules; reuse of existing API Gateway, Prisma, tests, and monitoring infrastructure.

**Trade-offs:** extra HTTP failure modes; shared database coupling; duplicated actor-resolution patterns in some services; explicit dependency on Project/Milestone records for task validation.

**Security precondition:** the current Project/Task HTTP services accept actor context forwarded by the gateway. The service boundary assumes downstream URLs cannot be called directly by untrusted external clients, or that an additional trusted-service authentication mechanism is implemented. The team intends to restrict external access through Vercel configuration, but that deployment control must be **verified**, not assumed to be active merely because it is documented here.

**Testing:** maintain unit, service-to-database integration, and gateway-to-service E2E tests, including authorization and downstream error propagation. Preserve service URLs as environment configuration rather than committing live credentials or private endpoints.

## Design and approval follow-up

- [ ] Supervisor/team review this architectural refinement within the guideline's one-sprint window for significant SDS deviations.
- [ ] Incorporate the verified deployed service diagram and gateway/service boundaries into a new approved version/addendum of SDS Chapter 1.
- [ ] Record the optional Task–Milestone relationship in SDS §2.2.3 and clarify expense-specific Accountant permissions against SDS §6.2; retain proof of client/supervisor approval if the access matrix changes.
- [ ] Verify deployed direct-service access restrictions and record evidence in the deployment/security report.
- [ ] Confirm whether further data-ownership isolation is needed at a later release; it is not part of Issues #74/#104/#108.

## Implementation evidence

- Project foundation: [PR #79](https://github.com/ConstructPro-ERP/backend/pull/79)
- Project operations: [PR #89](https://github.com/ConstructPro-ERP/backend/pull/89)
- Milestones/progress: [PR #99](https://github.com/ConstructPro-ERP/backend/pull/99)
- Task Service: [PR #107](https://github.com/ConstructPro-ERP/backend/pull/107)
- Expenses: [PR #109](https://github.com/ConstructPro-ERP/backend/pull/109)
- Source: `server.ts`, `apps/api-gateway/src/app.module.ts`, `apps/project-service/src/project.module.ts`, `apps/task-service/src/`, `prisma/schema.prisma`
