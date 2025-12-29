Here are the key questions I’d need answered before implementing the Composite/Atomic split, ordered by dependency:



## Where should composites and composite states be persisted (same AppData JSON as settings/presets, or a new project file)?
		Use a **new project file/folder**, not AppData.
	
	AppData is for **machine/user preferences**. Composites + CompositeStates are **musical work product** and must travel, be versioned, and be recoverable.
	
	### Put where
	
	- **Project file/folder (in the user’s chosen project location)**:
	    
	    - atomic nodes
	        
	    - composites
	        
	    - composite states
	        
	    - composite transform logs
	        
	    - any derived artifacts you want to keep
## Do you want a single default Composite per session, or multiple persisted composites (with create/select UI)?
Multiple **persisted** Composites, with a **single default Composite created automatically** for new projects.

So:

- On new project: auto-create `Composite "Default"` and open it.
    
- Provide create/select UI so users can maintain multiple independent working contexts (sketches, sections, variants) _inside the same project file_.
    

Why this is the right surface choice:

- It preserves your “one timeline per working object” mental model.
    
- It avoids forcing users to fork entire project files just to try a second idea.
    
- It keeps the default experience simple (they don’t have to think about multiples until they need it).
    

Codex implementation notes (surface):

- Browser: list Composites (Default + user-created).
    
- Commands: New Composite, Duplicate Composite (copies current state refs), Rename, Delete (with safeguards).
    
- Selecting a Composite swaps the Transform Log + Inspector context to that Composite’s current state.
## Should CompositeState include a human‑editable label? If yes, where is it edited?
	-Yes. Edited in the inspector
## Should CompositeState store the “current selection” (active slot) or keep that purely UI‑state?
	- We can store it in the state unless you think that would cause issues / confusion



## Confirm exact ValueType enum list for v1 (PcList vs PcSet naming, RhythmPattern, RegisterPlan, ChordVoicing, NoteEventSeq).
	- PcList -> PitchList, RhythmPattern, VoicingList, RegisterPattern, NoteEventSeq
## For now, do atomic nodes still use existing PitchNode shape, or should we rename to AtomicNode and migrate references?
	- Rename and migrate making sure it is stable
## Are atomic nodes still shown anywhere in UI directly, or only via Composite refs?
		Only via **Composite refs** by default. Atomic nodes should be considered internal building blocks unless the user explicitly opens a “library/registry” view.
	
	Answer to Codex:
	
	- **Primary navigation/UI is Composite-centric.** The Browser shows Composites; the Inspector shows the Composite’s referenced components (PitchRef/RhythmRef/etc.) with summaries.
	    
	- **Atomic nodes are not listed as top-level items** in the main Browser in normal mode.
	    
	- Users can still access atomic nodes in three controlled ways:
	    
	    1. **“Open referenced node”** from a Composite slot (inspect details of PitchRef/RhythmRef/etc.).
	        
	    2. **Picker dialogs** when setting/replacing a Composite ref (choose from existing atomic nodes).
	        
	    3. (Optional, later) a dedicated **Node Library** panel for power users/debug (search/filter all nodes), but keep it off the critical path.
	        
	
	Rationale (implementation-facing): reduces cognitive overhead and avoids “bouncing” between unrelated nodes; Composite is the unit of work and the unit of history.

Transform logging

- Where should the CompositeTransformLog live and how is it displayed (replace current Transform Log panel, or add a new one)?
		Put **CompositeTransformLog inside the project file**, and **replace the current Transform Log panel** with a Composite-aware log (same panel, upgraded semantics).
	
	 Where it lives
	
	- Persist it **per Composite**, alongside CompositeStates, in the project data store.
	    
	- Structure options:
	    
	    - `Project → Composites[] → { CompositeId, States[], LogEntries[] }`

	**Transform Log (Composite)**

- Always shows the log for the _currently selected Composite_.
    
- Each row represents an op that produced a new CompositeState.
    
- Columns should be tuned to state changes, not node math:
    
    - Step / time
        
    - Op name
        
    - “Refs changed” summary (e.g., `PitchRef`, `VoicingRef`)
        
    - Optional: quick badges: `Pitch`, `Rhythm`, `Voicing`, `Events`
        
- Selecting a row sets the “current” CompositeState to that entry’s `NewStateId` (time travel).
    

### Detail view on selection

When a log entry is selected, show a details subpanel (or Inspector section) that lists:

- OpParams (collapsed by default)
    
- Patch: old→new refs (human-readable summaries, not raw IDs)
    
    - PitchRef: `P12 (PcList: 0 4 7 1…) → P13 (PcList: 4 7 1 0…)`
        
    - VoicingRef: `— → V3 (Spread #1)`
        

### Why replace, not add

- You want one mental model: “the log is the timeline of my working object.”
    
- Keeping the old pitch-node log alongside a composite log will confuse users and fragment history.
    
- Any atomic node provenance can be shown in a secondary “Node provenance” view when inspecting an atomic node, not as a competing primary timeline.
    

### Extra: keep atomic provenance, but demote it

- Atomic nodes can retain `CreatedByOp` metadata for debugging/audit.
    
- Display it only when the user clicks “Open referenced node” and views that node’s inspector.
    

Codex directive summary:

- Implement CompositeTransformLog as the sole primary log UI, bound to the selected Composite.
    
- Log rows navigate CompositeStates.
    
- Show ref-diff summaries; replace existing Transform Log panel rather than adding a second one.
	
- Should the log entries show full ref snapshot, or just patch summary (e.g., “PitchRef: P12 → P19”)?

UI behavior

- In Inspector, do you want the “Composite Refs” panel above the current pitch preview, or replace it entirely?
		Put **Composite Refs above** the current preview, not replacing it.
		
		Codex-facing answer:
		
		- The Inspector becomes Composite-centric, but it still needs a strong “current musical preview” area.
		    
		- Layout (top → bottom):
		    
		    1. **Composite header** (name, state/step, optional notes)
		        
		    2. **Composite Refs panel** (Pitch/Rhythm/Register/Instrument/Voicing/Events with Add/Replace/Clear + status badges like “stale”)
		        
		    3. **Preview area** (what you have today): render/play the _active_ referenced component (usually PitchRef, optionally VoicingRef if selected)
		        
		    4. **Descriptors / computed info** for the active component (PC metrics, etc.)
		        
		    5. **Commit actions** relevant to the active component (e.g., Commit Voicing)
		        
		
		Implementation detail: the preview area should be driven by an “ActiveRefTab” (Pitch | Voicing | Rhythm | Events). Default to Pitch if present; if not, default to the first non-null ref.
		
		This preserves fast pitch work while making Composite orchestration visible and controllable.
- For “Go to referenced node,” should that open a read‑only view or reuse the same inspector with a different context?
			Reuse the same Inspector, but switch it into a **sub-context (“Atomic Node view”)** that is _read-only by default_.
		
		Codex answer (surface + behavior):
		
		- Clicking **Go to referenced node** keeps the user in the same Inspector panel, but changes the context from:
		    
		    - `CompositeState view` → `AtomicNode view (NodeId=…)`
		        
		- In AtomicNode view:
		    
		    - show the node’s full details (ValueType + ValueJson summary + descriptors)
		        
		    - show its provenance (created-by / source ids if present)
		        
		    - **read-only** by default to prevent users from thinking they are editing the node in place
		        
		    - provide explicit actions:
		        
		        - **“Use this node in Composite”** (sets the relevant CompositeRef to this NodeId and returns to Composite view)
		            
		        - **“Derive new…”** (runs a lens to produce a new atomic node, then optionally assigns it back into the Composite)
		            
		        - **“Back to Composite”** (returns to prior CompositeState context)
		            
		- If you later support “editing,” it should always be via **Create New Node** (fork/derive), never in-place mutation.
		    
		
					So: same inspector UI surface, different mode, and make the mode obvious (breadcrumb at top: `Composite > PitchRef > Node P123`).
## What is the default preview priority when multiple refs exist (Pitch vs Voicing vs Events)?

Default preview should be **Events first**, then **Voicing**, then **Pitch**, with an explicit user override (“Active Preview” tab) that is persisted per Composite.

### Priority rule (automatic)

When a CompositeState loads, choose preview target in this order:

1. **EventsRef** (if present)
    
    - Because it’s the most “complete” representation (pitch+time) and is what the user will most often want to audition/see once it exists.
        
2. **VoicingRef** (if EventsRef absent)
    
    - Because it’s the committed realized pitch+spacing artifact; more informative than raw PCs for audition.
        
3. **PitchRef** (if both above absent)
    
    - Base material.
        
4. **RhythmRef** only if none of the above exist (optional; show a rhythm view).
    

### User override (must exist)

Add `CompositeState.ActivePreview`:

- enum: `Auto | Pitch | Voicing | Events | Rhythm | Register | Instrument`
    
- Default `Auto`
    
- If user manually selects a preview tab, set it to that value and persist it in the CompositeState.
    

### Fallback behavior

If `ActivePreview != Auto` but that ref is currently null:

- fall back to `Auto` priority for this state (don’t error, don’t clear the setting).
## Commit Chord Voicing
Here’s a **final, stable `ChordVoicing` `ValueJson` shape** that will work with your Composite model, support 12-TET and n-EDO, support duplicates, support later rhythm/eventization, and avoid future renames.

 ValueType

- `ValueType = "ChordVoicing"`
    

---

ChordVoicing.ValueJson (schemaVersion 1)

`{   "schemaVersion": 1,    "tuning": {     "mod": 12   },    "source": {     "pitchNodeId": "NODE_ID_REQUIRED",     "registerNodeId": "NODE_ID_OPTIONAL",     "instrumentNodeId": "NODE_ID_OPTIONAL",     "compositeId": "COMPOSITE_ID_OPTIONAL",     "compositeStateId": "STATE_ID_OPTIONAL"   },    "pcs": [0, 4, 7],    "pitches": [     { "p": 48, "pc": 0, "v": 0 },     { "p": 60, "pc": 0, "v": 1 },     { "p": 64, "pc": 4, "v": 2 },     { "p": 79, "pc": 7, "v": 3 }   ],    "layout": {     "order": "low_to_high",     "doublings": "allowed"   },    "method": {     "kind": "preset",     "name": "Spread",     "profileSnapshot": {       "pc0Ref": "C4",       "centerMidi": 60,       "ambitusMidi": [48, 84],       "spacing": "spread",       "inversionPolicy": "auto"     }   } }`

### Field rules (hard requirements)

#### 1) `schemaVersion` (required)

- Integer, starts at `1`.
    

#### 2) `tuning` (required)

`"tuning": { "mod": 12 }`

- `mod` is required (12, 19, etc.).
    
- If later you support non-equal-step pitch systems, extend `tuning` with additional keys; keep `mod` as the compatibility anchor.
    

#### 3) `source` (required with at least `pitchNodeId`)

- Always include:
    
    - `source.pitchNodeId` (the atomic pitch-material node used at commit time)
        
- Optionally include:
    
    - `registerNodeId`, `instrumentNodeId`
        
    - `compositeId`, `compositeStateId` (helpful for “where did I commit this from?” but not required for correctness)
        

This is what drives “stale” detection in the Composite (compare current `PitchRef` to `ChordVoicing.source.pitchNodeId`).

#### 4) `pcs` (required)

- The pitch-class content this voicing realizes, in **voice order** (see below) OR as unique set?
    
- Make it **the realized multiset in voice order**, matching `pitches[].pc`, so it stays consistent even with doublings.
    
    - In the example: there are two 0’s, so `pcs` includes both 0’s.
        

(If you want the unique set too, compute it; don’t store it.)

#### 5) `pitches` (required)

Array of note objects. Each entry is one voiced note.

Each note object fields:

- `p` (required): realized pitch as integer “step” value used for playback/notation
    
    - In 12-TET MIDI, this is standard MIDI note number.
        
    - In n-EDO, this can still be “EDO step number” if your playback pipeline understands it; if not, keep it MIDI and store EDO mapping elsewhere. The key is: `p` is what you actually render/play.
        
- `pc` (required): pitch class integer in `[0..mod-1]`
    
- `v` (optional but strongly recommended): voice index (0..n-1). This makes later voice-leading and rhythm distribution deterministic.
    

**Ordering requirement**

- `pitches` must be sorted by `p` ascending (low→high) at commit time.
    
- `layout.order` documents that.
    

This one rule prevents a ton of confusion downstream.

#### 6) `layout` (required)

`"layout": { "order": "low_to_high", "doublings": "allowed" }`

- `order` currently only `"low_to_high"` (reserve ability for future)
    
- `doublings`: `"allowed"` or `"none"` (document intent; doesn’t enforce)
    

#### 7) `method` (required)

Describes how it was produced and stores the reproducibility snapshot.

`"method": {   "kind": "preset" | "auto" | "manual",   "name": "Spread",   "profileSnapshot": { ... } }`

- `kind`:
    
    - `"preset"`: came from an inspector preset/profile
        
    - `"auto"`: algorithmic with defaults
        
    - `"manual"`: user edited notes directly
        
- `name`: short string (“Spread”, “Closed”, “User Edit #1”)
    
- `profileSnapshot`: arbitrary JSON; store exactly what you used so the result is reproducible even if presets evolve.
    

---

##### Why this shape (brief, practical)

- Works with **Composite refs** (voicing is an atomic node; Composite points to it).
    
- Supports **doublings** naturally (multiple `pitches` entries with same `pc`).
    
- Future rhythm/eventization can rely on `v` (voice index) to distribute patterns.
    
- Avoids storing presentation-only stuff (clef, enharmonic spelling). Add later if needed as separate fields or separate render overrides.
    

---

##### Minimal vs optional (so Codex doesn’t overbuild)

**Required for v1 correctness:**  
`schemaVersion`, `tuning.mod`, `source.pitchNodeId`, `pcs`, `pitches[{p,pc}]`, `layout.order`, `method.kind`, `method.name`, `method.profileSnapshot` (can be `{}`)

**Strongly recommended now:**  
`pitches[].v` and `source.compositeStateId` (for UX / debugging)

---

#### Deterministic commit contract

When committing from Inspector:

1. Resolve PC multiset (including duplicates if your pitch material list contains them; if starting from a set, likely unique unless user explicitly duplicates)
    
2. Produce realized pitches `p`
    
3. Sort low→high
    
4. Assign `v = index in sorted order` unless you have a better voice allocator
    
5. Write payload exactly as above
- Should Commit Voicing update only VoicingRef, or also clear EventsRef as stale?

## Staleness rules

## Which ref dependencies should be validated beyond VoicingRef→PitchRef (e.g., EventsRef depends on RhythmRef and Pitch/Voicing)?
### 1) Dependency recording (required in derived ValueJson)

Add a `source` block (same pattern as `ChordVoicing.source`) to any derived type.

- `ChordVoicing.source.pitchNodeId` (already)
    
- `PitchSeq.source.pitchNodeId` (if you add melodic realization)
    
- `NoteEventSeq.source.*` (see below)
    

### 2) Validation rules (staleness checks)

#### A) `VoicingRef` depends on `PitchRef`

Stale if:

- `Voicing.source.pitchNodeId != Composite.PitchRef`
    

Optionally also check:

- if you used `RegisterRef` to produce it, then stale if `Voicing.source.registerNodeId != Composite.RegisterRef`
    

#### B) `EventsRef` depends on Rhythm + Pitch/Voicing (+ optional Register/Instrument)

Assuming `EventsRef` is a `NoteEventSeq` node, store:

- `NoteEventSeq.source.rhythmNodeId` (required if rhythm was used)
    
- plus **either**:
    
    - `NoteEventSeq.source.voicingNodeId` if eventization used voicing
        
    - `NoteEventSeq.source.pitchNodeId` if eventization used pitch directly
        
- optional:
    
    - `NoteEventSeq.source.registerNodeId` if register influenced pitch realization for events
        
    - `NoteEventSeq.source.instrumentNodeId` if orchestration/channel mapping is embedded
        

Stale if any required source ID doesn’t match the current Composite refs.

Concrete staleness logic:

- If `NoteEventSeq.source.rhythmNodeId` exists and `!= Composite.RhythmRef` → stale
    
- If `NoteEventSeq.source.voicingNodeId` exists:
    
    - if `!= Composite.VoicingRef` → stale
        
- else if `NoteEventSeq.source.pitchNodeId` exists:
    
    - if `!= Composite.PitchRef` → stale
        

(Do not require both voicing and pitch; require whichever was actually used.)

#### C) `PitchSeqRef` (if present) depends on Pitch (+ optional Register)

If you later add a melodic realized sequence node:

- stale if `PitchSeq.source.pitchNodeId != Composite.PitchRef`
    
- and if `PitchSeq.source.registerNodeId` exists: stale if mismatch
    

### 3) What not to validate (at least for v1)

To avoid noise and complexity, don’t mark stale based on:

- inspector render presets / UI-only profiles (unless they materially affect a derived artifact and are captured in `source`, which is optional)
    
- computed descriptors caches
    
- visual-only settings (clef, enharmonic spelling)
    

### 4) UX surface (consistent across refs)

In Composite Refs panel:

- Show a “STALE” badge on `VoicingRef` / `EventsRef` when stale.
    
- Provide action buttons inline:
    
    - for Voicing: “Recompute voicing”
        
    - for Events: “Re-eventize” (regenerate events using current refs)
        
- Never auto-regenerate; always explicit.
    

### 5) Summary table (Codex-friendly)

- `VoicingRef` stale if `Voicing.source.pitchNodeId != PitchRef` (and optional register)
    
- `EventsRef` stale if mismatch in any of:
    
    - `NoteEventSeq.source.rhythmNodeId != RhythmRef` (if present)
        
    - `NoteEventSeq.source.voicingNodeId != VoicingRef` (if present)
        
    - else `NoteEventSeq.source.pitchNodeId != PitchRef` (if present)
        
    - optional instrument/register mismatches if those were used


## For existing sessions: do we create a default Composite and set PitchRef to current selected node, or first node in log?
There are no existing sessions
