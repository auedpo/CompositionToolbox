import { els, state } from "../state.js";
import { hueForInterval, intervalLightness } from "../core/visuals.js";
import { getBaseMidi } from "../core/pitchUtils.js";

function parseGuitarTuning(text) {
  if (!text) return [];
  const tokens = text.trim().includes(" ")
    ? text.trim().split(/\s+/)
    : (text.match(/[A-Ga-g](?:#|b)?/g) || []);
  const semis = {
    C: 0, "C#": 1, Db: 1,
    D: 2, "D#": 3, Eb: 3,
    E: 4,
    F: 5, "F#": 6, Gb: 6,
    G: 7, "G#": 8, Ab: 8,
    A: 9, "A#": 10, Bb: 10,
    B: 11
  };
  return tokens.map((t) => semis[t.toUpperCase()] ?? null).filter((v) => v !== null);
}

function noteNameFromMidi(midi) {
  const names = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];
  const pc = ((midi % 12) + 12) % 12;
  const octave = Math.floor(midi / 12) - 1;
  return `${names[pc]}${octave}`;
}

export function renderKeyboard() {
  if (!els.keyboard) return;
  const rec = state.selected || (state.resultsByO[state.activeO] || [])[0];
  const edo = state.params.edoSteps;
  if (!rec || edo !== 12) {
    els.keyboard.innerHTML = "<div class=\"meta-line\">Keyboard view uses 12-EDO.</div>";
    return;
  }
  const O = state.activeO;
  const L = O * edo;
  const baseMidi = getBaseMidi();
  const activeSet = new Set(rec.pitches.map((p) => p));
  const hoverPitch = state.hoverPitch;
  const whiteKeys = [];
  const blackKeys = [];
  let whiteIndex = 0;
  const styles = getComputedStyle(els.keyboard);
  const whiteWidth = parseFloat(styles.getPropertyValue("--white-width")) || 22;
  const blackWidth = parseFloat(styles.getPropertyValue("--black-width")) || 14;
  for (let step = 0; step <= L; step++) {
    const midi = baseMidi + step;
    const note = ((midi % 12) + 12) % 12;
    const isBlack = note === 1 || note === 3 || note === 6 || note === 8 || note === 10;
    if (!isBlack) {
      const classes = ["white-key"];
      if (activeSet.has(step)) classes.push("active");
      if (hoverPitch === step) classes.push("hover");
      whiteKeys.push(`<div class="${classes.join(" ")}" data-pitch="${step}"></div>`);
      whiteIndex += 1;
    } else {
      const left = whiteIndex * whiteWidth - blackWidth / 2;
      const classes = ["black-key"];
      if (activeSet.has(step)) classes.push("active");
      if (hoverPitch === step) classes.push("hover");
      blackKeys.push(`<div class="${classes.join(" ")}" data-pitch="${step}" style="left:${left}px"></div>`);
    }
  }
  els.keyboard.innerHTML = `
    <div class="keyboard-keys">
      <div class="white-keys">${whiteKeys.join("")}</div>
      <div class="black-keys">${blackKeys.join("")}</div>
    </div>
  `;
}

export function renderFretboard() {
  if (!els.fretboard) return;
  const rec = state.selected || (state.resultsByO[state.activeO] || [])[0];
  const edo = state.params.edoSteps;
  if (!rec || edo !== 12) {
    els.fretboard.innerHTML = "<div class=\"meta-line\">Fretboard view uses 12-EDO.</div>";
    return;
  }
  const tuning = parseGuitarTuning(els.guitarTuning.value || "EADGBE");
  if (!tuning.length) {
    els.fretboard.innerHTML = "<div class=\"meta-line\">Enter a tuning to show the fretboard.</div>";
    return;
  }
  const baseMidi = getBaseMidi();
  const pitchMidis = rec.pitches.map((p) => baseMidi + p);
  const activeMidis = new Set(pitchMidis);
  const midiToPitch = new Map(pitchMidis.map((midi, idx) => [midi, rec.pitches[idx]]));
  const hoverMidi = state.hoverPitch === null ? null : baseMidi + state.hoverPitch;
  const styles = getComputedStyle(els.fretboard);
  const baseWidth = parseFloat(styles.getPropertyValue("--fret-width")) || 29;
  const paddingLeft = parseFloat(styles.paddingLeft) || 0;
  const paddingRight = parseFloat(styles.paddingRight) || 0;
  const availableWidth = Math.max(0, els.fretboard.clientWidth - paddingLeft - paddingRight);
  const fretDecay = Math.pow(1 / 1.3, 1 / 11);
  let widths = Array.from({ length: 25 }, (_, idx) => {
    if (idx === 0) return baseWidth;
    const width = baseWidth * Math.pow(fretDecay, idx - 1);
    return Math.max(baseWidth * 0.6, width);
  });
  const totalWidth = widths.reduce((sum, w) => sum + w, 0);
  if (totalWidth > 0) {
    const scale = 1.1;
    widths = widths.map((w) => w * scale);
  }
  void availableWidth;
  els.fretboard.style.setProperty("--nut-left", `${widths[0]}px`);
  const openMidis = [];
  tuning.forEach((pc, idx) => {
    if (idx === 0) {
      const offsetDown = (baseMidi - pc + 12) % 12;
      openMidis.push(baseMidi - offsetDown);
      return;
    }
    const prev = openMidis[idx - 1];
    let offsetUp = (pc - (prev % 12) + 12) % 12;
    if (offsetUp === 0) offsetUp = 12;
    openMidis.push(prev + offsetUp);
  });
  const rows = [...openMidis].reverse().map((openMidi) => {
    const cells = [];
    for (let fret = 0; fret <= 24; fret++) {
      const midi = openMidi + fret;
      const isActive = activeMidis.has(midi);
      const pitch = midiToPitch.get(midi);
      const hue = Number.isFinite(pitch) ? hueForInterval(pitch, state.params.edoSteps) : 0;
      const lightness = Number.isFinite(pitch)
        ? intervalLightness(pitch, state.params.edoSteps)
        : 45;
      const dotClass = ["fret-dot"];
      if (hoverMidi === midi) dotClass.push("hover");
      const title = noteNameFromMidi(midi);
      const dot = isActive
        ? `<span class="${dotClass.join(" ")}" style="--fret-hue:${hue}; --fret-lightness:${lightness}%">${pitch}</span>`
        : "";
      const cellClass = `fret-cell${(fret % 12 === 0 || fret % 12 === 3 || fret % 12 === 5 || fret % 12 === 7 || fret % 12 === 9) ? " marker" : ""}`;
      cells.push(`<div class="${cellClass}" style="width:${widths[fret].toFixed(2)}px" title="${title}">${dot}</div>`);
    }
    return `<div class="fret-row">${cells.join("")}</div>`;
  });
  const markers = [];
  for (let fret = 0; fret <= 24; fret++) {
    const label = fret === 0
      ? "OPEN"
      : (fret % 12 === 0 || fret % 12 === 3 || fret % 12 === 5
        || fret % 12 === 7 || fret % 12 === 9) ? `${fret}` : "";
    markers.push(`<div class="fret-marker" style="width:${widths[fret].toFixed(2)}px">${label}</div>`);
  }
  els.fretboard.innerHTML = `
    <div class="fretboard-rows">${rows.join("")}</div>
    <div class="fretboard-markers">${markers.join("")}</div>
  `;
}
