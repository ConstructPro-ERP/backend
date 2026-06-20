# ADR-09: Quotation Service Orchestrates the Approve → Create → Notify Chain

**Status:** Accepted  
**Date:** 2026-06-21  
**Deciders:** Minindu Bimsara Abeywardena  
**Issue:** #2 — UC-04, FR-004, Business Rule 10.2

---

## Context

When a quotation is approved, two downstream effects must happen:

1. A project must be created in the project service.
2. The team must be notified that a new project exists.

We needed to decide **which service orchestrates this chain**.

---

## Decision

The **quotation service** owns and drives the entire `approve → create-project → notify` flow via `QuotationService.approveAndConvert()`.

---

## Rationale

### Why not a saga / event bus?

Introducing a message broker (Kafka, RabbitMQ, NATS) for a single two-step flow would add infrastructure complexity with no benefit at this stage of the product. A direct HTTP orchestration call is simpler, observable, and deployable without new infrastructure.

### Why quotation service (not a dedicated orchestrator or the API gateway)?

The quotation is the authoritative source of the approved budget and lead. All the data needed to create a project (`leadId`, `totalAmount`) lives on the quotation record. Keeping the orchestration in the service that owns the data avoids an extra hop and keeps the business logic close to the state it mutates.

### State machine and idempotency (BR 10.2)

The service enforces the following guards **before** any write or external call:

| Quotation state | Result |
|---|---|
| `CONVERTED` or `projectId` already set | `409 ALREADY_CONVERTED` — idempotent, project service never called |
| `REJECTED` | `400 QUOTATION_REJECTED` |
| `PENDING_APPROVAL` / `APPROVED` | proceed |

The conversion is deliberately **not** atomic at the DB level. The sequence:

1. Set `status = APPROVED` (write)
2. Call project service (external)
3. Only on success: set `status = CONVERTED` + `projectId` (write)

If step 2 fails, the quotation is left in `APPROVED` state with no `projectId`, so the call can be retried safely. This is a deliberate "at-least-once delivery with idempotency guard" pattern rather than a distributed transaction.

### Notification is best-effort

Notification failure must not roll back a successful project creation. A failed notify is logged as `warn` and swallowed. This avoids partial-success confusion where the project exists but the quotation appears un-converted.

---

## Consequences

**Good:**
- Simple, debuggable, no new infrastructure.
- Idempotency guard prevents double-project creation on retry.
- Stub client (`PROJECT_SERVICE_STUB=true`) allows development before the project service is live.

**Bad / trade-offs:**
- The quotation service is coupled to the project and notification service APIs.
- If the process crashes after step 2 but before step 3, a project exists with no matching quotation record. A reconciliation job or retry mechanism will be needed before GA.
- Notification failure is silent to the caller. Monitoring/alerting on the log `warn` lines is required.

---

## Alternatives Considered

| Option | Why rejected |
|---|---|
| API gateway orchestrates | Gateway is a routing layer, not a business logic layer. |
| Event-driven saga | Adds Kafka/RabbitMQ at this stage; no other consumers of these events yet. |
| Synchronous orchestrator service | An extra network hop for a single chain; adds latency and a new service to operate. |
