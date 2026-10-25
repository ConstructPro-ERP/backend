# ADR-17: Direct LLM Calls Instead of LangChain

**Status:** Proposed — implemented, pending team/supervisor approval  
**Date:** 2026-10-17
**Deciders:** ConstructPro ERP team and academic supervisor  
**Related ADRs:** none  
**Requirement traceability:** FR-010 (AI risk prediction), SDS AI design.

---

## Context

The SDS described a LangChain-based retrieval-augmented generation (RAG)
engine for project risk prediction. During development the team needed a
small, testable integration that still works when the language model is
unavailable or returns an unusable answer.

## Decision

The AI service calls the OpenRouter chat completions API directly
(`apps/ai-service/src/ai-provider.service.ts`), retrieves project context from
PostgreSQL with pgvector, and validates the model's answer. When the provider
fails or the answer is invalid, it returns a rule-based prediction marked
`SAFE_FALLBACK` (`apps/ai-service/src/ai-forecasting.service.ts`). LangChain is
not a dependency.

## Consequences

- Fewer dependencies and a deterministic fallback that the tests can cover.
- Prompt construction and retrieval logic are maintained by the team rather
  than by a framework.
- Changing the model provider means changing the provider service.
