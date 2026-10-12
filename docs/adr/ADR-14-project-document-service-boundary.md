# ADR-14: Project Document Management Service Boundary and Secure Storage

**Status:** Proposed — implemented in part; pending team/supervisor approval and the follow-up items below  
**Date:** 2026-10-12  
**Deciders:** ConstructPro ERP team and academic supervisor (approval not yet recorded)  
**Related issue:** DDP-83 — [#111](https://github.com/ConstructPro-ERP/backend/issues/111)  
**Related ADR:** ADR-11 (Project and Task Service Boundaries)  
**Requirement traceability:** SRS FR-008 and UC-08; SRS NFR-04, NFR-07, NFR-08, NFR-11 and NFR-12; SDS Chapter 1, §§2.1–2.2, §5.2.6 (document-management flow), §§6.1–6.3 (authentication, authorization and data protection); Final Design Report §§4.1.3, 5.2; SENG 34213 guideline Chapters 6–8 and Definition of Done.

---

## Context

The approved SDS describes project file management in the NestJS business layer while its supporting **document service** is described in the context of **generated quotation and invoice PDFs**. In the as-built backend, project-related file upload, organization, retrieval, download and deletion have been implemented in a separate, deployable NestJS application, `apps/document-service`, reachable through the existing API Gateway.

SRS FR-008 and UC-08 establish the required project-document functionality, but do not prescribe this separate runtime boundary. The service split is therefore an architectural refinement requiring documentation and team/supervisor review, not a claim that the original SDS specified the current service layout.

The backend uses a shared Prisma schema and Neon PostgreSQL database. `libs/common/src/cloudinary/cloudinary.service.ts` already provides the Cloudinary implementation used by quotation/invoice generation, so creating another storage client would duplicate infrastructure and risk breaking existing public PDF delivery.

## Decision

1. **Runtime and domain ownership:** `apps/document-service` owns project-uploaded document metadata, validation, file lifecycle, categories, and recovery. The existing quotation/invoice document-generation workflows remain in their current services. `server.ts` starts this service when `DEPLOY_APP=document-service`.
2. **API boundary:** The API Gateway exposes the nine DDP-83 document/category routes, checks authenticated user role, and forwards server-resolved actor identity to Document Service. Document Service resolves the current actor against PostgreSQL before enforcing project/document rules. This is not a separate database-per-service architecture.
3. **Storage:** Use authenticated Cloudinary delivery for project-uploaded binary assets; keep PostgreSQL as the metadata source of truth. Do not use knowledge of a Cloudinary URL or public ID as proof of authorization. Generate a short-lived signed download URL only after server-side authorization. Preserve the existing public Cloudinary upload behavior for quotation/invoice consumers.
4. **Validation and lifecycle:** Accept only validated PDF, PNG, JPEG and DOCX assets, matching extension, MIME type, size and binary content, currently capped at 4 MiB. Persist PENDING metadata before uploading; promote to ACTIVE after confirmed provider success. Use DELETING/DELETED/FAILED states and soft-deletion metadata to handle partial failures and avoid exposing unfinished documents.
5. **Recovery:** Reconcile stale PENDING, FAILED and DELETING records through `DocumentReconciliationService`. The dedicated HTTP cron endpoint requires `CRON_SECRET`. `vercel.mjs` enables daily scheduling only when `DEPLOY_APP=document-service`; production scheduling must be verified after creating the Document Service Vercel project. Current reconciliation processes bounded batches, not an unbounded drain.
6. **Document RBAC aligned with SDS §6.2:** Admin has full document management; assigned Project Manager has document read/write; Accountant has document read-only access (their write authority is in Finance, **not** Documents); Sales Manager read-only document access is implemented and covered by unit and Neon integration tests. Category creation/update/deletion is limited to Admin; authenticated eligible readers may list categories.
7. **Client portal:** The `CLIENT_PORTAL_USER` role may exist in `Role`, but the current Prisma schema lacks a trusted `Customer.userId` mapping. **Role existence alone does not establish project ownership.** Until ownership is implemented, client document retrieval remains deny-by-default. The separate Person 3 implementation-pack **Issue 07 — Client Portal Read-only Project Access** defines the expected ownership path `User -> Customer -> Lead -> Quotation -> Project`, and the proposed `Customer.userId` nullable unique relation; do not infer ownership from an unverified email or a supplied project ID. DDP-83's client-download acceptance criterion must be explicitly deferred/linked or implemented before claiming full closure.
8. **RLS accuracy:** The SDS describes PostgreSQL row-level security for the portal, but request-scoped RLS is not established by this Document Service implementation. Do not claim it is deployed. For Issue 07, enforce service/database-query ownership filtering and record any approved deviation from SDS RLS separately.

## Data and request flow

```text
Authenticated frontend request
  -> API Gateway (JWT + route RBAC)
  -> Document Service (lookup active user/role + project authorization)
  -> Prisma / Neon PostgreSQL (Document and DocumentCategory metadata)
  -> Cloudinary authenticated asset (bytes; server-controlled public ID)

Authorized download:
  -> Gateway -> Document Service -> ownership/role check
  -> time-limited Cloudinary authenticated download URL

Recovery:
  -> Vercel scheduled request + CRON_SECRET
  -> DocumentReconciliationService -> Neon + Cloudinary
```

## Rationale

- Keeps project-uploaded confidential assets separate from generated sales/finance PDFs.
- Reuses the tested shared Cloudinary infrastructure without changing existing quotation/invoice delivery behavior.
- Server-side file-content validation and signed delivery reduce MIME spoofing and URL-based authorization risks.
- Explicit pending/deleting states permit recovery after uncertain Cloudinary or Neon outcomes without assuming a distributed transaction.
- Separate Vercel projects can use the same repository root and `server.ts`, selected by `DEPLOY_APP`, while only the Document Service registers the cron schedule.

## Alternatives considered

| Alternative                                                                                | Reason not selected                                                                                         |
| ------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------- |
| Put uploaded project-file management into quotation/invoice PDF-generation code            | Different security, metadata and lifecycle requirements; conflates generated PDFs with user-uploaded files. |
| Introduce a second Cloudinary upload implementation in `apps/document-service/src/storage` | Duplicates a tested SDK wrapper and adds maintenance burden.                                                |
| Use publicly accessible Cloudinary document links                                          | Violates document authorization and the DDP-83 signed/private download decision.                            |
| Delete provider and DB records in one assumed atomic step                                  | Cannot atomically commit across PostgreSQL and Cloudinary; states/recovery are required.                    |
| Grant client access based solely on `CLIENT_PORTAL_USER` role                              | Does not verify which customer/project owns the document; risks cross-client disclosure.                    |

## Consequences, limitations and follow-ups

**Positive:** clear document-domain ownership, centralized metadata, authenticated storage, compatible quotation/invoice workflows, retryable failure recovery.

**Trade-offs:** additional gateway-to-service HTTP dependencies, shared Prisma/Neon coupling, Cloudinary API/rate-limit exposure during reconciliation, serverless cron and upload-size constraints.

**Deployment security:** downstream service endpoints currently trust identity forwarded by the Gateway. The team plans to protect downstream Vercel project access in the final sprint. That protection is **deferred and unverified**; recording it in this ADR is not equivalent to enforcing it.

**Implementation/testing gates before DDP-83 sign-off:**

- [x] Implement and test SDS-aligned read-only Sales Manager document access without unintentionally changing unrelated shared Project/Finance authorization.
- [ ] Decide and record whether DDP-83's positive client ownership/download acceptance is explicitly transferred to Issue 07; until then it remains an unmet acceptance criterion.
- [ ] Add and run real test-Neon integration tests for each document/category HTTP endpoint and a complete document lifecycle, using a mock storage provider where fault injection is needed.
- [ ] Add a separate real Neon + authenticated Cloudinary lifecycle smoke test, with sandbox credentials and reliable cleanup, if resources permit.
- [ ] Add valid DOCX acceptance coverage and storage-specific boundary/failure tests; run branch and line coverage reports against SENG 34213 thresholds.
- [ ] Confirm migration applicability to populated databases and verify test/prod deployment conditions separately.
- [ ] In the final deployment sprint, verify Vercel project isolation, `CRON_SECRET`, production cron registration and bounded recovery behavior.
- [ ] Team/supervisor review of this separate service boundary; update the approved SDS architecture/addendum as necessary.

## Implementation evidence

- [DDP-83 Issue #111](https://github.com/ConstructPro-ERP/backend/issues/111)
- `apps/document-service/src/{document.controller.ts,document.service.ts,document-reconciliation.service.ts,document-reconciliation.controller.ts}`
- `apps/document-service/src/repositories/document.repository.ts`
- `apps/api-gateway/src/controllers/documents-gateway.controller.ts`
- `libs/common/src/cloudinary/cloudinary.service.ts`
- `libs/common/src/project-access/project-access.policy.ts`
- `prisma/schema.prisma` and `prisma/migrations/20261011063222_ddp83_project_document_metadata/migration.sql`
- `vercel.mjs`, `server.ts` and `test/document-service/`
