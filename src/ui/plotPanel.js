// Purpose: plotPanel.js provides exports: drawPlotOnCanvas, renderCounts, renderIntervals, renderPlot, setHoverPitch... (+2 more).
// Interacts with: imports: ../core/activePlacement.js, ../core/intervalMath.js, ../core/visuals.js, ../state.js, ./keyboardFretboard.js.
// Role: UI layer module within the broader app graph.
import { els, state } from "../state.js";
import { dyadPenaltyDetails, pitchesFromEndpoints } from "../core/intervalMath.js";
import { hueForInterval, intervalLightness, intervalColor } from "../core/visuals.js";
import { renderKeyboard, renderFretboard } from "./keyboardFretboard.js";
import { getFocusedIntervalPlacementRecord } from "../core/activePlacement.js";

const TEXT_FONT = "12px 'Figtree', 'Segoe UI', sans-serif";

function quantizedSplit(length, rho, oddBias) {
  const eps = 1e-9;
  const downIdeal = rho * length;
  let down;
  if (length % 2 === 0) {
    down = Math.round(downIdeal);
  } else {
    down = oddBias === "up"
      ? Math.floor(downIdeal + eps)
      : Math.ceil(downIdeal - eps);
  }
  down = Math.max(0, Math.min(length, down));
  return { down, up: length - down };
}

function quantizeInterval(anchor, length, rho, oddBias) {
  const A = Math.floor(anchor);
  const { down, up } = quantizedSplit(length, rho, oddBias);
  const low = A - down;
  const high = A + up;
  return { A, low, high, down, up };
}

function anchorsForPerm(L, perm, params) {
  const n = perm.length;
  const rho = params.anchorRho;
  const alpha = params.anchorAlpha;
  const beta = params.anchorBeta;
  const splits = perm.map((d, idx) => quantizedSplit(d, rho, state.oddBias[idx]));
  const amin = Math.max(...splits.map((s) => s.down));
  const amax = L - Math.max(...splits.map((s) => s.up));
  if (!Number.isFinite(amin) || !Number.isFinite(amax) || amin > amax) {
    return null;
  }
  if (n === 1) {
    const a = amin;
    return {
      anchorFloats: [a],
      anchors: [Math.floor(a)],
      splits,
      slack: [L - perm[0]],
      weights: [1],
      prefixSums: [0],
      prefixFractions: [0],
      totalWeight: 1,
      amin,
      amax
    };
  }
  const span = amax - amin;
  const slack = perm.map((d) => L - d);
  const weights = slack.map((s) => Math.pow(s, beta));
  const totalWeight = weights.reduce((sum, w) => sum + w, 0) || 1;
  let prefix = 0;
  const eps = 1e-9;
  const prefixFractions = [];
  const prefixSums = [];
  const anchorFloats = perm.map((d, idx) => {
    const t = idx / (n - 1);
    const u = prefix / totalWeight;
    const a0 = amin + t * span;
    const a1 = amin + u * span;
    const a = (1 - alpha) * a0 + alpha * a1;
    prefix += weights[idx];
    void d;
    prefixSums.push(prefix - weights[idx]);
    prefixFractions.push(u);
    return Math.min(amax, Math.max(amin, a));
  });
  const anchors = anchorFloats.map((a) => Math.max(amin, Math.min(amax, Math.floor(a + eps))));
  return {
    anchorFloats,
    anchors,
    splits,
    slack,
    weights,
    prefixSums,
    prefixFractions,
    totalWeight,
    amin,
    amax
  };
}

function endpointsListFromEndpoints(endpoints) {
  return endpoints.flat().sort((a, b) => a - b);
}

function betaZeroPitchesForPerm(perm, params, L) {
  const anchorData = anchorsForPerm(L, perm, { ...params, anchorBeta: 0 });
  if (!anchorData) return null;
  const endpoints = anchorData.anchorFloats.map((a, idx) => {
    const d = perm[idx];
    const bias = state.oddBias[idx];
    const { low, high } = quantizeInterval(a, d, params.anchorRho, bias);
    return [low, high];
  });
  return {
    pitches: pitchesFromEndpoints(endpoints),
    endpointList: endpointsListFromEndpoints(endpoints)
  };
}

function alphaZeroPitchesForPerm(perm, params, L) {
  const anchorData = anchorsForPerm(L, perm, { ...params, anchorAlpha: 0 });
  if (!anchorData) return null;
  const endpoints = anchorData.anchorFloats.map((a, idx) => {
    const d = perm[idx];
    const bias = state.oddBias[idx];
    const { low, high } = quantizeInterval(a, d, params.anchorRho, bias);
    return [low, high];
  });
  return {
    pitches: pitchesFromEndpoints(endpoints),
    endpointList: endpointsListFromEndpoints(endpoints)
  };
}

export function renderCounts(inducedCounts) {
  const maxPerLine = 8;
  const parts = inducedCounts.map(([d, c]) => (
    `<span class="count-item" data-interval="${d}" data-total="${c}">${d}(${c})</span>`
  ));
  const rows = [];
  for (let i = 0; i < parts.length; i += maxPerLine) {
    rows.push(parts.slice(i, i + maxPerLine));
  }
  return rows.map((row) => `<div class="metric-row">${row.join("")}</div>`).join("");
}

export function renderIntervals(intervals, L, edoSteps, iv = []) {
  if (!Number.isFinite(L) || L <= 0 || !Number.isFinite(edoSteps) || edoSteps <= 0) return "";
  const counts = {};
  intervals.forEach((d) => {
    counts[d] = (counts[d] || 0) + 1;
  });
  const baseBorder = (d, alpha = 0.22) => {
    const hue = hueForInterval(d, edoSteps);
    const lightness = intervalLightness(d, edoSteps);
    return `hsla(${hue}, 55%, ${lightness}%, ${alpha})`;
  };
  if (edoSteps >= 32) {
    const rows = [];
    let current = [];
    for (let d = 1; d <= L; d++) {
      const total = counts[d] || 0;
      const isActive = total > 0;
      const itemClass = isActive ? "interval-item" : "interval-item inactive";
      const itemStyle = isActive
        ? ` style="border-color: ${baseBorder(d)};"`
        : "";
      const baseAttr = isActive
        ? ` data-base-border="${baseBorder(d)}"`
        : "";
      const countLabel = isActive ? ` <span class="interval-count">(${total})</span>` : "";
      current.push(
        `<span class="${itemClass}" data-interval="${d}" data-total="${total}"${baseAttr}${itemStyle}>${d}${countLabel}</span>`
      );
      if (current.length === 10) {
        rows.push(
          `<div class="metric-row interval-row" style="grid-template-columns: repeat(10, minmax(0, 1fr));">${current.join("")}</div>`
        );
        current = [];
      }
    }
    if (current.length) {
      rows.push(
        `<div class="metric-row interval-row" style="grid-template-columns: repeat(10, minmax(0, 1fr));">${current.join("")}</div>`
      );
    }
    const ivText = iv.length ? `<div class="interval-iv-line">IV: ${iv.join(" ")}</div>` : "";
    return `${ivText}${rows.join("")}`;
  }
  const columns = [];
  const modulus = Math.max(1, Math.round(edoSteps));
  const maxBase = Math.floor(modulus / 2);
  for (let base = 1; base <= maxBase; base++) {
    const comp = (modulus - base) % modulus;
    const column = [];
    for (let d = 1; d <= L; d++) {
      const mod = ((d % modulus) + modulus) % modulus;
      if (mod === base || (comp !== base && mod === comp)) {
        column.push(d);
      }
    }
    columns.push(column);
  }
  const maxRows = Math.max(0, ...columns.map((col) => col.length));
  const rows = [];
  const headerCells = [];
  for (let base = 1; base <= maxBase; base++) {
    const count = Number.isFinite(iv[base - 1]) ? iv[base - 1] : 0;
      const headerStyle = ` style="border-bottom-color: ${baseBorder(base, 0.65)};"`;
    headerCells.push(
      `<span class="interval-header-item"${headerStyle}>ic${base} <span class="interval-count">(${count})</span></span>`
    );
  }
  if (headerCells.length) {
    rows.push(
      `<div class="metric-row interval-row interval-header" style="grid-template-columns: repeat(${columns.length}, minmax(0, 1fr));">${headerCells.join("")}</div>`
    );
  }
  for (let r = 0; r < maxRows; r++) {
    const items = [];
    for (let c = 0; c < columns.length; c++) {
      const d = columns[c][r];
      if (d === undefined) {
        items.push("<span class=\"interval-spacer\"></span>");
        continue;
      }
      const total = counts[d] || 0;
      const isActive = total > 0;
      const itemClass = isActive ? "interval-item" : "interval-item inactive";
      const itemStyle = isActive
        ? ` style="border-color: ${baseBorder(d)};"`
        : "";
      const baseAttr = isActive
        ? ` data-base-border="${baseBorder(d)}"`
        : "";
      const countLabel = isActive ? ` <span class="interval-count">(${total})</span>` : "";
      items.push(
        `<span class="${itemClass}" data-interval="${d}" data-total="${total}"${baseAttr}${itemStyle}>${d}${countLabel}</span>`
      );
    }
    rows.push(
      `<div class="metric-row interval-row" style="grid-template-columns: repeat(${columns.length}, minmax(0, 1fr));">${items.join("")}</div>`
    );
  }
  return rows.join("");
}

function getActiveIntervalPlacementRecord() {
  const focused = getFocusedIntervalPlacementRecord();
  if (focused) return focused;
  return state.selected || (state.resultsByO[state.activeO] || [])[0];
}

function intervalCountsFromPitch(pitches, pitch) {
  const counts = new Map();
  pitches.forEach((p) => {
    if (p === pitch) return;
    const d = Math.abs(p - pitch);
    counts.set(d, (counts.get(d) || 0) + 1);
  });
  return counts;
}

function clearCountHighlights() {
  const intervalEls = Array.from(document.querySelectorAll(".interval-item"));
  intervalEls.forEach((el) => {
    el.classList.remove("hover-count");
    el.classList.remove("highlight");
    el.classList.remove("partial");
    el.removeAttribute("data-hover");
    el.style.removeProperty("--hover-hue");
    el.style.removeProperty("color");
    const baseBorder = el.dataset.baseBorder;
    if (baseBorder) {
      el.style.borderColor = baseBorder;
    } else {
      el.style.removeProperty("border-color");
    }
  });
}

function highlightCounts(countMap) {
  const counts = Array.from(countMap.entries());
  const intervalEls = Array.from(document.querySelectorAll(".interval-item"));
  const countLookup = new Map(counts);
  intervalEls.forEach((el) => {
    const d = parseInt(el.dataset.interval, 10);
    const localCount = countLookup.get(d) || 0;
    const totalCount = parseInt(el.dataset.total, 10) || 0;
    if (localCount > 0) {
      el.classList.add("highlight");
      el.classList.add("hover-count");
      el.style.color = intervalColor(d, state.params.edoSteps);
      el.style.borderColor = intervalColor(d, state.params.edoSteps);
      el.dataset.hover = `${localCount}`;
      el.style.setProperty("--hover-hue", hueForInterval(d, state.params.edoSteps));
      if (localCount < totalCount) {
        el.classList.add("partial");
      } else {
        el.classList.remove("partial");
      }
    } else {
      el.classList.remove("highlight");
      el.classList.remove("hover-count");
      el.classList.remove("partial");
      el.removeAttribute("data-hover");
      el.style.removeProperty("--hover-hue");
      el.style.removeProperty("color");
      const baseBorder = el.dataset.baseBorder;
      if (baseBorder) {
        el.style.borderColor = baseBorder;
      } else {
        el.style.removeProperty("border-color");
      }
    }
  });
}

function updatePitchHighlights() {
  const pitchEls = Array.from(document.querySelectorAll(".pitch-item, .pitch-name, .pitch-pc"));
  pitchEls.forEach((el) => {
    const pitch = parseInt(el.dataset.pitch, 10);
    if (pitch === state.hoverPitch) {
      el.classList.add("pitch-highlight");
    } else {
      el.classList.remove("pitch-highlight");
    }
  });
}

export function updateHoverCountsLine(countMap) {
  const line = document.getElementById("hoverCountsLine");
  if (!line) return;
  if (!countMap || countMap.size === 0) {
    line.textContent = "hover counts: --";
    return;
  }
  const parts = Array.from(countMap.entries())
    .sort((a, b) => a[0] - b[0])
    .map(([d, c]) => `${d}(${c})`);
  line.textContent = `hover counts: ${parts.join(" ")}`;
}

export function updateHoverInfo() {
  const rec = getActiveIntervalPlacementRecord();
  if (!rec || state.hoverPitch === null) {
    els.hoverInfo.textContent = "Hover a pitch to see dyad details.";
    return;
  }
  const L = state.activeO * state.params.edoSteps;
  const base = state.hoverPitch;
  const rows = rec.pitches
    .filter((p) => p !== base)
    .map((p) => {
      const lo = Math.min(base, p);
      const hi = Math.max(base, p);
      const { g, dSteps } = dyadPenaltyDetails(lo, hi, state.params, L);
      const gScaled = state.gRef ? (g / state.gRef) * 100 : g * 100;
      return { other: p, dSteps, g, gScaled };
    })
    .sort((a, b) => a.dSteps - b.dSteps);
  const lines = rows.map(
    (row) =>
      `p=${base} -> ${row.other}  <span class="d-tag" style="color: ${intervalColor(row.dSteps, state.params.edoSteps)}">d=${row.dSteps}</span>  g=${row.g.toFixed(2)}  g*=${row.gScaled.toFixed(2)}`
  );
  els.hoverInfo.innerHTML = lines.join("<br>");
}

export function drawPlotOnCanvas(canvas, rec, options = {}) {
  if (!canvas) return;
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  if (!rec) {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    return;
  }
  const wrap = canvas.parentElement;
  const targetWidth = typeof options.targetWidth === "number"
    ? options.targetWidth
    : (wrap ? Math.max(320, wrap.clientWidth - 24) : canvas.width || 0);
  const targetHeight = typeof options.targetHeight === "number"
    ? options.targetHeight
    : 560;
  if (!canvas.height || canvas.height !== targetHeight) {
    canvas.height = targetHeight;
  }
  canvas.style.height = `${canvas.height}px`;
  if (canvas.width !== targetWidth) {
    canvas.width = targetWidth;
  }

  const O = state.activeO;
  const L = O * state.params.edoSteps;
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  const pad = 48;
  const width = canvas.width - pad * 2;
  const height = canvas.height - pad * 2;
  const intervalCols = rec.endpoints.length;
  const quarter = width / 4;
  const intervalWidth = quarter;
  const intervalLeft = pad;
  const auxLeft = pad + 2 * quarter;
  const compositeX = pad + 3 * quarter;
  const updateHoverPoints = options.updateHoverPoints !== false;
  const hoverPoints = updateHoverPoints ? [] : null;

  function yToPx(y) {
    return canvas.height - pad - (y / L) * height;
  }

  function xIntervalToPx(i) {
    if (intervalCols <= 0) return intervalLeft + intervalWidth / 2;
    const span = intervalWidth / (intervalCols + 1);
    return intervalLeft + (i + 1) * span;
  }

  ctx.lineWidth = 1;
  ctx.strokeStyle = "rgba(0,0,0,0.15)";
  for (let y = 0; y <= L; y++) {
    const px = yToPx(y);
    ctx.beginPath();
    ctx.moveTo(pad, px);
    ctx.lineTo(canvas.width - pad, px);
    ctx.stroke();
  }

  ctx.lineWidth = 1.2;
  ctx.strokeStyle = "rgba(0,0,0,0.35)";
  for (let y = 0; y <= L; y += state.params.edoSteps) {
    const px = yToPx(y);
    ctx.beginPath();
    ctx.moveTo(pad, px);
    ctx.lineTo(canvas.width - pad, px);
    ctx.stroke();
  }

  if (rec.anchorRange) {
    const top = yToPx(rec.anchorRange.amax);
    const bottom = yToPx(rec.anchorRange.amin);
    const bandY = Math.min(top, bottom);
    const bandH = Math.abs(bottom - top);
    ctx.save();
    ctx.fillStyle = "rgba(15, 76, 92, 0.08)";
    ctx.fillRect(pad, bandY, canvas.width - pad * 2, bandH);
    ctx.restore();
  }

  ctx.fillStyle = "#1b1b1b";
  ctx.font = TEXT_FONT;
  if (hoverPoints) {
    hoverPoints.length = 0;
  }
  rec.endpoints.forEach(([lo, hi], idx) => {
    const x = xIntervalToPx(idx);
    ctx.strokeStyle = "#1b1b1b";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(x, yToPx(lo));
    ctx.lineTo(x, yToPx(hi));
    ctx.stroke();

    const a = rec.anchors[idx];
    ctx.beginPath();
    ctx.arc(x, yToPx(lo), 3.5, 0, Math.PI * 2);
    ctx.fill();
    if (hoverPoints) hoverPoints.push({ pitch: lo, x, y: yToPx(lo), type: "endpoint" });
    ctx.beginPath();
    ctx.arc(x, yToPx(hi), 3.5, 0, Math.PI * 2);
    ctx.fill();
    if (hoverPoints) hoverPoints.push({ pitch: hi, x, y: yToPx(hi), type: "endpoint" });
    ctx.save();
    ctx.globalAlpha = 0.3;
    ctx.beginPath();
    ctx.arc(x, yToPx(a), 4, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
    const aFloat = rec.anchorFloats ? rec.anchorFloats[idx] : a;
    ctx.save();
    ctx.strokeStyle = "rgba(15, 76, 92, 0.8)";
    ctx.lineWidth = 1.4;
    ctx.beginPath();
    ctx.arc(x, yToPx(aFloat), 5, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
    ctx.fillText(`a=${a}`, x + 6, yToPx(a) + 4);
    ctx.fillText(`lo=${lo}`, x + 6, yToPx(lo) + 12);
    ctx.fillText(`hi=${hi}`, x + 6, yToPx(hi) - 4);
  });

  const xAll = compositeX;
  const xAlpha = auxLeft + quarter / 3;
  const xBeta = auxLeft + (2 * quarter) / 3;
  const pitchPoints = rec.pitches.map((p) => ({
    pitch: p,
    x: xAll,
    y: yToPx(p)
  }));
  if (hoverPoints) {
    hoverPoints.push(...pitchPoints);
    state.hoverPoints = hoverPoints;
  }
  ctx.save();
  ctx.setLineDash([4, 4]);
  ctx.strokeStyle = "rgba(0,0,0,0.35)";
  rec.endpoints.forEach(([lo, hi], idx) => {
    const x = xIntervalToPx(idx);
    [lo, hi].forEach((p) => {
      const y = yToPx(p);
      ctx.beginPath();
      ctx.moveTo(xAll, y);
      ctx.lineTo(x, y);
      ctx.stroke();
    });
  });
  ctx.restore();

  rec.pitches.forEach((p) => {
    ctx.beginPath();
    ctx.arc(xAll, yToPx(p), 3.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillText(`${p}`, xAll + 6, yToPx(p) + 4);
  });

  if (state.hoverPitch !== null) {
    const y = yToPx(state.hoverPitch);
    ctx.save();
    ctx.fillStyle = "rgba(255, 210, 0, 0.35)";
    ctx.strokeStyle = "rgba(255, 180, 0, 0.6)";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(xAll, y, 6, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.restore();
  }

  if (state.params.placementMode === "v2" && state.hoverPitch !== null) {
    const betaZeroData = betaZeroPitchesForPerm(rec.perm, state.params, L);
    if (betaZeroData) {
      const compositeList = endpointsListFromEndpoints(rec.endpoints);
      ctx.save();
      ctx.fillStyle = "rgba(15, 76, 92, 0.8)";
      ctx.strokeStyle = "rgba(15, 76, 92, 0.6)";
      ctx.lineWidth = 1;
      ctx.font = TEXT_FONT;
      betaZeroData.pitches.forEach((p) => {
        ctx.beginPath();
        ctx.arc(xBeta, yToPx(p), 3, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
        const label = `${p}`;
        const metrics = ctx.measureText(label);
        ctx.fillText(label, xBeta - metrics.width - 6, yToPx(p) + 3);
      });
      const betaSorted = betaZeroData.endpointList;
      const compSorted = compositeList;
      const count = Math.min(betaSorted.length, compSorted.length);
      ctx.strokeStyle = "rgba(200, 40, 40, 0.6)";
      ctx.lineWidth = 1.2;
      for (let i = 0; i < count; i++) {
        const yFrom = yToPx(betaSorted[i]);
        const yTo = yToPx(compSorted[i]);
        ctx.beginPath();
        ctx.moveTo(xBeta + 3, yFrom);
        ctx.lineTo(xAll - 3, yTo);
        ctx.stroke();
      }
      ctx.font = TEXT_FONT;
      const label = "beta=0";
      const metrics = ctx.measureText(label);
      const labelPaddingX = 6;
      const labelPaddingY = 4;
      const labelWidth = metrics.width + labelPaddingX * 2;
      const labelHeight = 16 + labelPaddingY;
      const labelX = xBeta - labelWidth / 2;
      const labelY = pad - labelHeight - 8;
      ctx.fillStyle = "rgba(255, 255, 255, 0.85)";
      ctx.fillRect(labelX, labelY, labelWidth, labelHeight);
      ctx.strokeStyle = "rgba(15, 76, 92, 0.6)";
      ctx.strokeRect(labelX, labelY, labelWidth, labelHeight);
      ctx.fillStyle = "rgba(15, 76, 92, 0.9)";
      ctx.fillText(label, labelX + labelPaddingX, labelY + labelHeight - 6);
      ctx.restore();
    }

    const alphaZeroData = alphaZeroPitchesForPerm(rec.perm, state.params, L);
    if (alphaZeroData) {
      const compositeList = endpointsListFromEndpoints(rec.endpoints);
      ctx.save();
      ctx.fillStyle = "rgba(40, 80, 200, 0.8)";
      ctx.strokeStyle = "rgba(40, 80, 200, 0.6)";
      ctx.lineWidth = 1;
      ctx.font = TEXT_FONT;
      alphaZeroData.pitches.forEach((p) => {
        ctx.beginPath();
        ctx.arc(xAlpha, yToPx(p), 3, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
        const label = `${p}`;
        const metrics = ctx.measureText(label);
        ctx.fillText(label, xAlpha - metrics.width - 6, yToPx(p) + 3);
      });
      const alphaSorted = alphaZeroData.endpointList;
      const compSorted = compositeList;
      const count = Math.min(alphaSorted.length, compSorted.length);
      ctx.strokeStyle = "rgba(40, 80, 200, 0.6)";
      ctx.lineWidth = 1.2;
      for (let i = 0; i < count; i++) {
        const yFrom = yToPx(alphaSorted[i]);
        const yTo = yToPx(compSorted[i]);
        ctx.beginPath();
        ctx.moveTo(xAlpha + 3, yFrom);
        ctx.lineTo(xAll - 3, yTo);
        ctx.stroke();
      }
      ctx.font = TEXT_FONT;
      const label = "alpha=0";
      const metrics = ctx.measureText(label);
      const labelPaddingX = 6;
      const labelPaddingY = 4;
      const labelWidth = metrics.width + labelPaddingX * 2;
      const labelHeight = 16 + labelPaddingY;
      const labelX = xAlpha - labelWidth / 2;
      const labelY = pad - labelHeight - 8;
      ctx.fillStyle = "rgba(255, 255, 255, 0.85)";
      ctx.fillRect(labelX, labelY, labelWidth, labelHeight);
      ctx.strokeStyle = "rgba(40, 80, 200, 0.6)";
      ctx.strokeRect(labelX, labelY, labelWidth, labelHeight);
      ctx.fillStyle = "rgba(40, 80, 200, 0.9)";
      ctx.fillText(label, labelX + labelPaddingX, labelY + labelHeight - 6);
      ctx.restore();
    }
  }

  if (state.hoverPitch !== null) {
    const baseIndex = rec.pitches.indexOf(state.hoverPitch);
    const spineBase = xAll + 20;
    const upItems = rec.pitches
      .filter((p) => p > state.hoverPitch)
      .map((p) => ({ p, interval: Math.abs(p - state.hoverPitch) }))
      .sort((a, b) => a.interval - b.interval);
    const downItems = rec.pitches
      .filter((p) => p < state.hoverPitch)
      .map((p) => ({ p, interval: Math.abs(p - state.hoverPitch) }))
      .sort((a, b) => a.interval - b.interval);
    state.hoverWindowL = L || 1;
    const spineStep = 15;
    const drawSet = (items) => {
      items.forEach((item, idx) => {
        const p = item.p;
        const y1 = yToPx(state.hoverPitch);
        const y2 = yToPx(p);
        const dx = idx * spineStep;
        const hue = hueForInterval(item.interval, state.params.edoSteps);
        const lightness = intervalLightness(item.interval, state.params.edoSteps);
        ctx.strokeStyle = `hsla(${hue}, 60%, ${lightness}%, 0.85)`;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(xAll, y2);
        ctx.lineTo(spineBase + dx, y2);
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(spineBase + dx, y1);
        ctx.lineTo(spineBase + dx, y2);
        ctx.stroke();

        const midY = (y1 + y2) / 2;
        const label = `${item.interval}`;
        const labelX = spineBase + dx;
        const labelY = midY;
        ctx.font = TEXT_FONT;
        const metrics = ctx.measureText(label);
        const paddingX = 4;
        const paddingY = 4;
        const boxW = metrics.width + paddingX * 2;
        const boxH = 16 + paddingY;
        ctx.fillStyle = "rgba(255, 255, 255, 0.85)";
        ctx.fillRect(labelX - boxW / 2, labelY - boxH / 2, boxW, boxH);
        ctx.strokeStyle = `hsla(${hue}, 60%, ${lightness}%, 0.85)`;
        ctx.lineWidth = 1.5;
        ctx.strokeRect(labelX - boxW / 2, labelY - boxH / 2, boxW, boxH);
        ctx.fillStyle = `hsla(${hue}, 60%, ${Math.max(20, lightness - 10)}%, 0.95)`;
        ctx.fillText(label, labelX - metrics.width / 2, labelY + 4);
      });
    };

    drawSet(upItems);
    drawSet(downItems);
    void baseIndex;
    ctx.fillStyle = "#1b1b1b";
  } else {
    state.hoverWindowL = null;
  }
}

export function renderPlot() {
  drawPlotOnCanvas(els.plot, getActiveIntervalPlacementRecord(), { updateHoverPoints: true });
}

export function setHoverPitch(pitch) {
  if (pitch === null) {
    if (state.hoverPitch !== null) {
      state.hoverPitch = null;
      clearCountHighlights();
      updatePitchHighlights();
      renderPlot();
      updateHoverInfo();
      updateHoverCountsLine(null);
      renderKeyboard();
      renderFretboard();
    }
    return;
  }
  if (pitch !== state.hoverPitch) {
    state.hoverPitch = pitch;
    state.hoverWindowL = state.activeO * state.params.edoSteps;
    const rec = getActiveIntervalPlacementRecord();
    if (rec) {
      const counts = intervalCountsFromPitch(rec.pitches, pitch);
      highlightCounts(counts);
      updateHoverCountsLine(counts);
    }
    updatePitchHighlights();
    renderPlot();
    updateHoverInfo();
    renderKeyboard();
    renderFretboard();
  }
}
