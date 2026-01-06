/* global window */
(function (global) {
  const EDO_SPELLINGS = {
    19: [
      "C",
      "C#",
      "Db",
      "D",
      "D#",
      "Eb",
      "E",
      "E#",
      "F",
      "F#",
      "Gb",
      "G",
      "G#",
      "Ab",
      "A",
      "A#",
      "Bb",
      "B",
      "B#"
    ],
    31: [
      "C",
      "C+",
      "C#",
      "Db",
      "Dd",
      "D",
      "D+",
      "D#",
      "Eb",
      "Ed",
      "E",
      "E+",
      "E#",
      "F",
      "F+",
      "F#",
      "Gb",
      "Gd",
      "G",
      "G+",
      "G#",
      "Ab",
      "Ad",
      "A",
      "A+",
      "A#",
      "Bb",
      "Bd",
      "B",
      "Cb",
      "Cd"
    ]
  };

  function normalizePc(pc, modulus) {
    const mod = modulus || 12;
    return ((pc % mod) + mod) % mod;
  }

  function splitNoteName(name) {
    const base = name[0].toLowerCase();
    const acc = name.length > 1 ? name.slice(1) : null;
    return { base, acc };
  }

  function midiToNoteSpec(midi, preferSharps) {
    const sharpNames = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];
    const flatNames = ["C", "Db", "D", "Eb", "E", "F", "Gb", "G", "Ab", "A", "Bb", "B"];
    const names = preferSharps ? sharpNames : flatNames;
    const octave = Math.floor(midi / 12) - 1;
    const note = names[midi % 12];
    const base = note[0].toLowerCase();
    const acc = note.length > 1 ? note.slice(1) : null;
    return { key: base + "/" + octave, acc };
  }

  function pcToEdoSpec(pc, modulus, baseOctave) {
    const spellings = EDO_SPELLINGS[modulus];
    if (!spellings) return null;
    const normalized = normalizePc(pc, modulus);
    const name = spellings[normalized];
    if (!name) return null;
    const parts = splitNoteName(name);
    return { key: parts.base + "/" + baseOctave, acc: parts.acc };
  }

  function pcsToEdoNotes(pcs, modulus, baseOctave) {
    const spellings = EDO_SPELLINGS[modulus];
    if (!spellings) return [];
    return pcs.map(function (pc) {
      return pcToEdoSpec(pc, modulus, baseOctave);
    });
  }

  function pcsToEdoNotesWithMidi(pcs, midiList, modulus) {
    const spellings = EDO_SPELLINGS[modulus];
    if (!spellings) return [];
    const safeMidi = midiList.length > 0 ? midiList : [60];
    const minMidi = Math.min.apply(null, safeMidi);
    const baseOctave = Math.floor(minMidi / 12) - 1;
    return pcs.map(function (pc, i) {
      const midi = midiList[i] !== undefined ? midiList[i] : minMidi;
      const octaveShift = Math.floor((midi - minMidi) / modulus);
      const octave = baseOctave + octaveShift;
      return pcToEdoSpec(pc, modulus, octave);
    });
  }

  function getDirectionPreference(values, i, fallback) {
    if (i > 0 && values[i] !== values[i - 1]) return values[i] > values[i - 1];
    for (let j = i + 1; j < values.length; j++) {
      if (values[j] !== values[i]) return values[j] > values[i];
    }
    return fallback !== undefined ? fallback : true;
  }

  function pcsToMidiNotes(pcs, base, rule) {
    const mode = (rule || "noteaware").toLowerCase();
    let lastPreference = true;
    let prevAccidental = null;
    return pcs.map(function (pc, i) {
      let preferSharps = true;
      if (mode === "allsharps") {
        preferSharps = true;
      } else if (mode === "allflats") {
        preferSharps = false;
      } else {
        preferSharps = getDirectionPreference(pcs, i, lastPreference);
        if (mode === "noteaware") {
          if (prevAccidental === "#") preferSharps = true;
          if (prevAccidental === "b") preferSharps = false;
        }
      }

      const spec = midiToNoteSpec(base + pc, preferSharps);
      lastPreference = preferSharps;
      prevAccidental = spec.acc ? spec.acc : null;
      return spec;
    });
  }

  function midiListToNoteSpecs(midiList, rule) {
    const mode = (rule || "noteaware").toLowerCase();
    let lastPreference = true;
    let prevAccidental = null;
    return midiList.map(function (midi, i) {
      let preferSharps = true;
      if (mode === "allsharps") {
        preferSharps = true;
      } else if (mode === "allflats") {
        preferSharps = false;
      } else {
        preferSharps = getDirectionPreference(midiList, i, lastPreference);
        if (mode === "noteaware") {
          if (prevAccidental === "#") preferSharps = true;
          if (prevAccidental === "b") preferSharps = false;
        }
      }

      const spec = midiToNoteSpec(midi, preferSharps);
      lastPreference = preferSharps;
      prevAccidental = spec.acc ? spec.acc : null;
      return spec;
    });
  }

  function hasEdoMapping(modulus) {
    return !!EDO_SPELLINGS[modulus];
  }

  global.EdoNotation = {
    hasEdoMapping: hasEdoMapping,
    midiToNoteSpec: midiToNoteSpec,
    pcToEdoSpec: pcToEdoSpec,
    pcsToEdoNotes: pcsToEdoNotes,
    pcsToEdoNotesWithMidi: pcsToEdoNotesWithMidi,
    pcsToMidiNotes: pcsToMidiNotes,
    midiListToNoteSpecs: midiListToNoteSpecs
  };
})(window);
