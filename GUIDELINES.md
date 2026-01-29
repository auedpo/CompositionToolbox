# Interval Placement Lab — Project Guidelines

This document defines the **non-negotiable contracts** and the **preferred structure** for the app.
If a change affects core workflow or data shape, update this file first.

---

## 0) Project intent (one sentence)

A modular “track + lenses” workspace where **lenses generate/transform numeric structures into drafts**, and the user can **capture** those drafts to Inventory (materials) and **place** materials on the Desk (clips).

---

## 1) Vocabulary (use these words consistently)

- **Lens**: a module that evaluates inputs + params to produce drafts. Two kinds:
  - **Source**: no upstream draft inputs; user-entered controls produce drafts.
  - **Transformer**: consumes upstream drafts via explicit input refs; produces drafts.
- **Draft** (ephemeral): a candidate result from a lens evaluation; selectable per lens instance.
- **Material** (persistent): a captured draft stored in **Inventory** with a stable `materialId`.
- **Clip** (persistent placement): a Desk item referencing a `materialId` with time/lane metadata.
- **Workspace**: Tracks + lens instances + their selections and params (persisted snapshot).
- **Active draft**: the selected draft on a lens instance (used for downstream “active” refs).
- **Active ref**: a transformer input bound to a `sourceLensInstanceId`.
- **Frozen ref**: a transformer input bound to a specific `sourceDraftId`.

## 1.1) Routing terminology (Phase 0)

- **Lane**: a vertical signal column that matches an existing track.
- **Row**: a vertical index within a lane; higher rows come later in the signal flow.
- **Auto input**: the default behavior where a lens pulls from the nearest upstream lens within the same lane.
- **Lane-based input**: a future mode in which a lens specifies a lane and implicitly inherits the closest upstream lens above its own row.
- **Upstream**: any lens instance in the same lane whose row index is strictly less than the target lens.

Routing is explicitly lane- and row-based rather than graph-based, active drafts are always the payloads used for upstream outputs, and compatibility is currently assumed (all drafts are lists).

--- 

## 2) Data contracts (hard rules)

### 2.1 Draft payload contract (canonical)
- A Draft’s `payload.kind` MUST be `"numericTree"`.
- The only authoritative numeric content is `draft.payload.values` and it MUST pass numeric-tree validation.
- Drafts MUST be constructed via `makeDraft(...)` (no ad-hoc objects).
- Draft provenance/context belongs in `draft.meta.provenance` (or equivalent canonical meta location).

### 2.2 Inventory / Desk separation (no exceptions)
- **Inventory contains Materials only** (never drafts).
- **Desk contains Clips only**; clips reference `materialId` and NEVER embed draft data.
- Transformers MUST NOT read from Inventory or Desk directly; they operate on draft inputs only.

### 2.3 Input reference contract (transformers)
Transformer inputs are stored per-role as:
- `null` (unselected)
- `{ mode: "frozen", sourceDraftId }`
- `{ mode: "active", sourceLensInstanceId }`

A string draft id is legacy/compat only; normalize to `{mode:"frozen"}` at the edge.

### 2.4 IDs
- `materialId` identifies persisted Inventory items.
- `lensInstanceId` identifies a lens instance on a track.
- `draftId` identifies a draft within the runtime catalog (ephemeral; do not persist outside workspace selection).

---

## 3) Lifecycle (what happens when)

1) Lens instance evaluates → produces `currentDrafts[]` (validated).
2) User selects an active draft (updates `activeDraftId` / `activeDraftIndex`).
3) Transformers with `mode:"active"` inputs re-evaluate when upstream active draft changes.
4) “Add to Inventory” converts the active draft → Material (persist).
5) “Place on Desk” creates a Clip referencing the newly created (or selected) `materialId`.

---

## 4) Architectural boundaries (to prevent main.js bloat)

### 4.1 File/module responsibilities
- `src/lenses/*`:
  - Lens definitions (meta, inputs/params schema).
  - Pure evaluation logic (no DOM, no localStorage, no direct state mutation).
- `src/lenses/lensRuntime.js`:
  - Normalization/validation of drafts.
  - Draft catalog + evaluation scheduling + error capture (`lastError`).
- `src/core/invariants.js`:
  - Draft construction (`makeDraft`) + validation helpers.
  - Throws typed invariant errors on contract violations.
- `src/core/stores.js` + `src/core/persistence.js`:
  - Inventory/Desk stores and serialization/deserialization.
- `src/ui/*`:
  - Rendering + DOM event binding (no placement math, no lens evaluation logic).
- `src/transformerPipeline.js`:
  - Auto-wiring rules for single-input transformers (active-follow behavior).
- `src/main.js`:
  - Composition root only: boot, wiring, orchestration.
  - May coordinate modules, but SHOULD NOT contain large UI renderers or math engines.

### 4.2 “Pull rule” for refactors
If a function in `main.js` grows beyond ~80–120 LOC or becomes conceptually reusable,
move it to the correct module (`ui/`, `core/`, `lenses/`, `placement/`).

---

## 5) Lens authoring rules

### 5.1 Lens meta
Each lens must declare:
- `meta.id`, `meta.name`, `meta.kind` in `{source|transformer}`
- `meta.hasVisualizer` if it provides a meaningful preview
- Input/param schemas with stable `key`s and `role`s (for transformers)

### 5.2 Determinism
- Lens evaluation must be deterministic given `(inputs, params, context, draftCatalog snapshot)`.
- No random unless seeded explicitly via params/context.
- No side effects (no storage, no network, no DOM).

### 5.3 Draft construction
- Always call `makeDraft({ type, subtype, payload:{kind:"numericTree", values}, summary, meta })`.
- Validate any intermediate numericTree before emitting drafts (fail fast).

### 5.4 Errors
- Validation failures should surface as typed invariant errors and be reported via runtime/UI notice.
- On evaluation error: preserve last good drafts if possible; store error in instance/runtime.

---

## 6) UI / UX rules

- Use the Vocabulary terms in UI labels and code identifiers.
- “Active vs Frozen” must be visually and behaviorally distinct in transformer input UX.
- Do not let auto-selection clobber user-frozen selections.
- Keep Inventory/Desk panels “shared” workspace utilities; do not duplicate per lens.
- Prefer small, consistent panels; visualizer collapse/panels should be uniform across lenses.

---

## 7) Workspace + persistence rules

### 7.1 What is persisted
Persist:
- Tracks list (order + name)
- Lens instances (lensId, trackId, lane, params, lens inputs)
- Transformer `selectedInputRefsByRole`
- Active draft selection (`activeDraftId` / `activeDraftIndex`) as a hint only

Do NOT persist:
- Draft payloads themselves (ephemeral; recomputed)
- Any computed viz artifacts except minimal UI preferences

### 7.2 Versioning
Every persisted blob must have:
- `version` at top-level
- Back-compat normalization on load (migrate legacy shapes at the edge)

---

## 8) Testing and self-checks

- Add tests for:
  - numericTree validation and draft invariants
  - transformer input ref normalization
  - inventory/desk persistence invariants (no drafts in inventory, no draft refs in desk)
  - workspace snapshot load/save migration

- A DEV-only selfTest is acceptable, but it must assert the same invariants as unit tests.

---

## 9) Commit discipline (how to change safely)

When changing a contract:
1) Update this file first (explicitly).
2) Implement normalization at module boundaries.
3) Add/extend tests for the new behavior.
4) Ensure old persisted data loads without breaking (migrate in `deserialize` / load path).

---

## 10) Quick “how to add a new lens” checklist

1) Create lens file in `src/lenses/` and register it in the lens registry.
2) Define meta + schemas (inputs/params).
3) Implement pure evaluation returning drafts via `makeDraft`.
4) Add minimal vizModel for preview if transformer or non-tabular output.
5) Add tests: invariants + at least one integration scenario (Source → transformer).

