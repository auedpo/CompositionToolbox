You are building a Windows desktop prototype as a .NET 9 WPF app (net9.0-windows) in C#. Use MVVM with CommunityToolkit.Mvvm (ObservableObject + RelayCommand), ModernWpf (v1.1.38) for theming, NAudio for MIDI playback, and Microsoft.Web.WebView2.Wpf for in-app notation rendering using a local HTML page that uses VexFlow.

Create a NEW solution with:

1) A WPF desktop app project targeting net9.0-windows.
   - Use the dotnet CLI or Visual Studio.
   - Enable WPF (UseWPF=true).
   - Add NuGet packages:
     - CommunityToolkit.Mvvm
     - Fluent theme
     - Microsoft.Web.WebView2
     - NAudio

2) MainWindow layout (4 panes + header) using Grid + GridSplitters (or DockPanel + Grid):
   - Top header bar:
     - Modulus selector ComboBox (values: 12, 19)
     - MIDI Out device selector ComboBox
     - Play button
   - Body: 4-pane layout with resizable splitters:
     - Left: “LensList” panel (~180px) with buttons:
       Initialization, Set, Order, Intervals, Symmetry, Matrix, Compose (Compose can be disabled for now)
     - Center-left: “TransformLog” panel (~260px) with a ListBox of nodes
     - Center: “Workspace” panel (fills remaining) that hosts the active lens view (start with Initialization)
     - Right: “Inspector” panel (~280px) showing details of SelectedNode
   - Apply ModernWpf dark theme + a VS Code–like palette, but keep styling minimal and consistent.
   - Use Segoe UI for general UI text; use Consolas (fallback Cascadia Mono, Courier New) for numeric/PC text and input boxes.

3) Implement minimal domain + state (keep domain UI-agnostic):
   - Core models:
     - enum PcMode { Ordered, Unordered }
     - PitchNode:
       { Guid Id; int Modulus; PcMode Mode; int[] Ordered; int[] Unordered; string Label; OpDescriptor? OpFromPrev; }
     - OpDescriptor:
       { string Type; Dictionary<string, object> Params; }
   - Store/state (MVVM-friendly):
     - TransformLogStore (ObservableObject):
       ObservableCollection<PitchNode> Nodes
       PitchNode? SelectedNode (two-way bound to ListBox selection)
       AppendAndSelect(PitchNode node) method
   - MainViewModel exposes:
     - TransformLogStore Store
     - SelectedModulus (int)
     - SelectedMidiDevice (int / device id)
     - Commands: PlayCommand, CreateStartingObject (or separate InitializationViewModel if preferred)

4) Implement Initialization lens (as a UserControl in Workspace):
   - TextBox for entering PC list like: 0 2 5 7 9  (monospace)
   - Mode selector (radio or toggle): Ordered (sequence) vs Unordered (set)
   - Button label must NOT say “node”. Use: “Create Starting Object”.
   - A live preview line:
     - Ordered preview: (0 2 5 7 9)
     - Unordered preview: [0 2 5 7 9]
   - Parsing/normalization rules:
     - Parse ints separated by whitespace/commas.
     - Apply modulus: ((x % m) + m) % m
     - Ordered: keep order and duplicates.
     - Unordered: dedupe + sort ascending.
   - On Create Root:
     - Create PitchNode with OpFromPrev=null and Label="Input"
     - AppendAndSelect it into TransformLogStore.

    - Notation conventions in UI

        Unordered set: display with square brackets: [0 2 3 7]

        Ordered sequence: display with parentheses: (0 3 2 7)

        Interval vector: display with angle brackets: ⟨…⟩ (not used in v1, but reserve it)

        Add Transform Log prefix badge:

        [U] for unordered nodes

        [O] for ordered nodes

        Normalization

        Parse integers from textbox. Apply modulus: ((x % m) + m) % m

        Unordered normalization: dedupe + sort ascending

        Ordered normalization: keep order (and keep duplicates)

5) Implement MIDI playback (NAudio):
   - MidiService:
     - Enumerate MIDI Out devices and expose them for binding.
     - Open selected device; dispose previous on change.
     - PlaySelectedNode(PitchNode node):
       baseMidi = 60
       pcs = (node.Mode==Ordered ? node.Ordered : node.Unordered ascending)
       for each pc:
         note = baseMidi + pc
         velocity = 90
         duration = 250ms
         send NoteOn, wait duration, send NoteOff
   - Wire Play button to PlayCommand which calls MidiService on Store.SelectedNode.
   - Keep timing simple (Task.Delay). No advanced scheduling yet.

6) Implement in-app notation rendering (WebView2 + VexFlow):
   - Add a NotationView in the Workspace (either always visible in Workspace or as a Tab alongside Initialization).
   - Embed WebView2 using Microsoft.Web.WebView2.Wpf (do NOT open external browser windows).
   - Load a local HTML page (notation.html) from app output or embedded resource on startup.
     - The HTML must include VexFlow (bundle locally if possible; CDN acceptable only as a temporary fallback).
   - Define a JS entrypoint:
     - window.renderPcs(payload)
   - On SelectedNode change:
     - Build JSON payload: { mode, modulus, pcs:[...], label }
     - Send to WebView2 via ExecuteScriptAsync or PostWebMessageAsJson to call renderPcs(payload).
   - Rendering constraints for v1:
     - Single staff, treble clef
     - Quarter notes in 4/4
     - Map pcs around C4 (base 60) for now
     - If >16 notes, truncate display (still play full MIDI)

Deliverables:
- Provide the full code for the solution (all files) plus build/run instructions (dotnet CLI).
- Keep math minimal; focus on wiring UI, state, MIDI playback, and in-app notation rendering.
- Do NOT add advanced transforms yet (no NF/PF/IV/matrix/SATF/voicing/rhythm editor). Only Initialization + selection + MIDI + notation.
