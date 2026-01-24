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

## UI/UX Rules
- Use the vocabulary above in labels, tooltips, and status messages.
- Prefer small, focused panels over mega-forms.
- Preserve existing visual language unless explicitly asked to redesign.

## Change Control
- Add new rules here before implementing behavior that changes core workflows.
- Document any exceptions with a short rationale.
