# ADR-15: Client Portal Ownership-Filtered Read-only Access

**Status:** Proposed — implemented, pending team/supervisor approval  
**Date:** 2026-10-13  
**Deciders:** ConstructPro ERP team and academic supervisor  
**Related issue:** DDP-86 — [Issue #123](https://github.com/ConstructPro-ERP/backend/issues/123)  
**Related ADRs:** ADR-11 and ADR-14  
**Requirement traceability:** Client Portal read-only access, JWT authentication, role-based authorization, project confidentiality, document protection and SDS Chapter 6 security requirements.

---

## Context

ConstructPro ERP requires authenticated Client Portal Users to access only their own quotations, project progress, milestones and permitted project documents.

Existing projects can reference multiple quotations. Therefore, project access must not be granted solely because one quotation belongs to the requesting client.

The original SDS describes PostgreSQL row-level security (RLS). However, the current implementation uses Prisma with a shared Neon PostgreSQL database and enforces ownership through service-level database queries.

## Decision

### 1. Customer–User identity mapping

Introduce an optional, unique `Customer.userId` foreign key referencing `User.id`, without replacing existing Customer, Lead, Quotation or Project relationships.

The ownership path is:

`User → Customer → Lead → Quotation → Project`

Only active users assigned the `CLIENT_PORTAL_USER` role and linked to an existing Customer profile may access client-specific information.

### 2. Controlled account linking

Provide an Admin-only endpoint:

`PATCH /clients/:id/portal-user`

The operation links an existing eligible User to an existing Customer. It validates user status and role, requires the Customer to have a linked Lead, rejects conflicting associations, and permits idempotent confirmation of an existing valid link.

The existing Customer CRUD operations remain unchanged. Client Portal endpoints do not expose this administrative write operation.

### 3. Read-only Client Portal API

Expose the following authenticated routes through the API Gateway:

- `GET /client-portal/projects`
- `GET /client-portal/projects/:id`
- `GET /client-portal/projects/:id/milestones`
- `GET /client-portal/projects/:id/documents`
- `GET /client-portal/quotations`

The Gateway validates JWT identity and client role before forwarding requests.

### 4. Project ownership enforcement

A Project is accessible only when:

- At least one attached Quotation belongs to the authenticated Customer.
- Every attached Quotation belongs to that same Customer.

Projects with quotations associated with multiple Customers are denied Client Portal visibility. Projects without an eligible quotation are also excluded.

Ownership is incorporated into database queries, including project details and related document or milestone retrieval.

### 5. Document access

Clients may browse active, non-deleted documents belonging to authorized projects.

Document listings expose only permitted metadata. Cloudinary asset identifiers and stored file URLs are not included.

Document downloads require an additional ownership check and return a temporary authenticated Cloudinary download URL only after successful authorization.

### 6. Safe failures

- Missing or invalid authentication is rejected.
- Inactive or non-client accounts are denied.
- Accounts without a linked Customer receive `CLIENT_PROFILE_NOT_LINKED`.
- Missing or unauthorized project/document identifiers return a safe not-found response.
- Client Portal endpoints do not permit changes to projects, milestones, tasks, expenses or documents.

### 7. SDS row-level security deviation

PostgreSQL RLS is not implemented as the Client Portal's request-level authorization mechanism.

Instead, the implemented system enforces ownership through NestJS services, verified database relationships and Prisma query predicates.

This is an explicit difference from the original SDS and must be reflected in the final SDS or an approved addendum. Server-side ownership filtering must not be described as PostgreSQL RLS.

## Consequences

**Benefits**

- Preserves existing domain relationships and implemented services.
- Prevents cross-client project and document disclosure.
- Supports controlled account provisioning without manual database updates.
- Avoids exposing confidential project and document fields.
- Keeps the Client Portal read-only.

**Limitations**

- Project visibility is intentionally denied when quotations from different Customers are attached.
- Customers without a Lead cannot be provisioned for portal access through the new linking endpoint.
- Authorization correctness depends on maintaining ownership predicates in all relevant queries.
- The SDS must be updated to reflect the implemented authorization strategy.

## Verification

Implementation evidence includes:

- `apps/client-service/src/client-portal-access.service.ts`
- `apps/client-service/src/client-portal-read.service.ts`
- `apps/client-service/src/client-portal.controller.ts`
- `apps/client-service/src/client.service.ts`
- `apps/api-gateway/src/controllers/client-portal-gateway.controller.ts`
- `apps/document-service/src/document.service.ts`
- `apps/document-service/src/repositories/document.repository.ts`
- `prisma/migrations/20261012065554_ddp86_client_portal_customer_user_link/migration.sql`

Test evidence includes:

- `test/client-portal/client-portal-ownership.integration.spec.ts`
- `test/client-portal/client-portal-link.integration.spec.ts`
- `test/client-portal/client-portal-gateway.e2e-spec.ts`
- `test/client-portal/client-portal-access.service.spec.ts`
- `test/client-portal/client-portal-read.service.spec.ts`
- `test/client-service/`

The implementation has passed local unit, database integration and Gateway E2E validation. Final deployment verification and team/supervisor approval remain separate activities.
