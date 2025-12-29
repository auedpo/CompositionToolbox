---
date: 2025-12-28
type: framework
style: scaffold
status: 3_shaping
theme:
  - composition_toolbox
source:
  - personal
tags:
  - project/composition_toolbox
  - set_theory
  - music_theory
---

Prototype: Preset PC-set Picker for Initialization (WPF/.NET 9)

Stack (fixed):
- Windows, .NET 9 (net9.0-windows), C#
- MVVM: CommunityToolkit.Mvvm
- Theming: Fluent
- Notation: WebView2 + local HTML + VexFlow
- MIDI: NAudio

Goal:
Add a “Preset Picker” modal dialog to the Initialization lens so the user can search and apply Forte/Rahn pitch-class set presets without UI overflow. Keep Initialization as a one-screen workflow.

============================================================
A) Model / Data
============================================================

1) Data is prebuilt and shipped with the app (not generated at runtime).
- Start with a small catalog JSON (20–50 entries) for prototype.
- Architecture must scale to full Forte/Rahn catalog later.

2) Add a Core model:

PresetPcSet:
- string Id                // e.g., "4-27" (Forte class label)
- int Modulus              // for now 12
- int[] PrimeForm          // pcs starting at 0, strictly increasing unique
- int Cardinality          // redundant but convenient
- string? DisplayName      // optional; can mirror Id
- string[] Tags            // initially empty; user can add later
- string[]? ZRelations     // optional: e.g., ["6-Z17"] if applicable (placeholder for now)

Notes:
- For prototype, you can omit ZRelations; keep property for future.
- PrimeForm should be in Rahn convention (we already decided to follow Rahn in app).

3) Catalog service:
- Catalog loads at startup from an embedded JSON resource or from app directory.
- Provide an in-memory index for search.

CatalogService responsibilities:
- IReadOnlyList<PresetPcSet> All
- IEnumerable<PresetPcSet> Search(string query, optional filters)
Search must support:
- Forte id (e.g., "4-27")
- Prime form string queries like "0247" or "(0 2 4 7)" or "[0 2 4 7]"
- Cardinality queries like "k=4" or "card:4" or just "4-" prefix
- Later: tags, z-relations (not required in prototype, but leave hooks)

============================================================
B) Initialization Lens UI changes
============================================================

1) Add a “Browse…” button next to the existing randomization button (or near the PC input).
- Also add Ctrl+P hotkey to open the Preset Picker.

2) Add a collapsible/expander row under the PC input:
- Title: “Recents”
- Default: collapsed
- Contents: a short list (max 10) of recent preset selections (from the catalog) rendered as their set text (e.g., "4-27  (0 2 4 7)")
- Clicking an item applies it to the PC entry box (same as choosing from picker).
- Recents must persist across app restarts.

Important: Recents here are ONLY from the catalog, not “all recently created nodes”, to avoid clutter.

3) Favorites:
- Use term “Favorites” in UI (not “pins”).
- Favorites list is shown at the top of the modal picker and also optionally in the Recents expander as a separate group (“Favorites” then “Recents”).
- Favorites persist across app restarts.

============================================================
C) Preset Picker Modal Dialog (Command Palette style)
============================================================

Open behavior:
- Opens as a modal dialog centered over MainWindow.
- On open: autofocus the search box and keep caret in search box.
- Typing always goes into the search box (even when arrow navigating results). Do not move focus away from search box.

Layout:
- Top: Search TextBox (autofocus)
- Left/Center: Results ListBox
- Right: Preview panel

Results list item template should show compactly:
- Forte Id (e.g., "4-27")
- Prime form (e.g., "(0 2 4 7)" or "0247")
- Cardinality (k)
- A star icon/button to toggle Favorite

Search behavior:
- Live filtering as the user types.
- Arrow keys navigate results while search box remains focused:
  - Up/Down changes selected result
  - Enter applies selected result
  - Esc closes dialog
- Double-click on a result applies immediately.
- Enter applies immediately.
- Apply means: populate Initialization PCset entry box with the set in the current Initialization format.

Preview panel:
- Shows selected preset:
  - Id, prime form displayed in app format
  - Optional tags (future)
- Provides:
  - VexFlow render (in-app) of the preset as a chord by default.
  - Toggle: “Chord / Sequence”
    - For Sequence mode: render in ascending order (since preset is unordered prime form).
  - Play button to audition:
    - Chord mode: play as chord arpeggio (v1), or block if easy
    - Sequence mode: play sequential
Playback uses NAudio and respects global modulus/mapping used elsewhere.

Apply rule:
- Applying a preset should write into the Initialization PC input box using the current initialization "interpretation":
  - If Initialization is in Ordered mode: write as "(0 2 4 7)" or just "0 2 4 7" (pick one consistent format; simplest is plain "0 2 4 7")
  - If Initialization is in Unordered mode: same numeric list is fine; unordered normalization will sort it anyway.
For prototype, do not auto-create the node; it just fills the entry box.

Favorites / Recents persistence:
- Store in a small JSON file in %AppData%\<YourAppName>\presets_state.json
  - Favorites: list of Preset Ids
  - Recents: list of Preset Ids (MRU order)
- On apply:
  - Update recents (move to front, dedupe, trim to 10)
- Favorites toggled by star in results list and in preview.

============================================================
D) Bounds / Non-goals for this prototype
============================================================

Do NOT implement:
- Full Forte/Rahn catalog import (use a small seed dataset)
- User-defined ordered presets (separate future feature)
- Tag editing UI
- Z-relation computation
- Advanced filters UI (only search box for now)

Do implement:
- Modal picker + live search + preview + audition + apply-to-initialization
- Favorites + recents with persistence

============================================================
E) Clarifications to avoid ambiguity (must follow)
============================================================

1) Catalog items represent UNORDERED pitch-class sets (prime form as canonical content).
2) Ordered user presets are NOT part of this prototype. We will handle ordered “fragments” later as user-defined presets or as saved nodes.
3) The picker should never overflow the Initialization screen; the catalog UI is entirely within the modal.
4) Arrow navigation must not steal focus from the search box. Typing continues to refine results instantly.
5) “Apply” (double-click or Enter) fills the Initialization entry only; it does not create a TransformLog node.

============================================================
F) Deliverables
============================================================

- New WPF window/dialog: PresetPickerDialog.xaml + ViewModel
- CatalogService + seed JSON embedded or copied to output
- Persistence service for favorites/recents in AppData
- Initialization lens modifications: Browse button + Ctrl+P + Recents expander
- WebView2 + VexFlow preview in the dialog + NAudio audition
- Build/run instructions
