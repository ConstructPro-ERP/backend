# ADR-10: Project Activation and Multiple Quotations

**Status:** Accepted  
**Date:** 2026-09-15  
**Deciders:** Refer to the corresponding client/supervisor approval evidence for the multiple-Quotation Project refinement  
**Issue:** #65 — Project Domain Foundation and Quotation Conversion  
**Related migration:** DDP-67 — Project–Quotation One-to-Many  
**Related ADR:** ADR-09 — Quotation Orchestrates Project Creation

---

## Context

The approved requirements establish a quotation-to-project workflow in which a Quotation must be approved before it can initiate active Project work.

The original SDS database design represents a Project as being associated with a single Quotation. In SDS §2.2.3 Table 11, the Project relation contains a `quotation_id`, representing the original design baseline.

The client later clarified that a single construction Project may contain multiple Quotations for separate scopes of work, such as design, planning, visualization, and construction.

Creating a separate Project for every Quotation would therefore incorrectly duplicate the same construction Project.

The implemented relationship stores nullable `projectId` on Quotation. This allows multiple Quotations to reference the same Project while each individual Quotation references at most one Project.

The clarification also requires explicit Project activation rules because a Project may contain a mixture of approved, converted, and pending Quotations.

This ADR records the later Project activation, Project–Quotation cardinality, retry, concurrency, and budget decisions. It extends the architecture established by ADR-09 without rewriting ADR-09's historical decision record.

---

## Requirements and Design Traceability

The following approved baseline requirements remain unchanged:

- **SRS FR-004:** Quotations are converted into Projects.
- **SRS §3.2 System Functions:** approved Quotations are converted into active Projects.
- **SRS §10.2 Quotation Approval Policy:** a Quotation must be approved before conversion into an active Project.
- **SRS UC-04 (§14.4):** an approved Quotation is converted into an active construction Project.
- **SDS §2.1.1:** when a Quotation is approved, it may be converted into a Project.
- **SDS §4.3:** defines the Quotation Approval and Project Creation sequence.
- **SDS §5.2.2 / Figure 18:** describes the lead → quotation → Project workflow.
- **SDS §5.2.3 / Figure 19:** describes activities performed within an active Project.
- **Final Design Report §4.1.2:** quotation review and approval occur before Project creation.
- **Final Design Report §4.1.3:** Project Management operates after a Quotation becomes an active Project.

The following behavior is a later client-confirmed refinement and is not stated explicitly in the original SRS/SDS:

- One construction Project may contain multiple Quotations for separate scopes of work.
- Each individual Quotation may reference at most one Project.
- A Project does not require every associated Quotation to be approved before active Project work can begin.
- A `PLANNING` Project becomes `ACTIVE` when at least one associated Quotation reaches an approved state.

This refinement changes the original SDS §2.2.3 Table 11 relationship in which Project contained a single `quotation_id`.

The implementation instead stores nullable `projectId` on Quotation, producing a Project 1:N Quotation relationship.

DDP-67 implements this database cardinality change. DDP-67 is the implementation migration and is not itself the evidence of client approval.

The SRS Client Requirement Sign-off establishes the approved requirements as the development baseline and requires post-approval modifications to follow change control. The corresponding client/supervisor approval evidence for this refinement should therefore remain linked to the project records.

---

## Decision

### Project–Quotation Cardinality

The implemented relationship is:

`Project 1 → N Quotation`

A Project may have multiple associated Quotations.

Each Quotation may reference at most one Project through nullable `Quotation.projectId`.

A Quotation may remain without a Project before conversion or attachment.

The relationship is represented relationally through the foreign key rather than by storing an array of Quotation IDs on Project.

---

### Project Creation and Activation

A Project created independently starts in:

`PLANNING`

An approved Quotation may either:

1. create a new Project, or
2. attach to an existing Project.

A Project created directly from an approved Quotation is created as:

`ACTIVE`

When an approved Quotation is attached to an existing Project, automatic activation is limited to:

`PLANNING → ACTIVE`

A `PLANNING` Project becomes `ACTIVE` when at least one associated Quotation has reached either:

- `APPROVED`, or
- `CONVERTED`.

`CONVERTED` is treated as satisfying the activation requirement because conversion occurs only after quotation approval.

Quotation-driven activation does not automatically overwrite these Project states:

- `ON_HOLD`
- `COMPLETED`
- `CANCELLED`

An already `ACTIVE` Project remains `ACTIVE` when additional Quotations are attached.

A Project is not automatically returned to `PLANNING` because another associated Quotation remains pending or because quotation state changes later.

---

### Quotation Conversion Workflow

The overall conversion workflow spans Quotation Service and Project Service and is therefore not implemented as one distributed database transaction.

The workflow is:

1. Quotation Service validates the approval request.
2. Quotation Service persists the Quotation as `APPROVED`.
3. Quotation Service requests Project conversion from Project Service.
4. Project Service validates the Quotation and Project relationship.
5. Project Service either creates a new Project, attaches the Quotation to an existing Project, or resolves an already-linked Project.
6. Project Service stores `Quotation.projectId` as part of its conversion transaction.
7. Project Service activates a `PLANNING` Project when required by the activation rule.
8. Project Service returns the resolved `projectId` and Project status.
9. Quotation Service persists the Quotation as `CONVERTED` after Project Service succeeds.
10. Any post-conversion notification remains best-effort and does not roll back successful Project conversion.

This preserves the approval-before-active-Project requirement while avoiding a distributed transaction between services.

---

### Partial Conversion Recovery

A recoverable partial-conversion state may exist when Project Service successfully completes its transaction but Quotation Service does not complete the final `CONVERTED` update.

That state is:

- Quotation status = `APPROVED`
- `Quotation.projectId` = existing Project ID

When an `APPROVED` Quotation already contains a `projectId`, a retry reuses that Project rather than creating another Project.

The existence of `projectId` alone therefore does not mean the retry should be rejected as already converted.

A Quotation that is already fully `CONVERTED` remains protected from duplicate conversion according to the quotation lifecycle rules.

---

### Concurrency and Idempotency

Project conversion must remain safe when the same Quotation is submitted concurrently.

Project Service performs conversion inside a `SERIALIZABLE` database transaction.

The Quotation row is explicitly locked during conversion using:

`SELECT ... FOR UPDATE`

This ensures concurrent conversion attempts coordinate around the same Quotation record.

Retryable transaction serialization or write conflicts are retried.

The retry mechanism supports both normal Prisma transaction conflicts and PostgreSQL serialization conflicts surfaced through the Neon driver adapter.

After the first successful conversion stores `Quotation.projectId`, a retry re-reads the Quotation and resolves the already-created Project instead of creating another Project.

Therefore, concurrent successful conversion requests for the same Quotation resolve to the same Project.

If retryable concurrency conflicts continue beyond the configured retry limit, Project Service returns a controlled concurrency conflict instead of leaking a raw database error.

---

### Project Budget

Project `budget` represents the budget of the overall construction Project.

Quotation `totalAmount` represents the value of an individual quotation scope.

Therefore:

`Project.budget` is independent from `Quotation.totalAmount`.

Creating a Project from a Quotation must not automatically treat that Quotation's `totalAmount` as the overall Project budget.

Where a Project budget is supplied during Project creation, it is supplied explicitly as Project-level information.

Attaching another Quotation to an existing Project does not replace the Project budget with that Quotation's total.

---

## Rationale

A construction Project represents the overall construction engagement, while individual Quotations may represent separate scopes within that engagement.

Allowing multiple Quotations to reference one Project reflects the client-confirmed workflow without creating duplicate Project records for the same construction work.

Using a normal one-to-many relational model preserves foreign-key integrity and makes Project-to-Quotation queries simpler and safer than storing multiple Quotation IDs in an array.

Activating a `PLANNING` Project when the first associated Quotation is approved preserves the SRS requirement that approved Quotations lead to active Project work while allowing other Quotations for the same Project to remain pending.

Limiting automatic activation to `PLANNING → ACTIVE` prevents quotation processing from overriding later Project lifecycle decisions such as `ON_HOLD`, `COMPLETED`, or `CANCELLED`.

Keeping Project budget independent from individual Quotation totals prevents a scope-specific Quotation from incorrectly becoming the budget for the entire Project.

Persisting `Quotation.projectId` inside the Project Service conversion transaction provides a durable idempotency boundary for retries and concurrent requests.

Using a serializable transaction, row locking, and retry handling prevents two concurrent requests for the same approved Quotation from creating duplicate Projects.

---

## Consequences

### Positive

- Supports multiple quotation scopes within one construction Project.
- Preserves the SRS requirement that approved Quotations initiate active Project work.
- Allows pending Quotations to coexist with an `ACTIVE` Project.
- Prevents creation of duplicate Projects for separate quotation scopes.
- Allows an approved Quotation to create a new Project or attach to an existing Project.
- Makes partial conversion retries recoverable through the existing `Quotation.projectId`.
- Prevents duplicate Projects during concurrent conversion requests.
- Protects non-`PLANNING` Project lifecycle states from automatic quotation-driven overwrites.
- Keeps Project-level budget independent from individual Quotation totals.
- Preserves relational integrity through a normal Project 1:N Quotation relationship.

### Trade-offs

- The implemented cardinality differs from the original SDS §2.2.3 Table 11 design baseline.
- The client-confirmed refinement must remain traceable to the corresponding approval or change-control evidence.
- Quotation approval must distinguish between creating a new Project and attaching to an existing Project.
- The cross-service workflow can temporarily produce an `APPROVED` Quotation with an existing `projectId`.
- Conversion logic requires transaction locking, serialization-conflict detection, and retry handling.
- The Project Service must preserve idempotent behavior when processing repeated conversion requests.

---

## Alternatives Considered

| Option                                                                          | Why rejected                                                                                                                          |
| ------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| Create one Project for every approved Quotation                                 | Separate scope Quotations for the same construction engagement would create duplicate Project records.                                |
| Keep the original single `quotationId` field on Project                         | It cannot represent the client-confirmed requirement that multiple Quotations belong to the same Project.                             |
| Store multiple Quotation IDs in an array on Project                             | It weakens relational integrity and makes foreign-key enforcement and querying more difficult than a normal one-to-many relationship. |
| Require every associated Quotation to be approved before activating the Project | A Project may begin when one approved scope is sufficient to proceed while other scope Quotations remain pending.                     |
| Automatically force any Project state to `ACTIVE` when a Quotation is approved  | This could incorrectly overwrite deliberate lifecycle states such as `ON_HOLD`, `COMPLETED`, or `CANCELLED`.                          |
| Treat any existing `Quotation.projectId` as an already-converted conflict       | It would make recovery impossible when Project Service succeeds but Quotation Service has not yet persisted `CONVERTED`.              |
| Derive Project budget from the first approved Quotation                         | An individual Quotation represents a scope of work and does not necessarily represent the budget of the overall construction Project. |
| Process concurrent conversion without transaction locking or retry handling     | Concurrent requests could race and create duplicate Projects or expose raw database serialization failures.                           |
