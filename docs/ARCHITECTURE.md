# Architecture (Phase 0)

## State boundaries
- Authoritative state: user intent and structure (workspace, lens instances, desk, inventory, selection, persistence metadata).
- Derived state: drafts, cached outputs, previews, errors, and any values that can be regenerated.
- Derived state is written only by recompute (future) and is never persisted.

## Draft ? Material ? Clip lifecycle
- Drafts are ephemeral lens outputs.
- Materials are persistent inventory items created from Drafts.
- Clips are persistent desk placements that reference materialId.

Hard rules:
- Drafts never contain Materials.
- Inventory never contains Drafts.
- Desk never references Drafts.
- Only Materials have stable IDs; Clips reference materialId.
- Drafts must be constructed via makeDraft (no ad-hoc draft literals).

## Module boundaries
- src/core and src/lenses are framework-agnostic domain logic.
- src/state owns state mutations and persistence boundaries.
- src/ui owns rendering and user interactions.
- UI talks to state only via actions (future).
