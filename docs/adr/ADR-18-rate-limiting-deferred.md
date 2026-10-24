# ADR-18: Rate Limiting and Account Lockout Deferred

**Status:** Proposed — implemented, pending team/supervisor approval  
**Date:** 2026-10-20  
**Deciders:** ConstructPro ERP team and academic supervisor  
**Related ADRs:** ADR-16  
**Requirement traceability:** SDS API gateway design, OWASP A07.

---

## Context

The SDS described an API gateway with rate limiting and load balancing. The
gateway is a NestJS application deployed on Vercel, which provides TLS and
scaling. Rate limiting was not implemented within the semester.

## Decision

The gateway has no request rate limiting, and login has no account lockout
after repeated failures. This is accepted for the academic release and recorded
as a known limitation.

## Consequences

- Login can be attacked by brute force; OWASP A07 remains Partial.
- In-memory throttling (for example `@nestjs/throttler`) would not hold across
  Vercel serverless instances without a shared store.

## Follow-up

- Add throttling on the login route with a shared store, and lock accounts
  after repeated failures (stored on the user record).
