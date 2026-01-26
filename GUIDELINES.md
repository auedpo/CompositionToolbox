# Interval Applet Guidelines

Use this document to capture project rules, design principles, and implementation
constraints for the interval applet. Keep it short, specific, and actionable.

## Vocabulary
- Output: what a lens run produced (plural, ephemeral)
- Draft: a concrete candidate material (singular, ephemeral)
- Material: stored in Inventory (persistent)
- Clip: a Desk instance of a material

## Architecture Principles
- Keep lenses pure and deterministic; UI owns state and side effects.
- Drafts are produced by lenses; Inventory captures drafts into materials.
- Desk places clips that reference stored materials.
- Avoid new dependencies unless approved.

## Hard Rules
- Outputs never contain materials.
- Inventory never contains drafts.
- Desk never references drafts.
- Only Inventory materials get IDs.
- Clips reference `materialId`, not data.

## Track & Lens Identity
- Tracks maintain ordered `lensInstanceIds`; generators and transformers no longer have distinct slots.
- Each lens instance keeps a canonical `path` (numeric array) per track so labels render as `T<track>.<path>`.
- When tracks mutate or lenses move, recompute just the final path index to keep parent segments intact.
- Signal flow/displays rely on path-aware sibling detection; keep helpers aligned with this invariant.

## Lens Authoring
- Drafts must use the canonical Draft shape with `payload.kind="numericTree"` and numeric-tree values only.
- Use `makeDraft(...)` from `src/core/invariants.js` to construct drafts (no ad-hoc draft objects).

## UI/UX Rules
- Use the vocabulary above in labels, tooltips, and status messages.
- Prefer small, focused panels over mega-forms.
- Preserve existing visual language unless explicitly asked to redesign.

## Change Control
- Add new rules here before implementing behavior that changes core workflows.
- Document any exceptions with a short rationale.
