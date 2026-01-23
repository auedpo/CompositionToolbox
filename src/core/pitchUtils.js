import { els } from "../state.js";

export function getBaseMidi() {
  const baseNote = parseInt(els.baseNote.value, 10) || 0;
  const baseOctave = parseInt(els.baseOctave.value, 10) || 4;
  return (baseOctave + 1) * 12 + baseNote;
}
