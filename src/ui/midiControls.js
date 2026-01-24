import { els, state, storageKeys } from "../state.js";
import { getBaseMidi } from "../core/pitchUtils.js";
import { getFocusedIntervalPlacementRecord } from "../core/activePlacement.js";

let midiAccess = null;
let midiOutputs = [];

export async function requestMidiAccess() {
  if (!navigator.requestMIDIAccess) {
    els.status.textContent = "Web MIDI not supported in this browser";
    return null;
  }
  if (midiAccess) return midiAccess;
  try {
    midiAccess = await navigator.requestMIDIAccess();
    midiAccess.onstatechange = refreshMidiOutputs;
    refreshMidiOutputs();
    return midiAccess;
  } catch {
    els.status.textContent = "MIDI access denied";
    return null;
  }
}

export function refreshMidiOutputs() {
  midiOutputs = midiAccess ? Array.from(midiAccess.outputs.values()) : [];
  const current = localStorage.getItem(storageKeys.midiOut) || "";
  els.midiOut.innerHTML = "";
  const empty = document.createElement("option");
  empty.value = "";
  empty.textContent = "No device";
  els.midiOut.appendChild(empty);
  midiOutputs.forEach((out) => {
    const opt = document.createElement("option");
    opt.value = out.id;
    opt.textContent = out.name || out.id;
    els.midiOut.appendChild(opt);
  });
  if (current) {
    els.midiOut.value = current;
  }
}

function getSelectedOutput() {
  const id = els.midiOut.value;
  if (!id) return null;
  return midiOutputs.find((out) => out.id === id) || null;
}

function getPlaybackRecord() {
  return getFocusedIntervalPlacementRecord() || state.selected || (state.resultsByO[state.activeO] || [])[0];
}

export function previewSelected() {
  const rec = getPlaybackRecord();
  if (!rec) return;
  requestMidiAccess().then(() => {
    const out = getSelectedOutput();
    if (!out) {
      els.status.textContent = "Select a MIDI output";
      return;
    }
    const baseMidi = getBaseMidi();
    const notes = rec.pitches.map((p) => baseMidi + p).filter((n) => n >= 0 && n <= 127);
    const now = window.performance.now();
    const durationMs = 2000;
    notes.forEach((note) => out.send([0x90, note, 80], now));
    notes.forEach((note) => out.send([0x80, note, 64], now + durationMs));
  });
}

function scheduleNoteOnOff(out, note, onTime, durationMs, velocity) {
  out.send([0x90, note, velocity], onTime);
  out.send([0x80, note, 64], onTime + durationMs);
}

function scheduleNoteOn(out, note, onTime, velocity) {
  out.send([0x90, note, velocity], onTime);
}

function scheduleNoteOff(out, note, offTime) {
  out.send([0x80, note, 64], offTime);
}

export function playIntervalSequence() {
  const rec = getPlaybackRecord();
  if (!rec) return;
  requestMidiAccess().then(() => {
    const out = getSelectedOutput();
    if (!out) {
      els.status.textContent = "Select a MIDI output";
      return;
    }
    const baseMidi = getBaseMidi();
    const now = window.performance.now();
    const durationMs = 420;
    const gapMs = 120;
    const velocity = 80;
    const usedNotes = new Set();
    rec.endpoints.forEach(([low, high], idx) => {
      const start = now + idx * (durationMs + gapMs);
      const lowNote = baseMidi + low;
      const highNote = baseMidi + high;
      if (lowNote >= 0 && lowNote <= 127) {
        scheduleNoteOn(out, lowNote, start, velocity);
        usedNotes.add(lowNote);
      }
      if (highNote >= 0 && highNote <= 127) {
        scheduleNoteOn(out, highNote, start, velocity);
        usedNotes.add(highNote);
      }
    });
    const tailMs = state.params.midiTailMs || 0;
    const endTime = now + rec.endpoints.length * (durationMs + gapMs) + tailMs;
    usedNotes.forEach((note) => scheduleNoteOff(out, note, endTime));
  });
}

export function playArpeggioSequence() {
  const rec = getPlaybackRecord();
  if (!rec) return;
  requestMidiAccess().then(() => {
    const out = getSelectedOutput();
    if (!out) {
      els.status.textContent = "Select a MIDI output";
      return;
    }
    const baseMidi = getBaseMidi();
    const now = window.performance.now();
    const durationMs = 320;
    const gapMs = 90;
    const velocity = 78;
    const usedNotes = new Set();
    rec.pitches.forEach((pitch, idx) => {
      const start = now + idx * (durationMs + gapMs);
      const note = baseMidi + pitch;
      if (note >= 0 && note <= 127) {
        scheduleNoteOn(out, note, start, velocity);
        usedNotes.add(note);
      }
    });
    const tailMs = state.params.midiTailMs || 0;
    const endTime = now + rec.pitches.length * (durationMs + gapMs) + tailMs;
    usedNotes.forEach((note) => scheduleNoteOff(out, note, endTime));
  });
}
