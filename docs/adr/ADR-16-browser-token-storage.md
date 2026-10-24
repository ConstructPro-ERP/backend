# ADR-16: Browser Token Storage Instead of HTTP-only Cookies

**Status:** Proposed — implemented, pending team/supervisor approval  
**Date:** 2026-10-15  
**Deciders:** ConstructPro ERP team and academic supervisor  
**Related ADRs:** ADR-18  
**Requirement traceability:** JWT authentication (NFR-07), SDS security design, OWASP A07.

---

## Context

The SDS specified the refresh token in an HTTP-only cookie with a server-side
blocklist. The frontend and the API gateway are deployed as separate Vercel
projects on different domains, which makes cross-site cookies harder to
configure and test.

## Decision

Access and refresh JWTs are stored in browser localStorage
(`frontend/src/lib/token.ts`) and sent as bearer tokens by the shared Axios
client, which refreshes the access token when a request returns 401. By
default, access tokens expire after 15 minutes and refresh tokens after 7 days.

## Consequences

- Simpler cross-domain deployment and local development.
- Tokens are readable by any script on the page, so an XSS flaw would expose
  them.
- Refresh tokens are stateless and cannot be revoked or rotated server-side;
  the `RefreshToken` table is not used.

## Follow-up

- Persist and rotate refresh tokens, or move them to HTTP-only cookies.
- Add a Content Security Policy to reduce the XSS risk.
