# Composition Toolbox Ruleset

## Purpose & philosophy
- The app is a prototype *composition toolbox*: multiple lenses feed a shared `CompositeStore` and a transform log so that MIDI, notation, and inspection features always see the same canonical state.
- The philosophy is deterministic state, semantic clarity, and shared terminology—this document captures what has already been implemented so a future chat‑model or teammate can speak the same language and keep the UI/theme contract intact.

## Deterministic theme system (WPF + Fluent chrome)
- The only colors owned by the app are the 15 semantic roles defined in `CompositionToolbox.App/Themes/AppTheme.Keys.xaml` (five surface, three text, four interaction, three state). That file is treated as a stable ABI.
- Palettes live in `Themes/AppTheme.Palette.LightNeutral.xaml` and `Themes/AppTheme.Palette.DarkNeutral.xaml`; each palette defines `Color.*` resources for those roles.
- `Themes/AppTheme.Brushes.xaml` bridges `Color.*` → `Brush.*`, and `App.xaml` merges dictionaries in this strict order:
  1. Fluent chrome (`PresentationFramework.Fluent;component/Themes/Fluent.xaml` for non-color chrome),
  2. `AppTheme.Keys.xaml`,
  3. `AppTheme.Brushes.xaml`,
  4. default palette (`AppTheme.Palette.DarkNeutral.xaml`, switchable via `AppTheme.Apply`),
  5. project styles (`Themes/Styles.xaml`).
- Content UI (everything owned) binds only to `Brush.*` keys (never `System*` or `Fluent*` brushes or `Color.*` directly). Search for `System`/`Fluent` in XAML and make sure the hits are chrome or explicitly third-party.
- Runtime switching just swaps the palette dictionary via `AppTheme.Apply(AppThemeKind)`. The brush keys stay stable so every view keeps binding to the same `Brush.*` name.
- If a new visual state like hover/pressed is needed, do not invent new brush role names—either reuse an existing brush (e.g., `Brush.Canvas.GridLine` for hover) or adjust opacity of the brush. Document that limitation when you describe the new state.

## Core domain vocabulary
- **Composite**: a named composition with `CompositeId`, `Title`, and `CurrentStateId`. Lives in `Models/CompositeModels.cs`.
- **CompositeState**: snapshot of the composition references (pitch/rhythm/register/etc.) and the `CompositePreviewTarget`. `CompositeStore.TransformState` adds new states and writes `CompositeTransformLogEntry`.
- **AtomicNode**: the canonical pitch/rhythm/voicing/register/event data with `PcMode`, `Ordered`/`Unordered` arrays, `OpFromPrev` provenance and `ValueJson`. Stored in `CompositeStore.Nodes` and `TransformLogStore.Nodes`; deduplicated via `GetOrAddNode`.
  - every AtomicNode carries a ValueType (enum AtomicValueType in DomainModels.cs) that tells you whether it represents PitchList, RhythmPattern, VoicingList, RegisterPattern, or NoteEventSeq. Lenses set that before appending to the TransformLogStore/CompositeStore, so you can always inspect node.ValueType (plus PcMode and ordered/unordered arrays) to understand what kind of data you’re dealing with.
- **CompositeTransformLogEntry**: records each transform (`Op`, `OpParams`, patch of `CompositeRefChange`). The log is what the UI renders in the left-hand grid.
- **ProjectData**: serializable snapshot (nodes, composites, states, log entries, active IDs); persisted via `ProjectService` in `composition-toolbox.project.json`.
- **AppSettings**: window dimensions, panel widths/orders, pinned state, MIDI device, accidental rule, tuning options, theme (`AppThemeKind`), notation preferences, etc. Saved to `%LocalAppData%\CompositionToolbox\settings.json` via `SettingsService`.
- **AtomicValueType & PcMode**: enumerations that tell lens code how to interpret node arrays (`Ordered` vs `Unordered`).
- **OpDescriptor**: records which lens emitted the node, source node, and semantic label; used by the transform log converters.
- **Canonical operations**: each transform now provides a stable `OpKey` (`project/init/input`, `transform/acdl/apply`, etc.) plus structured `OpParams` packed through `OperationLog.CreateParams`. `OpCatalog.Describe` (with its `Summarize*` helpers) maps that canonical payload back into titles, summaries, and tags so the log view renderer can stay in sync with every lens without hardcoding literals.

## Application architecture & execution flow
- **App.xaml / App.xaml.cs**: boots `MainWindow`, wires `Application_Startup`, merges resources, and exposes theme switching. It also defines shared thickness/grid resources (e.g., `App.PanelPadding`, `App.PanelGap`).
- **MainWindow.xaml / MainWindow.xaml.cs**: actual shell; it binds to `MainViewModel`, hosts header controls, lens selector, transform log, workspace preview, and inspector panels. Every control background/foreground comes from `Brush.*`.
- **MainViewModel** (CompositionToolbox.App.ViewModels): orchestrates everything.
  - Holds `CompositeStore`, `TransformLogStore`, `InspectorViewModel`, lens view models, MIDI devices, and commands (`Play`, `TestMidi`, `NewComposite`, etc.).
  - Loads persisted project/settings via `ProjectService` / `SettingsService`, restores selected MIDI device, theme, and active composite.
  - Updates `TransformLogView` filter when the selected composite changes; keeps `SelectedLogEntry` synced.
  - Routes commands to services (MidiService, PresetCatalogService, PresetStateService) and relays inspector interactions.
- **Lens view models**: each lens (Initialization, IVExplorer, FocusAffine, ACDL, Gap→PC, NecklaceEntry, SwirlingMists, Test) implements `ILensActivation`/`ILensPreviewSource` contracts when needed. They read from `CompositeStore`, write nodes/states, and attach to the transform log.
- **Views**: WPF pages named `XxxLensView.xaml`/`.cs` bind to their view models, use `PanelBorderStyle`, `TransformLog*` styles, and supply drag/drop or button interactions. Notation rendering is done via `NotationView` (WebView2 + `Assets/notation.html` using VexFlow) and reused by inspector/workspace preview.
- **Stores**:
  - `CompositeStore`: central state container (composites, states, log entries, canonical nodes). `TransformState` ensures provenance metadata, dedupes log entries, and tracks `LastTransformEntry`.
  - `TransformLogStore`: keeps track of the last selected node, deduplicates new nodes, and validates provenance when nodes are appended. It ties the log to the inspector preview.

## Services & utilities
- `ProjectService`: load/save `ProjectData` under the configured project folder; creates a default composite/state when none exists.
- `SettingsService`: persists `AppSettings` to LocalAppData; called whenever the user adjusts layout, MIDI device, theme, or tuning settings.
- `MidiService`: wraps NAudio; exposes `OpenDevice`, `Play`, `Test` methods, and pitch-bend options. Commands in `MainViewModel` call `TestMidiCommand`, `PlayCommand`, `TestMicrotoneCommand`.
- `PresetCatalogService` / `PresetStateService`: provide synthesized preset metadata and state snapshots for the catalog and inspector.
- `DialogService`: centralized user prompts/alerts; used when provenance is missing or for transform log details.
- `DragOutFileService`: handles MIDI drag exports (the “Drag MIDI” button on the header bar).
- `UiPersistenceHelper`: helps save/restore window/panel layouts.
- `NoteRealizer`, `INoteRealizer`, `MidiExportService`, `IMidiExportService`: tie pitch/rhythm nodes to MIDI data; instrumentation occurs when lenses produce realizations or when the user exports.
- `TimingLogger`, `IntervalVectorIndexService`, `EdoNotation`, `MusicUtils`, and domain helpers support lens math, not directly in the UI but referenced by view models/services.

## Visual & interaction guidelines
- Panels (composites, workspace, inspector) use `PanelBorderStyle`/`PanelBorderNoPaddingStyle` so borders/backgrounds stay on N-level surfaces.
- Header actions (modulus selector, MIDI device picker, Play/Settings buttons) live inside `HeaderBarBorderStyle`; they respect `Brush.Accent` for states (hover, pressed).
- The transform log grid uses DataGrid styles that reference `Brush.Surface` for default, `Brush.Selection` for selection, and `Brush.Canvas.GridLine` for hover outlines.
- All list/grid headers, buttons, grid splitters, and inspector rows reuse brushes defined in `Themes/Styles.xaml`.
- Spacing constants (`App.PanelMargin`, `App.PanelGap`, `App.SectionSpacingTop`, etc.) are the single source of truth for padding/margins; re-use them rather than re-typing literal values.
- Inspector preview windows (`InspectorNotationWindow`, `WorkspaceNotation`) bind to `WorkspacePreview` models supplied by lens view models and use the same styles as main workspace.

## Naming & coding tendencies
- Naming pattern: `XxxLensViewModel` + `XxxLensView`; `XxxWindow` for dialogs; `XxxService` for non-UI helpers; `XxxStore` for observable state; `XxxModel` for persisted data.
- Commands follow the `[Verb][Subject]Command` pattern (`PlayCommand`, `TestMidiCommand`, `NewCompositeCommand`), often paired with `RelayCommand`/`AsyncRelayCommand`.
- Resources are `App.*` for layout, `Brush.*` for theme, `Color.*` for palette, and `Transform*`/`Panel*` for UI pieces.
- When recording transforms, always include provenance metadata (`__trace`, `__seq`, `__thread`, `__time`) as `CompositeStore.TransformState` currently does.
- Observables prefer `ObservableCollection<T>` + `CollectionViewSource` filters; keep view filtering inside view models rather than code-behind.

## ChatGPT alignment notes
1. **Respect the 15 semantic brushes.** If the user asks for new colors, explain the limitation and offer to reinterpret the state via opacity or existing brushes; never add `Brush.*` beyond the set in `AppTheme.Keys`.
2. **Speak MVVM.** When describing changes, reference `MainViewModel`, the relevant lens view model, or the stores/services. Mention which store/state would change, which view model owns the command, and how the view binds to it.
3. **Use existing terminology.** Talk about `Composite`, `CompositeState`, `AtomicNode`, `Transform Log`, `Lens`, `WorkspacePreview`, `Inspector`, `Preset`, `Modulus`, `AccidentalRule`, `AppThemeKind`, etc.
4. **Persistence paths matter.** Remind readers that project data goes in the nominated project folder (the one passed into `ProjectService`), while settings go under `%LocalAppData%\CompositionToolbox`.
5. **Be explicit about services.** If a change touches MIDI, mention `MidiService` and the commands it powers. If it touches notation, note `NotationView`/`WorkspacePreview`.
6. **Avoid `System`/`Fluent` brushes in owned UI.** If you need a border/fill, use `Brush.Surface.*`, `Brush.Text.*`, `Brush.Selection.*`, `Brush.Accent`, or `Brush.Canvas.*`.
7. **Document any new state requirement.** If the user asks for a new hover/pressed visual, highlight that no new brush names are permitted and adjusting opacity or brush layering is the approved workaround.

This ruleset reflects what has already shipped in the repository so a future collaborator or chat model can stay aligned with terminology, theme contracts, and command flows.
