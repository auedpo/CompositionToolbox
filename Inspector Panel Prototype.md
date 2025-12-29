Implement / prototype the Inspector panel iteration for the Composition Toolbox WPF app.

<!-- 
This is from Obsidian note obsidian://open?vault=Workspace&file=Inspector%20Panel%20Prototype  
-->

Stack (fixed):
- Windows, .NET 9 (net9.0-windows), C# WPF
- MVVM: CommunityToolkit.Mvvm
- Theming: Fluent
- Notation: WebView2 + local HTML + VexFlow
- MIDI: NAudio

Scope:
- Implement ONLY the Inspector UI and the logic needed to support its computed properties and commit actions.
- Do not refactor the entire app. Keep changes localized and incremental.

============================================================
A) Inspector: Purpose + Behavior
============================================================

The Inspector is the master–detail panel for the currently selected TransformLog node.
It must:
1) Display the node’s value first (ordered vs unordered formatting).
2) Display a VexFlow rendering as a CHORD by default (with an optional toggle to render as a melodic fragment).
3) Provide computed “descriptor” datapoints (set projection, NF, PF, pitch-class content metrics) WITHOUT creating new nodes.
4) Provide explicit “Commit” actions that create new nodes in TransformLog (exploratory tool; do not hide commit options).

IMPORTANT: Computations are properties until committed. Committing must always be a deliberate user action.

============================================================
B) Formatting conventions (must be consistent everywhere)
============================================================

Node display:
- Ordered sequence:      (0 2 5 7)
- Unordered set:         [0 2 5 7]
- Badge prefix in log:   [O] or [U]

Unordered nodes must ALWAYS store and display sorted unique pcs ascending.

============================================================
C) Inspector Layout (apply your feedback)
============================================================

1) Header (always visible)
- Left: Node badge ([O] or [U])
- Primary display (monospace): show node value FIRST ( ( … ) or [ … ] )
- Metaline (small text): show:
  - Label: <node.Label>
  - From: <OpFromPrev display> (if null: “From: —” or hidden)
Do NOT show Modulus in the metaline (global setting, for now).

2) Notation + Playback (integrated in Inspector)
- Show an in-app WebView2 panel that renders:
  - Default: chord spelling of the node’s pitch content
  - Toggle: “Chord / Sequence”
    - Chord mode:
      - Ordered: render as a chord using the node’s pitch content (unique pcs is OK; duplicates ignored)
      - Unordered: render as a chord using the unordered list
    - Sequence mode:
      - Ordered: render as notes in entered order (including duplicates)
      - Unordered: render notes in ascending order (since that is the canonical projection)
- Provide a Play button near the notation that plays what is currently displayed:
  - Chord mode: play as block chord
  - Sequence mode: play as sequence
Playback must reflect display type as above.

3) Sequence datapoints (ONLY if Mode==Ordered)
Do not create a redundant big section; keep it as datapoints under the header:
- Sequence (monospace): same as primary display OR omit if truly redundant; acceptable to omit if it’s identical.
- Length: k = <count of Ordered list>
- Unique pcs: u = <unique count>
- Indices toggle: optional; if implemented, show as inline “i:value” list next to Sequence in sequence mode only (no notation index overlay required in v1).

4) Set projection datapoint (always computed; shown prominently for Ordered nodes)
- Label: “Set projection (sorted unique pcs):”
- Value (monospace): [ … ] computed from selected node:
  - If Ordered: dedupe+sort Ordered
  - If Unordered: it is the node itself
- Definition text should be tooltip/hover only (not always visible).
Actions:
- Button: “Commit as Unordered node” (creates a new node by FORGET_ORDER from an ordered node; if already unordered, disable or change label to “Already Unordered”)
No global right-click/copy menu work in this task; skip.

5) Canonical orderings from set projection (computed datapoints)
Not a large section—two lines (datapoints):
- “NF (from set): ( … )”
- “PF (from set): ( … )”
Each has a Commit button next to it:
- “Commit NF node”
- “Commit PF node”
Important: These MUST clearly communicate they are derived from set projection (discarding original sequence ordering).

6) Pitch-class content (prominent; this is central)
Compute from the SET PROJECTION (unordered sorted unique):
- Cardinality (unique): |S| = …
- Linear span: max(S) - min(S)  (label it “Linear span”, not ambitus)
- Circular gaps / OIS (ordered interval set):
  - Define OIS as circular forward differences on the sorted unique set:
    S = [s0,s1,…,s(k-1)]
    OIS = [(s1-s0) mod m, (s2-s1) mod m, …, (s0+ m - s(k-1)) mod m]
  - Display as: “OIS (circular): ⟨ … ⟩” in monospace
Reserve space for IV later but do NOT implement IV in this task.

============================================================
D) OpDescriptor: clarify “policy” vs “source”
============================================================

We need a stable, replayable definition of transforms (machine-truth) plus UI provenance (metadata).

Implement these fields:

OpDescriptor:
- string OpType              // machine identifier, e.g. "INIT", "FORGET_ORDER", "CHOOSE_ORDERING"
- string OperationLabel      // user-facing, e.g. "Choose ordering (NF)"
- string SourceLens          // where action was initiated, e.g. "Inspector", "Order", "Set"
- Dictionary<string, object> Params  // parameters needed to replay, e.g. { "policy":"NF", "axis":0 }

Clarification:
- policy ≠ source
  - policy = how the result was chosen (NF vs PF vs Random, etc.) => goes in Params["policy"]
  - source = which UI lens initiated the action (Inspector vs Order lens, etc.) => SourceLens field
OpFromPrev on PitchNode should store the OpDescriptor used to create that node from its parent.

For this task, implement OpFromPrev for nodes created by Inspector commits:
- Commit as Unordered node:
  - OpType: "FORGET_ORDER"
  - OperationLabel: "Forget order"
  - SourceLens: "Inspector"
  - Params: { "derivedFrom":"OrderedProjection" } (optional)
- Commit NF node:
  - OpType: "CHOOSE_ORDERING"
  - OperationLabel: "Choose ordering (NF)"
  - SourceLens: "Inspector"
  - Params: { "policy":"NF", "derivedFrom":"SetProjection" }
- Commit PF node:
  - OpType: "CHOOSE_ORDERING"
  - OperationLabel: "Choose ordering (PF)"
  - SourceLens: "Inspector"
  - Params: { "policy":"PF", "derivedFrom":"SetProjection" }

Also implement a compact display string for OpFromPrev:
- Example: "Inspector → Choose ordering (NF)"
- Example: "Inspector → Forget order"

============================================================
E) Commit behavior + “dedupe without breaking chronology”
============================================================

E) Commit behavior (chronology-preserving, minimal no-op suppression)

Rule:
- If the node that would be created is equivalent to the CURRENTLY SELECTED node (same Mode, Modulus, ValueArray),
  then treat the commit as a no-op: do not append a new node; keep current node selected (optionally show status).
- If an equivalent node exists elsewhere in the TransformLog but it is NOT the current node,
  still append the new node and select it. We prefer chronological trace and branching over value dedupe.

Implement TransformLogStore.AppendUnlessNoop(candidate) accordingly.

============================================================
F) NF/PF computation requirements (needed for Inspector datapoints)
============================================================

Implement Rahn-style Normal Order (“Normal Form” in our UI) and Prime Form for pitch-class sets mod m.

IMPORTANT: This is for UNORDERED pitch-class sets (membership only). Input should be normalized before NF/PF:
- reduce mod m
- dedupe
- sort ascending
Call this S = [s0 < s1 < ... < s(k-1)].

============================================================
1) Helper definitions
============================================================

A) mod normalization:
norm(x) = ((x % m) + m) % m

B) transpose a list so first element becomes 0:
transpose_to_zero(L):
  t = L[0]
  return [ norm(x - t) for x in L ]

C) rotation of the sorted set (cyclic ordering):
For i in [0..k-1], define rotated list Ri:
  Ri = [ s_i, s_{i+1}, ..., s_{k-1}, s_0 + m, s_1 + m, ..., s_{i-1} + m ]
Then transpose_to_zero(Ri) to compare candidates in [0..m) space.
(Using +m on the wrapped part preserves increasing order before transposition.)

D) span of a candidate list C (after transpose_to_zero):
span(C) = C[k-1]  // because C[0]=0

E) Adjacent interval list of a candidate C (C is increasing, C[0]=0):
adj(C) = [ C[1]-C[0], C[2]-C[1], ..., C[k-1]-C[k-2] ]
This is NOT circular (no wrap interval) for NF comparison.

F) Rahn tie-break comparator for “packed to the left” in Normal Order:
Compare candidates by their adjacent intervals starting from the RIGHT (end) moving left:
- Let A = adj(Ca), B = adj(Cb)
- Compare A[k-2] vs B[k-2]; smaller wins
- If equal, compare A[k-3] vs B[k-3]; continue leftward
- If all equal, candidates are equivalent (pick the earliest rotation index as deterministic fallback)

This right-to-left interval comparison is the key Rahn tie-break rule.

============================================================
2) Normal Form (Rahn Normal Order)
============================================================

Function: NormalFormRahn(S, m) -> int[]  // returns ordered list starting at 0

Algorithm:
1) Generate all rotations Ri of S as described above.
2) For each Ri:
   Ci = transpose_to_zero(Ri)  // Ci[0]=0 and Ci is increasing
   compute span_i = span(Ci)
3) Choose the candidate(s) with the smallest span_i.
4) If one candidate remains, return it.
5) If tie:
   apply the Rahn right-to-left interval comparator (Section 1F) to break ties.
6) If still tied (rare/symmetric):
   choose the one with the smallest rotation index i (deterministic).

Return that Ci.

============================================================
3) Prime Form (Rahn)
============================================================

Function: PrimeFormRahn(S, m) -> int[]  // returns ordered list starting at 0

Algorithm:
1) A = NormalFormRahn(S, m)  // already starts at 0
2) Compute inversion of the set about 0:
   InvSet = sorted unique of [ norm(-x) for x in S ]
3) B = NormalFormRahn(InvSet, m)

Now choose between A and B using Rahn’s “most packed to the left” rule:

Define PackedKey(C):
  return adj(C) compared RIGHT-to-LEFT (same as Section 1F),
  and if that tie-break is equal, compare the pitch list itself lexicographically (C[0],C[1],...).

Selection:
- If PackedKey(A) is “smaller” than PackedKey(B), choose A.
- Else choose B.
- Deterministic fallback: if identical, choose A.

Return the chosen candidate (starts at 0).

============================================================
4) Notes / constraints
============================================================

- NF and PF must ALWAYS return lists that start with 0.
- NF/PF only operate on unordered input S (sorted unique). If a caller gives ordered input, it must first project to unordered.
- All logic must be in Core (no WPF). UI calls these functions from Initialization + Inspector.
- Add unit tests for a handful of known sets including at least one tie-break case.


============================================================
G) Typography + theming
============================================================

- Use ModernWpf 1.1.38 dark theme.
- Monospace (Consolas with fallback Cascadia Mono, Courier New) for:
  - primary value display
  - set projection
  - NF/PF lines
  - OIS line
- Keep other UI text in Segoe UI.

============================================================
H) Deliverable
============================================================

Provide:
- Updated WPF XAML for Inspector panel (or a new InspectorView user control)
- Updated ViewModel(s) and any minimal supporting services or store methods
- WebView2 + VexFlow integration inside Inspector for chord/sequence display
- NAudio playback wiring for the Inspector Play button (reflecting the chord/sequence toggle)

Keep changes minimal: do not add other lenses or new transforms beyond the three commits specified.
