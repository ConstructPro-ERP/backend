# ADR-12: Relative Milestone Weights and Canonical Project Progress

**Status:** Proposed — implemented, pending team/supervisor review  
**Date:** 2026-10-10  
**Deciders:** ConstructPro ERP team and academic supervisor (approval not yet recorded)  
**Issue:** DDP-77 — [#92](https://github.com/ConstructPro-ERP/backend/issues/92)  
**Related issues:** DDP-68 (#80), DDP-81 (#104)  
**Requirements traceability:** SRS FR-005 / UC-05 (Project milestone tracking and progress updates); SDS §2.2.3 (Milestone/Task relationship, Tables 13–14) and §5.2.3 (Project management flow). PR #99 records a deliberate departure from Issue #92's initial weight rules, **not an established numerical requirement from the SDS**.

---

## Context

The original DDP-77 issue specified milestone `weight` values greater than zero and at most 100, a total project milestone weight no greater than 100, and an activation requirement that milestone weights total exactly 100.

The implementation instead uses **relative integer weights from 1 to 10**, with no requirement to allocate exactly 100 weight points. This change was documented as a deliberate issue-level deviation in PR #99. The SRS FR-005 / UC-05 calls for milestone and project progress tracking. The inspected SDS describes the milestone/task relationship and Project management flow but does **not explicitly specify the issue's numeric `weight` range or exactly-100 sum requirement**. Accordingly, this is a confirmed deviation from the GitHub issue and implementation plan, not a proven deviation from an SDS numerical rule. The team should document its approval and incorporate the final semantics into the next version of the design.

## Decision

1. Each persisted milestone has an integer `weight` in the range **1–10**, expressing relative importance.
2. There is **no fixed aggregate weight ceiling** and milestones do **not** need to total 100.
3. Project progress is computed from the weighted average of milestone progress values:

   ```text
   projectProgress =
     SUM(milestone.progressPercentage * milestone.weight)
     -----------------------------------------------------
                        SUM(milestone.weight)
   ```

4. When a project has no milestones, canonical project progress is **0**.
5. Recalculate and persist `Project.progressPercentage` whenever a milestone is created, updated, progressed, or deleted. Relevant changes execute within database transactions that lock the parent project and include retry handling for serialization conflicts.
6. Milestone `progressPercentage` is constrained to **0–100**; status and progress must be internally consistent. A completed milestone has 100% progress and a completion timestamp. Reopening clears the completed state/timestamp.
7. Present overdue incomplete milestones using a **derived `isDelayed` field**, without adding a stored `DELAYED` status.
8. Manual Project activation still validates the Project Manager, start/end dates, and at least one approved/converted quotation, but **does not require milestone weights to total 100 or milestones to exist**. Quotation-driven creation/activation can similarly occur before milestones are defined.
9. Project completion requires **stored canonical project progress of 100** and **at least one actual milestone**, with all milestones completed at 100% and populated `completedAt` timestamps.
10. Task status/assignment updates do **not** recalculate milestone progress. Milestone progress remains an explicit Project Service operation.

## Example

| Milestone  | Progress | Relative weight | Weighted contribution |
| ---------- | -------: | --------------: | --------------------: |
| Foundation |     100% |               3 |                   300 |
| Roofing    |      50% |               2 |                   100 |
| Finishing  |       0% |               1 |                     0 |
| **Total**  |          |           **6** |               **400** |

`projectProgress = 400 / 6 = 66.666...%` (the implementation persists the computed bounded numeric value; clients should handle display rounding).

## Why this approach

- Business users can express importance using a small intuitive scale without manually allocating exactly 100 points.
- Adding or deleting a milestone does not require all remaining milestone weights to be rebalanced.
- A deterministic normalized average allows Project Service and analytics to use the same stored progress value.
- Keeping task status independent prevents differences in task granularity from silently changing the official project-completion metric.

## Alternatives considered

| Alternative                                                 | Reason not chosen                                                                                                                   |
| ----------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| Require all weights to add up to exactly 100                | Makes milestone addition/removal and initial project planning harder; prevents quotation-driven activation before milestones exist. |
| Permit 1–100 weights with total at most 100                 | Still couples weights to an allocation budget rather than relative importance.                                                      |
| Use arithmetic mean without weights                         | Removes the ability to represent different milestone significance.                                                                  |
| Derive project progress directly from completed task counts | Task quantity/granularity is not a reliable substitute for approved milestone importance.                                           |
| Persist a `DELAYED` milestone status                        | Overdue status naturally changes with the clock; persisting it can become stale.                                                    |

## Consequences

**Positive:** straightforward weight input, stable deterministic progress, simpler edits, no forced reallocation, consistent reporting.

**Trade-offs:** users must understand that weight `10` is a relative priority, not a 10% share; changing a weight can change overall project progress without changing any milestone's own progress; a zero-milestone project correctly remains at 0%.

**Compatibility implications:** older assumptions or UI labels that expect weights to total 100 must be changed. Analytics should consume canonical project progress, not independently recalculate a different formula.

## Approval and design follow-up

- [ ] Obtain team/supervisor approval for the explicit departure from Issue #92's initial weight and activation constraints; do not mark the decision as approved based solely on the merged PR.
- [ ] Record the approved model in the versioned SDS/addendum and Project Management UI/validation documentation.
- [ ] Ensure any client-facing weight input labels explain **relative importance (1–10)**, not percentage allocation.
- [ ] Add a change-control reference if the approved SDS originally specified a different computation or threshold.

## Implementation evidence

- [Issue #92](https://github.com/ConstructPro-ERP/backend/issues/92)
- [PR #97 — schema foundation](https://github.com/ConstructPro-ERP/backend/pull/97)
- [PR #99 — milestone implementation and documented deviation](https://github.com/ConstructPro-ERP/backend/pull/99)
- Source: `apps/project-service/src/milestone.service.ts`, `apps/project-service/src/project.service.ts`, `apps/analytics-service/src/analytics.service.ts`, `prisma/schema.prisma`
