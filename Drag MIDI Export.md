Implement Tier-1 MIDI drag-out from the WPF top bar.

**UI**

- Add a top-bar Button labeled “MIDI”.
    
- Drag gesture:
    
    - record mouse down point
        
    - on mouse move with left button pressed, if movement exceeds system drag threshold → initiate drag.
        
    - If Shift is held at drag start → `RenderMode=Sequence`, else `RenderMode=Chord`.
        

**Data**

- Create `CompositeSnapshot` DTO (immutable) capturing the selected composite at drag start.
    
- Build snapshot via `CompositeSnapshotFactory.CreateFromSelection(...)`.
    

**Export**

- Implement `IMidiExportService.ExportToTempMidi(CompositeSnapshot snap, MidiExportOptions opts) -> string tempPath`
    
- Temp path: `%TEMP%\CompositionToolbox\DragOut\CTB_{name}_{timestamp}_{idShort}.mid`
    
- MIDI rules:
    
    - TicksPerQuarter = 480, Tempo = 120 bpm, TimeSig = 4/4 (Tier-1 fixed).
        
    - Chord:
        
        - sort ascending, dedupe
            
        - all note-on at tick 0
            
        - note-off at 4 beats (4 * TPQ)
            
    - Sequence:
        
        - order = snap order if defined else ascending
            
        - step = 1/8 note = 0.5 beats = 0.5 * TPQ ticks
            
        - duration = gate 0.9 * step
            
- Include track name meta event = snap.DisplayName.
    
- Velocity default = 90.
    

**DragDrop**

- After exporting, create `DataObject` with `DataFormats.FileDrop` containing `tempPath`.
    
- Call `DragDrop.DoDragDrop(midiButton, dataObject, DragDropEffects.Copy)`.
    
- After DoDragDrop returns, attempt delete temp file; if locked, queue for deferred deletion.
    

**Cleanup**

- On app startup: delete DragOut files older than 7 days + retry queued deletes.
    

**Non-negotiables**

- Drag/export must not create nodes or write transform log entries.

- Sequence uses Composite order when available

---
- Introduce `RealizedNote { MidiNote:int, BendSemitones:double, Velocity:int? }`.
    
- Add `INoteRealizer.Realize(CompositeSnapshot snap) -> IReadOnlyList<RealizedNote>` using existing microtonal logic (already working in playback).
    
- `MidiExportOptions` must include `PitchBendRangeSemitones` (e.g., 2.0) and `UseMpeChannels` (true for chord mode).

- Read `PitchBendRangeSemitones` from app settings at drag start; do not hardcode 24.
    
- Use existing microtonal realization to produce `RealizedNote(MidiNote, BendSemitones[, Velocity])`.
    
- Chord mode:
    
    - one channel per note (2–16), fail if >15 notes.
        
    - set RPN Pitch Bend Sensitivity on each used channel at tick 0 using `PitchBendRangeSemitones`.
        
    - emit PB-before-NoteOn per channel; NoteOff at 1 bar; optionally reset PB after NoteOff.
        
- Sequence mode (Shift+drag):
    
    - reuse channel 2.
        
    - set RPN on channel 2 at tick 0.
        
    - each note = 1/8 note step, gate 0.9; PB-before-NoteOn each step; optionally reset after each note.
    
- Export algorithm:
    
    - Allocate MIDI channels:
        
        - Chord: per-note channels from 2..16
            
        - Sequence: reuse Ch2 (or per-note, but prefer reuse)
            
    - For each used channel at file start:
        
        - Send RPN 0,0 (Pitch Bend Sensitivity) to set PB range to `PitchBendRangeSemitones`.
            
    - For each note event:
        
        - Compute 14-bit pitch bend value from `BendSemitones` and `PitchBendRangeSemitones`:
            
            - center = 8192
                
            - full-scale = 8192
                
            - pb = clamp(center + (BendSemitones / PitchBendRangeSemitones) * full-scale, 0..16383)
                
        - Emit Pitch Bend message **before** Note On on that channel.
            
        - Emit Note Off at end time.
            
        - Emit Pitch Bend reset to 8192 after Note Off (optional but recommended).
            
- Preserve existing drag/drop temp-file flow.

