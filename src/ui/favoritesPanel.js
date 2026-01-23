import { els, state, storageKeys } from "../state.js";
import { engineLabelForId } from "../core/placementLabels.js";

export function loadFavorites() {
  const stored = localStorage.getItem(storageKeys.favorites);
  if (!stored) {
    state.favorites = [];
    return;
  }
  try {
    const parsed = JSON.parse(stored);
    state.favorites = Array.isArray(parsed) ? parsed : [];
  } catch {
    state.favorites = [];
  }
}

export function saveFavorites() {
  localStorage.setItem(storageKeys.favorites, JSON.stringify(state.favorites));
}

export function captureFavoriteSnapshot(rec, capturePlacementParamValues) {
  const values = typeof capturePlacementParamValues === "function"
    ? capturePlacementParamValues()
    : {};
  return {
    intervals: els.intervals.value,
    O: state.activeO,
    perm: rec.perm,
    pitches: rec.pitches,
    placementMode: els.placementMode.value || "v2",
    placementParams: values,
    oddBias: state.oddBias.slice(),
    edo: els.edo.value,
    baseNote: els.baseNote.value,
    baseOctave: els.baseOctave.value,
    minO: els.minO.value,
    maxO: els.maxO.value,
    xSpacing: els.xSpacing.value,
    useDamping: els.useDamping.value
  };
}

export function favoriteKeyFromSnapshot(snapshot) {
  return JSON.stringify({
    intervals: snapshot.intervals,
    O: snapshot.O,
    perm: snapshot.perm,
    placementMode: snapshot.placementMode,
    placementParams: snapshot.placementParams,
    oddBias: snapshot.oddBias,
    edo: snapshot.edo,
    useDamping: snapshot.useDamping
  });
}

export function favoriteKey(rec) {
  const O = state.activeO;
  return `${els.intervals.value}|O${O}|${rec.perm.join(",")}|${rec.pitches.join(",")}`;
}

export function toggleFavorite(rec, capturePlacementParamValues) {
  const snapshot = captureFavoriteSnapshot(rec, capturePlacementParamValues);
  const key = favoriteKeyFromSnapshot(snapshot);
  const legacyKey = favoriteKey(rec);
  const idx = state.favorites.findIndex((f) => f.key === key || f.key === legacyKey);
  if (idx >= 0) {
    state.favorites.splice(idx, 1);
  } else {
    state.favorites.push({
      key,
      snapshot,
      intervals: els.intervals.value,
      O: state.activeO,
      perm: rec.perm,
      pitches: rec.pitches,
      total: rec.total,
      perPair: rec.perPair
    });
  }
  saveFavorites();
}

export function applyFavoriteSnapshot(snapshot, deps) {
  if (!snapshot) return;
  const { renderPlacementParams, saveInputs, recompute } = deps;
  els.intervals.value = snapshot.intervals || els.intervals.value;
  els.edo.value = snapshot.edo || els.edo.value;
  els.baseNote.value = snapshot.baseNote || els.baseNote.value;
  els.baseOctave.value = snapshot.baseOctave || els.baseOctave.value;
  els.minO.value = snapshot.minO || els.minO.value;
  els.maxO.value = snapshot.maxO || els.maxO.value;
  els.xSpacing.value = snapshot.xSpacing || els.xSpacing.value;
  els.useDamping.value = snapshot.useDamping || els.useDamping.value;
  els.placementMode.value = snapshot.placementMode || els.placementMode.value;
  if (typeof renderPlacementParams === "function") {
    renderPlacementParams(els.placementMode.value || "v2");
  }
  const paramValues = snapshot.placementParams || {};
  Object.entries(paramValues).forEach(([id, value]) => {
    const el = document.getElementById(id);
    if (!el) return;
    el.value = value;
  });
  if (Array.isArray(snapshot.oddBias)) {
    state.pendingOddBias = snapshot.oddBias.slice();
    localStorage.setItem(storageKeys.oddBias, JSON.stringify(snapshot.oddBias));
  }
  if (typeof saveInputs === "function") saveInputs();
  if (typeof recompute === "function") recompute();
}

export function captureCurrentSettingsSnapshot(capturePlacementParamValues) {
  const values = typeof capturePlacementParamValues === "function"
    ? capturePlacementParamValues()
    : {};
  return {
    intervals: els.intervals.value,
    O: state.activeO,
    perm: null,
    pitches: null,
    placementMode: els.placementMode.value || "v2",
    placementParams: values,
    oddBias: state.oddBias.slice(),
    edo: els.edo.value,
    baseNote: els.baseNote.value,
    baseOctave: els.baseOctave.value,
    minO: els.minO.value,
    maxO: els.maxO.value,
    xSpacing: els.xSpacing.value,
    useDamping: els.useDamping.value
  };
}

export function snapshotsDiffer(a, b) {
  if (!a || !b) return false;
  const keys = [
    "intervals",
    "placementMode",
    "edo",
    "useDamping"
  ];
  if (keys.some((key) => `${a[key]}` !== `${b[key]}`)) return true;
  const paramsA = { ...(a.placementParams || {}) };
  const paramsB = { ...(b.placementParams || {}) };
  delete paramsA.midiTailMs;
  delete paramsB.midiTailMs;
  const paramKeys = new Set([...Object.keys(paramsA), ...Object.keys(paramsB)]);
  for (const key of paramKeys) {
    if (`${paramsA[key]}` !== `${paramsB[key]}`) return true;
  }
  const biasA = Array.isArray(a.oddBias) ? a.oddBias.join("|") : "";
  const biasB = Array.isArray(b.oddBias) ? b.oddBias.join("|") : "";
  return biasA !== biasB;
}

export function openFavoritePrompt(message, handlers) {
  if (!els.favoritePrompt) return;
  els.favoritePromptText.textContent = message;
  state.favoritePromptHandlers = handlers;
  els.favoritePrompt.classList.remove("hidden");
}

export function closeFavoritePrompt() {
  if (!els.favoritePrompt) return;
  els.favoritePrompt.classList.add("hidden");
  state.favoritePromptHandlers = null;
}

export function finalizeFavoriteSelection(fav, targetO, render) {
  const recs = state.resultsByO[targetO] || [];
  const match = recs.find((r) => r.perm.join(" ") === fav.perm.join(" "));
  if (match) {
    state.activeO = targetO;
    state.selected = match;
    localStorage.setItem(storageKeys.activeO, targetO.toString());
    localStorage.setItem(storageKeys.selectedPerm, match.perm.join(" "));
    if (typeof render === "function") render();
  }
}

export function renderFavorites(deps) {
  const { capturePlacementParamValues, render, renderPlacementParams, saveInputs, recompute } = deps;
  els.favoritesList.innerHTML = "";
  if (!state.favorites.length) {
    els.favoritesList.textContent = "No favorites yet.";
    return;
  }
  const table = document.createElement("table");
  table.className = "favorites-table";
  table.innerHTML = `
    <thead>
      <tr>
        <th>Permutation</th>
        <th>Pitches</th>
        <th>O</th>
        <th>Tension</th>
        <th>Per pair</th>
        <th>Engine</th>
        <th>Select</th>
        <th>Remove</th>
      </tr>
    </thead>
    <tbody></tbody>
  `;
  const tbody = table.querySelector("tbody");
  state.favorites.forEach((fav) => {
    const row = document.createElement("tr");
    const total = typeof fav.total === "number" ? fav.total.toFixed(3) : "n/a";
    const perPair = typeof fav.perPair === "number" ? fav.perPair.toFixed(3) : "n/a";
    const engineLabel = fav.snapshot ? engineLabelForId(fav.snapshot.placementMode) : "";
    const btn = document.createElement("button");
    btn.textContent = "Select";
    btn.addEventListener("click", () => {
      const snapshot = fav.snapshot;
      if (snapshot) {
        const currentSnapshot = captureCurrentSettingsSnapshot(capturePlacementParamValues);
        const snapshotMode = snapshot.placementMode || "v2";
        if (snapshotsDiffer(currentSnapshot, snapshot)) {
          const message = `Favorite settings differ from current. (Engine: ${engineLabelForId(snapshotMode)}.) Choose how to load it.`;
          openFavoritePrompt(message, {
            onSwitch: () => {
              applyFavoriteSnapshot(snapshot, { renderPlacementParams, saveInputs, recompute });
              finalizeFavoriteSelection(fav, snapshot.O, render);
            },
            onImport: () => {
              els.intervals.value = snapshot.intervals || els.intervals.value;
              if (typeof saveInputs === "function") saveInputs();
              if (typeof recompute === "function") recompute();
              finalizeFavoriteSelection(fav, snapshot.O, render);
            },
            onCancel: () => {}
          });
          return;
        }
        applyFavoriteSnapshot(snapshot, { renderPlacementParams, saveInputs, recompute });
        finalizeFavoriteSelection(fav, snapshot.O, render);
        return;
      }
      finalizeFavoriteSelection(fav, fav.O, render);
    });
    const removeBtn = document.createElement("button");
    removeBtn.textContent = "Remove";
    removeBtn.className = "ghost";
    removeBtn.addEventListener("click", () => {
      const idx = state.favorites.findIndex((f) => f.key === fav.key);
      if (idx >= 0) {
        state.favorites.splice(idx, 1);
        saveFavorites();
        renderFavorites(deps);
      }
    });
    const cells = [
      fav.perm.join(" "),
      fav.pitches.join(" "),
      `O${fav.O}`,
      total,
      perPair,
      engineLabel || "-"
    ];
    cells.forEach((text) => {
      const td = document.createElement("td");
      td.textContent = text;
      row.appendChild(td);
    });
    const selectTd = document.createElement("td");
    selectTd.appendChild(btn);
    row.appendChild(selectTd);
    const removeTd = document.createElement("td");
    removeTd.appendChild(removeBtn);
    row.appendChild(removeTd);
    tbody.appendChild(row);
  });
  els.favoritesList.appendChild(table);
}

export function bindFavoritePromptButtons() {
  if (els.favoriteSwitchBtn) {
    els.favoriteSwitchBtn.addEventListener("click", () => {
      const handlers = state.favoritePromptHandlers;
      closeFavoritePrompt();
      if (handlers && handlers.onSwitch) handlers.onSwitch();
    });
  }
  if (els.favoriteImportBtn) {
    els.favoriteImportBtn.addEventListener("click", () => {
      const handlers = state.favoritePromptHandlers;
      closeFavoritePrompt();
      if (handlers && handlers.onImport) handlers.onImport();
    });
  }
  if (els.favoriteCancelBtn) {
    els.favoriteCancelBtn.addEventListener("click", () => {
      const handlers = state.favoritePromptHandlers;
      closeFavoritePrompt();
      if (handlers && handlers.onCancel) handlers.onCancel();
    });
  }
}
