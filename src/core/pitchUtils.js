import { els, state } from "../state.js";

export function getBaseMidi() {
  const noteEl = els.baseNote;
  const octaveEl = els.baseOctave;
  const baseNoteFromEl = noteEl ? parseInt(noteEl.value, 10) : NaN;
  const baseOctaveFromEl = octaveEl ? parseInt(octaveEl.value, 10) : NaN;
  const baseNote = Number.isFinite(baseNoteFromEl)
    ? baseNoteFromEl
    : (Number.isFinite(state.params.baseNote) ? state.params.baseNote : 0);
  const baseOctave = Number.isFinite(baseOctaveFromEl)
    ? baseOctaveFromEl
    : (Number.isFinite(state.params.baseOctave) ? state.params.baseOctave : 4);
  return (baseOctave + 1) * 12 + baseNote;
}
