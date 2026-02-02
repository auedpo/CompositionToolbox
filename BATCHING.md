# Batching Architectural Lock

## 1. Purpose
Batching exists to keep lens evaluation deterministic and controllable:
- Let lenses operate over groups of drafts without implicit framing or mutation.
- Prevent combinatorial explosion from collapsing UX or breaking derived-state determinism.
- Preserve the structural meaning of “frames” so evaluation, UI, and persistence agree on what a batch represents.

## 2. Definitions (Canonical Vocabulary)
- **Carrier Draft** — A Draft whose sole purpose is to transport multiple drafts as a single input; carriers are metadata-rich and do not directly encode material content.
- **Packed Draft Carrier** — A Carrier Draft whose metadata identifies it as a packed payload: meta.carrier.kind === "packDrafts".
- **Frame** — One element of a packed carrier’s payload.values array.
- **Batch Evaluation** — A lens evaluation where a packed carrier input is expanded and mapped frame-by-frame through the same lens logic.
- **Batch** — The full set of outputs produced by a single batch evaluation call (all frames and their variants).
- **Variant** — One of the potentially many drafts produced by evaluating a single frame.

## 3. Batch Trigger Rule (Hard Rule)
Batch evaluation occurs **if and only if** an input draft satisfies inputDraft.meta.carrier.kind === "packDrafts".
- Shape alone (e.g., nested lists) must never trigger batching.
- Legacy provenance-based detection may still exist but is deprecated; carrier metadata is authoritative.

## 4. App-Wide Batch Semantics
- Batching is **map-only**: there are no cartesian products, no cross-frame iteration, and no lens-level loops.
- Each frame evaluates independently.
- Evaluation order is deterministic: rameIndex ascending, then ariantIndex ascending.
- No lens code implements iteration logic; iteration is handled by the overarching evaluation wrapper.

## 5. Batch Metadata Contract
Every draft produced by a batched evaluation must include:
`
meta.batch = {
  kind: "mapFrames",
  batchId,            // unique per evaluation call
  frameIndex,         // 0..F-1
  frameSourceDraftId, // upstream draftId or null if unavailable
  variantIndex        // 0..K-1
}
`
- atchId groups all outputs from the same batch evaluation.
- rameIndex groups outputs by the originating input frame within that batch.
- ariantIndex preserves per-frame output ordering.
- Derived warnings (truncation, errors) may reference these indexes for diagnostics.

## 6. Derived Batch Indexes (Read-Only)
These structures are derived-only, recomputed wholesale, and never persisted:
- draftIdsByBatchId
- draftIdsByBatchFrame
- atchSummaryByBatchId = {
    frames,
    outputs,
    outputsPerFrame,
    lensInstanceId,
    lensId,
    truncated?,
    warnings?
  }
Rules:
- These indexes exist solely in derived state.
- They are recreated every recompute and are never written from outside ecomputeDerived.

## 7. Truncation + Caps (Deterministic)
Default caps (subject to future tuning but always deterministic):
- maxFramesEvaluated (global cap on frames processed per batch evaluation)
- maxTotalDraftsPerBatch (soft cap, default 500)
- maxTotalDraftsPerRecompute

Rules:
- Truncation decisions must be deterministic and respect source ordering.
- When limits are hit, outputs are dropped from the end of the remaining range; no reordering or random sampling.
- Truncation emits derived warnings for visibility.

## 8. Failure Behavior
- Malformed carriers result in zero frames evaluated and emit a derived warning.
- Missing rameSourceDraftId values are mapped to 
ull without stopping the batch.
- Errors never mutate authoritative state; derived state records errors only.
- Errors do not auto-fix or mutate upstream authoritative structures.

## 9. Lens Batch Policy (Future Hook)
Reserved configuration for future phases (not implemented in this phase):
`
batchBehavior: "inherit" | "disable" | "enable"
`
Rules:
- Default is inherit (follow carrier detection semantics).
- disable treats carriers as single materials with no batching.
- enable forces batching whenever a carrier is present.
- Policy enforcement occurs in later phases; B0 only documents the hook.

## 10. Invariants (Non-Negotiable)
Batching must obey the Architectural Constitution (AGENTS.md):
- All Drafts are created exclusively via makeDraft.
- Derived state is written only by ecomputeDerived.
- Batching is deterministic; same authoritative inputs must yield the same derived outputs.
- No UI logic appears in the domain layer; batching metadata remains purely domain-state.
- Derived batching indexes and warnings are never persisted.

## Explicit Non-Goals
This phase clarifies architecture only. The following are explicitly out of scope:
- No frame iteration logic is added anywhere.
- No changes to ecomputeDerived or recompute wiring.
- No changes to any lens implementation.
- No UI layer changes.
- No performance, caching, or runtime behavior work.

## Summary
This document locks the semantics, metadata contracts, truncation rules, and invariants that all future batching phases must respect. B0 introduces no new runtime behavior; all batching rules here are architectural guardrails for later implementation.
