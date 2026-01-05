# Agents Instructions

## Theme System Non-Negotiables (WPF)

### Objective
Eliminate theme/system color surprises. The app must use a deterministic, app-owned theme system.

### Required Architecture
1. The app defines a semantic palette of exactly **15 roles**:
   - Surfaces: `App.Background`, `Surface.Background`, `Surface.Border`, `Canvas.Background`, `Canvas.GridLine`
   - Text: `Text.Primary`, `Text.Secondary`, `Text.Disabled`
   - Interaction: `Accent`, `Selection.Fill`, `Selection.Outline`, `Focus.Ring`
   - State: `Danger`, `Warning`, `Success`

2. The app provides exactly **two palettes** in v1:
   - `LightNeutral`
   - `DarkNeutral`

3. All owned UI binds only to these resources:
   - `Brush.*` keys (e.g., `Brush.Surface.Background`, `Brush.Text.Primary`, `Brush.Selection.Fill`)
   - No direct usage of system/fluent brushes in owned UI.

### Forbidden
- Do not reference `System*` resource keys for colors/brushes in owned UI.
- Do not reference `Fluent*` theme resource keys for colors/brushes in owned UI.
- Do not introduce additional semantic color roles beyond the 15 listed above.
- Do not add per-control ad-hoc colors (e.g., “ListHoverBlue”, “InspectorPurple”).
- Do not bind directly to `Color.*` in control styles; bind to `Brush.*` only.

### Implementation of New State 
If a new visual state is needed (hover/pressed/etc.) inform the user that this does not exist and that it is needed, offer to implement it by adjusting opacity of existing brushes; do not add new brushes.

### Resource Dictionaries (must exist)
The theme system must be implemented using these dictionaries:

- `Themes/AppTheme.Keys.xaml` (stable ABI: defines `Brush.*` keys)
- `Themes/AppTheme.Brushes.xaml` (bridge: `Color.*` → `Brush.*`)
- `Themes/AppTheme.Palette.LightNeutral.xaml` (defines `Color.*`)
- `Themes/AppTheme.Palette.DarkNeutral.xaml` (defines `Color.*`)

`App.xaml` must merge dictionaries in this order:
1) Fluent theme dictionaries (chrome only)
2) `AppTheme.Keys.xaml`
3) `AppTheme.Brushes.xaml`
4) One palette dictionary (default `DarkNeutral`)

### Runtime Switching
Theme switching is implemented by swapping only the palette dictionary (`AppTheme.Palette.*.xaml`) while keeping `Brush.*` keys stable.

### Change Control
Any deviation from the above rules requires an explicit instruction from the user.
If a control’s state cannot be expressed using the existing 15 roles, implement the visual using the existing roles (often by opacity) rather than adding new roles.

### Acceptance Criteria
- A search for `System` or `Fluent` brush usage in project XAML should show **no occurrences** inside owned UI (exceptions: window chrome or third-party control templates explicitly marked as non-owned).
- All backgrounds, borders, text, selection, and focus visuals in owned UI are sourced from `Brush.*`.