const RATIO_TARGETS = [
  [1, 1],           // unison
  [9, 8], [16, 15], // seconds
  [5, 4], [6, 5],   // thirds
  [4, 3], [3, 2],   // fourth/fifth
  [8, 5], [5, 3],   // sixths
  [16, 9], [15, 8], // sevenths
  [2, 1],           // octave
  [45, 32]          // tritone proxy
];

const defaultParams = {
  N: 12,
  k: 1.6,
  m: 0.55,
  sigma_cents: 20.0,
  lam: 0.20,
  alpha: 0.0,
  f_ref_hz: 55.0,
  K: 12,
  amp_power: 1.0,
  rough_a: 3.5,
  rough_b: 5.75
};

function hueForInterval(interval, windowL) {
  const L = windowL || 1;
  const halfMax = Math.max(1, Math.ceil(L / 2));
  const baseIndex = Math.floor(interval / 2);
  const baseHue = (baseIndex / halfMax) * 180;
  const hue = baseHue + (interval % 2 === 1 ? 180 : 0);
  return (hue + 240) % 360;
}

function intervalColor(interval) {
  const maxInterval = state.hoverWindowL || interval || 1;
  const hue = hueForInterval(interval, maxInterval);
  return `hsl(${hue}, 60%, 45%)`;
}

const state = {
  resultsByO: {},
  activeO: null,
  selected: null,
  anchorsByO: {},
  params: { ...defaultParams },
  hoverPitch: null,
  hoverPoints: [],
  hoverWindowL: null,
  gRef: null,
  oddBias: [],
  favorites: []
};

const els = {
  intervals: document.getElementById("intervals"),
  edo: document.getElementById("edo"),
  baseNote: document.getElementById("baseNote"),
  baseOctave: document.getElementById("baseOctave"),
  minO: document.getElementById("minO"),
  maxO: document.getElementById("maxO"),
  xSpacing: document.getElementById("xSpacing"),
  runBtn: document.getElementById("runBtn"),
  status: document.getElementById("status"),
  tabBar: document.getElementById("tabBar"),
  plot: document.getElementById("plot"),
  selectedInfo: document.getElementById("selectedInfo"),
  hoverInfo: document.getElementById("hoverInfo"),
  resultsTable: document.getElementById("resultsTable"),
  filter: document.getElementById("filter"),
  useDamping: document.getElementById("useDamping"),
  oddBias: document.getElementById("oddBias"),
  favoritesList: document.getElementById("favoritesList"),
  anchorSummary: document.getElementById("anchorSummary"),
  midiOut: document.getElementById("midiOut"),
  midiPreview: document.getElementById("midiPreview")
};

let midiAccess = null;
let midiOutputs = [];

const storageKeys = {
  intervals: "intervalApplet.intervals",
  edo: "intervalApplet.edo",
  baseNote: "intervalApplet.baseNote",
  baseOctave: "intervalApplet.baseOctave",
  minO: "intervalApplet.minO",
  maxO: "intervalApplet.maxO",
  xSpacing: "intervalApplet.xSpacing",
  useDamping: "intervalApplet.useDamping",
  oddBias: "intervalApplet.oddBias",
  favorites: "intervalApplet.favorites",
  activeO: "intervalApplet.activeO",
  filter: "intervalApplet.filter",
  midiOut: "intervalApplet.midiOut",
  selectedPerm: "intervalApplet.selectedPerm"
};

function parseIntervals(text) {
  return text
    .split(/[,\s]+/)
    .map((v) => parseInt(v, 10))
    .filter((v) => Number.isFinite(v));
}

function lowBiasSplit(length) {
  const down = Math.floor((length + 1) / 2);
  const up = length - down;
  return [down, up];
}

function biasedSplit(length, flipOdd) {
  const [down, up] = lowBiasSplit(length);
  if (length % 2 === 1 && flipOdd) {
    return [up, down];
  }
  return [down, up];
}

function safeAnchorRange(L, intervals) {
  const downs = [];
  const ups = [];
  intervals.forEach((l) => {
    const [down, up] = lowBiasSplit(l);
    downs.push(down);
    ups.push(up);
  });
  const amin = Math.max(...downs);
  const amax = L - Math.max(...ups);
  return [amin, amax];
}

function equalSpacedAnchors(amin, amax, n) {
  if (n <= 0) return [];
  if (n === 1) return [amin];
  const span = amax - amin;
  const gaps = n - 1;
  const base = Math.floor(span / gaps);
  const rem = span % gaps;
  const increments = [];
  for (let i = 0; i < gaps; i++) {
    increments.push(i < rem ? base + 1 : base);
  }
  const anchors = [amin];
  increments.forEach((inc) => anchors.push(anchors[anchors.length - 1] + inc));
  return anchors;
}

function endpointsForPerm(anchors, perm) {
  return anchors.map((a, idx) => {
    const l = perm[idx];
    const flipOdd = state.oddBias[idx] === "up";
    const [down, up] = biasedSplit(l, flipOdd);
    return [a - down, a + up];
  });
}

function pitchesFromEndpoints(endpoints) {
  const s = new Set();
  endpoints.forEach(([lo, hi]) => {
    s.add(lo);
    s.add(hi);
  });
  return Array.from(s).sort((a, b) => a - b);
}

function inducedIntervals(pitches) {
  const out = [];
  for (let i = 0; i < pitches.length; i++) {
    for (let j = i + 1; j < pitches.length; j++) {
      out.push(pitches[j] - pitches[i]);
    }
  }
  return out.sort((a, b) => a - b);
}

function ratioCost(cents, sigma, lam) {
  let best = Number.POSITIVE_INFINITY;
  let bestRatio = [1, 1];
  let bestHeight = 0;
  for (const [n, d] of RATIO_TARGETS) {
    const target = 1200 * Math.log2(n / d);
    const height = Math.log2(n * d);
    const cost = Math.pow(Math.abs(cents - target) / sigma, 2) + lam * height;
    if (cost < best) {
      best = cost;
      bestRatio = [n, d];
      bestHeight = height;
    }
  }
  return { cost: best, ratio: bestRatio, height: bestHeight };
}

function registerDamping(lo, L, k) {
  if (state.params.useDamping) {
    return Math.exp(-k * (lo / L));
  }
  return 1;
}

function compoundRelief(dSteps, N, m) {
  return Math.exp(-m * Math.floor(dSteps / N));
}

function f0FromLo(lo, N, fRefHz) {
  return fRefHz * Math.pow(2, lo / N);
}

const roughCache = new Map();

function roughnessKharm(cents, f0Hz, K, ampPower, a, b) {
  const key = `${cents.toFixed(3)}|${f0Hz.toFixed(3)}|${K}|${ampPower}|${a}|${b}`;
  if (roughCache.has(key)) return roughCache.get(key);
  const r = Math.pow(2, cents / 1200);
  let total = 0;
  for (let i = 1; i <= K; i++) {
    const fi = i * f0Hz;
    const ai = 1 / Math.pow(i, ampPower);
    for (let j = 1; j <= K; j++) {
      const gj = j * (r * f0Hz);
      const aj = 1 / Math.pow(j, ampPower);
      const df = Math.abs(fi - gj);
      const fbar = 0.5 * (fi + gj);
      const bandwidth = 1.72 * Math.pow(fbar, 0.65);
      const x = bandwidth > 0 ? df / bandwidth : 0;
      const phi = Math.exp(-a * x) - Math.exp(-b * x);
      total += ai * aj * phi;
    }
  }
  roughCache.set(key, total);
  return total;
}

function calibrateAlpha(params, gamma) {
  const L = params.N * 3;
  const lo = Math.floor(L / 4);
  const f0Hz = f0FromLo(lo, params.N, params.f_ref_hz);
  const ratioVals = [];
  const roughVals = [];
  for (let dMod = 1; dMod < params.N; dMod++) {
    const cents = 1200 * (dMod / params.N);
    const { cost } = ratioCost(cents, params.sigma_cents, params.lam);
    const rough = roughnessKharm(
      cents,
      f0Hz,
      params.K,
      params.amp_power,
      params.rough_a,
      params.rough_b
    );
    ratioVals.push(cost);
    roughVals.push(rough);
  }
  const medRatio = median(ratioVals);
  const medRough = median(roughVals);
  if (medRough === 0) return 0;
  return gamma * (medRatio / medRough);
}

function median(values) {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 0) {
    return 0.5 * (sorted[mid - 1] + sorted[mid]);
  }
  return sorted[mid];
}

function dyadPenalty(lo, hi, params, L) {
  const dSteps = hi - lo;
  const dMod = dSteps % params.N;
  const cents = 1200 * (dMod / params.N);
  const { cost } = ratioCost(cents, params.sigma_cents, params.lam);
  const f0Hz = f0FromLo(lo, params.N, params.f_ref_hz);
  const rough = roughnessKharm(
    cents,
    f0Hz,
    params.K,
    params.amp_power,
    params.rough_a,
    params.rough_b
  );
  const r = registerDamping(lo, L, params.k);
  const c = compoundRelief(dSteps, params.N, params.m);
  return (cost + params.alpha * rough) * r * c;
}

function dyadPenaltyDetails(lo, hi, params, L) {
  const dSteps = hi - lo;
  const dMod = dSteps % params.N;
  const cents = 1200 * (dMod / params.N);
  const { cost } = ratioCost(cents, params.sigma_cents, params.lam);
  const f0Hz = f0FromLo(lo, params.N, params.f_ref_hz);
  const rough = roughnessKharm(
    cents,
    f0Hz,
    params.K,
    params.amp_power,
    params.rough_a,
    params.rough_b
  );
  const r = registerDamping(lo, L, params.k);
  const c = compoundRelief(dSteps, params.N, params.m);
  const g = (cost + params.alpha * rough) * r * c;
  return { g, dSteps };
}

function computeReferenceG(params) {
  const LRef = 36;
  const loRef = Math.floor(LRef / 2);
  const hiRef = loRef + 1;
  const { g } = dyadPenaltyDetails(loRef, hiRef, params, LRef);
  return g;
}

function sonorityPenalty(pitches, params, L) {
  let total = 0;
  for (let i = 0; i < pitches.length; i++) {
    for (let j = i + 1; j < pitches.length; j++) {
      total += dyadPenalty(pitches[i], pitches[j], params, L);
    }
  }
  return total;
}

function intervalCounts(intervals) {
  const counts = new Map();
  intervals.forEach((d) => {
    counts.set(d, (counts.get(d) || 0) + 1);
  });
  return Array.from(counts.entries()).sort((a, b) => a[0] - b[0]);
}

function octaveReducedIntervalVector(pitches, N) {
  const pcs = Array.from(new Set(pitches.map((p) => ((p % N) + N) % N))).sort((a, b) => a - b);
  if (pcs.length < 2) return Array(Math.floor(N / 2)).fill(0);
  const maxIc = Math.floor(N / 2);
  const vec = Array(maxIc).fill(0);
  for (let i = 0; i < pcs.length; i++) {
    for (let j = i + 1; j < pcs.length; j++) {
      const d = (pcs[j] - pcs[i]) % N;
      const ic = Math.min(d, N - d);
      if (ic > 0 && ic <= maxIc) {
        vec[ic - 1] += 1;
      }
    }
  }
  return vec;
}

function normalOrder(pcs, N) {
  const unique = Array.from(new Set(pcs.map((p) => ((p % N) + N) % N))).sort((a, b) => a - b);
  const n = unique.length;
  if (n <= 1) return unique;
  let best = null;
  let bestSpan = null;
  for (let i = 0; i < n; i++) {
    const rotated = unique.slice(i).concat(unique.slice(0, i).map((p) => p + N));
    const span = rotated[rotated.length - 1] - rotated[0];
    if (best === null || span < bestSpan) {
      best = rotated;
      bestSpan = span;
    } else if (span === bestSpan) {
      for (let k = n - 1; k > 0; k--) {
        const intBest = best[k] - best[0];
        const intRot = rotated[k] - rotated[0];
        if (intRot < intBest) {
          best = rotated;
          break;
        }
        if (intRot > intBest) {
          break;
        }
      }
    }
  }
  return best;
}

function primeFormRahnForte(pitches, N) {
  const pcs = Array.from(new Set(pitches.map((p) => ((p % N) + N) % N))).sort((a, b) => a - b);
  if (pcs.length === 0) return [];
  if (pcs.length === 1) return [0];
  const norm = normalOrder(pcs, N);
  const normT = norm.map((p) => (p - norm[0] + N) % N);
  const inv = pcs.map((p) => (-p + N) % N);
  const invNorm = normalOrder(inv, N);
  const invT = invNorm.map((p) => (p - invNorm[0] + N) % N);
  return compareArrays(normT, invT) <= 0 ? normT : invT;
}

function compareArrays(a, b) {
  const len = Math.min(a.length, b.length);
  for (let i = 0; i < len; i++) {
    if (a[i] < b[i]) return -1;
    if (a[i] > b[i]) return 1;
  }
  if (a.length < b.length) return -1;
  if (a.length > b.length) return 1;
  return 0;
}

function uniquePermutations(values) {
  const counts = new Map();
  values.forEach((v) => counts.set(v, (counts.get(v) || 0) + 1));
  const uniq = Array.from(counts.keys()).sort((a, b) => a - b);
  const total = values.length;
  const results = [];
  const current = [];

  function backtrack() {
    if (current.length === total) {
      results.push(current.slice());
      return;
    }
    for (const v of uniq) {
      const c = counts.get(v) || 0;
      if (c === 0) continue;
      counts.set(v, c - 1);
      current.push(v);
      backtrack();
      current.pop();
      counts.set(v, c);
    }
  }

  backtrack();
  return results;
}

function computeForWindow(intervals, params, O) {
  const L = O * params.N;
  const [amin, amax] = safeAnchorRange(L, intervals);
  const anchors = equalSpacedAnchors(amin, amax, intervals.length);
  const perms = uniquePermutations(intervals);
  const records = perms.map((perm) => {
    const endpoints = endpointsForPerm(anchors, perm);
    const pitches = pitchesFromEndpoints(endpoints);
    const induced = inducedIntervals(pitches);
    const total = sonorityPenalty(pitches, params, L);
    const pairCount = pitches.length * (pitches.length - 1) / 2;
    return {
      perm,
      endpoints,
      anchors,
      pitches,
      induced,
      inducedCounts: intervalCounts(induced),
      total,
      perPair: pairCount ? total / pairCount : 0,
      iv: octaveReducedIntervalVector(pitches, params.N),
      primeForm: primeFormRahnForte(pitches, params.N)
    };
  });
  records.sort((a, b) => a.perPair - b.perPair);
  return { L, anchors, records };
}

function renderOddBiasToggles(intervals) {
  els.oddBias.innerHTML = "";
  state.oddBias = intervals.map(() => "down");
  const stored = localStorage.getItem(storageKeys.oddBias);
  if (stored) {
    try {
      const parsed = JSON.parse(stored);
      if (Array.isArray(parsed) && parsed.length === intervals.length) {
        state.oddBias = parsed;
      }
    } catch {
      state.oddBias = intervals.map(() => "down");
    }
  }
  intervals.forEach((val, idx) => {
    const btn = document.createElement("button");
    const isOdd = val % 2 === 1;
    btn.className = "odd-toggle";
    btn.type = "button";
    btn.textContent = `col ${idx + 1}: ${isOdd ? state.oddBias[idx] : "even"}`;
    if (!isOdd) {
      btn.classList.add("disabled");
    } else if (state.oddBias[idx] === "up") {
      btn.classList.add("active");
    }
    btn.addEventListener("click", () => {
      if (!isOdd) return;
      state.oddBias[idx] = state.oddBias[idx] === "down" ? "up" : "down";
      localStorage.setItem(storageKeys.oddBias, JSON.stringify(state.oddBias));
      renderOddBiasToggles(intervals);
      recompute();
    });
    els.oddBias.appendChild(btn);
  });
}

function buildTabs(Os) {
  els.tabBar.innerHTML = "";
  Os.forEach((O) => {
    const btn = document.createElement("button");
    btn.className = "tab" + (O === state.activeO ? " active" : "");
    btn.textContent = `O=${O}`;
    btn.addEventListener("click", () => {
      state.activeO = O;
      state.selected = null;
      render();
    });
    els.tabBar.appendChild(btn);
  });
}

function updateTable() {
  const tbody = els.resultsTable.querySelector("tbody");
  tbody.innerHTML = "";
  const filterText = els.filter.value.trim().toLowerCase();
  const rows = state.resultsByO[state.activeO] || [];

  rows.forEach((rec, idx) => {
    const permStr = rec.perm.join(" ");
    const pitchStr = rec.pitches.join(" ");
    const match = permStr.includes(filterText) || pitchStr.includes(filterText);
    if (filterText && !match) return;

    const tr = document.createElement("tr");
    if (state.selected && state.selected.perm.join(" ") === permStr) {
      tr.classList.add("selected");
    }
    const favKey = favoriteKey(rec);
    const isFav = state.favorites.some((f) => f.key === favKey);
    tr.innerHTML = `
      <td>${idx + 1}</td>
      <td>${permStr}</td>
      <td>${pitchStr}</td>
      <td class="fav-cell"><button class="fav-btn ${isFav ? "active" : ""}" data-key="${favKey}">★</button></td>
      <td>${rec.total.toFixed(6)}</td>
      <td>${rec.perPair.toFixed(6)}</td>
    `;
    tr.addEventListener("click", () => {
      state.selected = rec;
      localStorage.setItem(storageKeys.selectedPerm, rec.perm.join(" "));
      render();
    });
    const favBtn = tr.querySelector(".fav-btn");
    favBtn.addEventListener("click", (event) => {
      event.stopPropagation();
      toggleFavorite(rec);
      renderFavorites();
      updateTable();
    });
    tbody.appendChild(tr);
  });
}

function updateMeta() {
  const rec = state.selected || (state.resultsByO[state.activeO] || [])[0];
  if (!rec) {
    els.selectedInfo.textContent = "";
    els.hoverInfo.textContent = "";
    return;
  }
  const O = state.activeO;
  const pitchCount = rec.pitches.length;
  els.selectedInfo.innerHTML = [
    `<div class="meta-line">perm: ${rec.perm.join(" ")}</div>`,
    `<div class="meta-line grid"><span class="label">pitches</span><span class="pitch-grid" style="--pitch-count:${pitchCount}">${renderPitches(rec.pitches)}</span></div>`,
    `<div class="meta-line grid"><span class="label">pitch names</span><span class="pitch-grid" style="--pitch-count:${pitchCount}">${renderPitchNames(rec.pitches)}</span></div>`,
    `<div class="meta-line grid"><span class="label">pitch pcs</span><span class="pitch-grid" style="--pitch-count:${pitchCount}">${renderPitchPcSup(rec.pitches)}</span></div>`,
    `<div class="meta-line">intervals: ${renderIntervals(rec.induced)}</div>`,
    `<div class="meta-line">counts: ${renderCounts(rec.inducedCounts)}</div>`,
    `<div class="meta-line" id="hoverCountsLine">hover counts: —</div>`,
    `<div class="meta-line">IV: ${rec.iv.join(" ")}</div>`,
    `<div class="meta-line">prime: ${rec.primeForm.join(" ")}</div>`,
    `<div class="meta-line">tension: ${rec.total.toFixed(6)}</div>`,
    `<div class="meta-line">per pair: ${rec.perPair.toFixed(6)}</div>`
  ].join("");

  void O;
  updateHoverInfo();
}

function updateHoverInfo() {
  const rec = state.selected || (state.resultsByO[state.activeO] || [])[0];
  if (!rec || state.hoverPitch === null) {
    els.hoverInfo.textContent = "Hover a pitch to see dyad details.";
    return;
  }
  const L = state.activeO * state.params.N;
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
      `p=${base} ↔ ${row.other}  <span class="d-tag" style="color: ${intervalColor(row.dSteps)}">d=${row.dSteps}</span>  g=${row.g.toFixed(2)}  g*=${row.gScaled.toFixed(2)}`
  );
  els.hoverInfo.innerHTML = lines.join("<br>");
}

function renderPlot() {
  const canvas = els.plot;
  const ctx = canvas.getContext("2d");
  const rec = state.selected || (state.resultsByO[state.activeO] || [])[0];
  if (!rec) return;

  const wrap = canvas.parentElement;
  if (wrap) {
    const targetWidth = Math.max(320, wrap.clientWidth - 24);
    const maxHeight = Math.floor(window.innerHeight * 0.55);
    const targetHeight = Math.max(320, Math.min(560, maxHeight));
    if (canvas.width !== targetWidth || canvas.height !== targetHeight) {
      canvas.width = targetWidth;
      canvas.height = targetHeight;
    }
  }

  const O = state.activeO;
  const L = O * state.params.N;
  const rawSpacing = parseFloat(els.xSpacing.value) || 0.8;
  const xSpacing = Math.min(1.2, Math.max(0.2, rawSpacing));

  ctx.clearRect(0, 0, canvas.width, canvas.height);
  const pad = 48;
  const width = canvas.width - pad * 2;
  const height = canvas.height - pad * 2;
  const totalCols = rec.endpoints.length + 1;

  function yToPx(y) {
    return canvas.height - pad - (y / L) * height;
  }

  function xToPx(i) {
    return pad + (i + 1) * (width / (totalCols + 1)) * xSpacing;
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
  for (let y = 0; y <= L; y += state.params.N) {
    const px = yToPx(y);
    ctx.beginPath();
    ctx.moveTo(pad, px);
    ctx.lineTo(canvas.width - pad, px);
    ctx.stroke();
  }

  ctx.fillStyle = "#1b1b1b";
  ctx.font = "12px 'Palatino Linotype', serif";
  state.hoverPoints = [];
  rec.endpoints.forEach(([lo, hi], idx) => {
    const x = xToPx(idx);
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
    state.hoverPoints.push({ pitch: lo, x, y: yToPx(lo), type: "endpoint" });
    ctx.beginPath();
    ctx.arc(x, yToPx(hi), 3.5, 0, Math.PI * 2);
    ctx.fill();
    state.hoverPoints.push({ pitch: hi, x, y: yToPx(hi), type: "endpoint" });
    ctx.save();
    ctx.globalAlpha = 0.3;
    ctx.beginPath();
    ctx.arc(x, yToPx(a), 4, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
    ctx.fillText(`a=${a}`, x + 6, yToPx(a) + 4);
    ctx.fillText(`lo=${lo}`, x + 6, yToPx(lo) + 12);
    ctx.fillText(`hi=${hi}`, x + 6, yToPx(hi) - 4);
  });

  const xAll = xToPx(totalCols);
  state.hoverPoints = rec.pitches.map((p) => ({
    pitch: p,
    x: xAll,
    y: yToPx(p)
  }));
  ctx.save();
  ctx.setLineDash([4, 4]);
  ctx.strokeStyle = "rgba(0,0,0,0.35)";
  rec.endpoints.forEach(([lo, hi], idx) => {
    const x = xToPx(idx);
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
    state.hoverPoints.push({ pitch: p, x: xAll, y: yToPx(p), type: "all" });
  });

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
        const hue = hueForInterval(item.interval, state.hoverWindowL);
        ctx.strokeStyle = `hsla(${hue}, 60%, 45%, 0.85)`;
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
        ctx.font = "12px 'Palatino Linotype', serif";
        const metrics = ctx.measureText(label);
        const paddingX = 4;
        const paddingY = 4;
        const boxW = metrics.width + paddingX * 2;
        const boxH = 16 + paddingY;
        ctx.fillStyle = "rgba(255, 255, 255, 0.85)";
        ctx.fillRect(labelX - boxW / 2, labelY - boxH / 2, boxW, boxH);
        ctx.strokeStyle = `hsla(${hue}, 60%, 45%, 0.85)`;
        ctx.lineWidth = 1.5;
        ctx.strokeRect(labelX - boxW / 2, labelY - boxH / 2, boxW, boxH);
        ctx.fillStyle = `hsla(${hue}, 60%, 35%, 0.95)`;
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

function renderCounts(inducedCounts) {
  return inducedCounts
    .map(([d, c]) => `<span class="count-item" data-interval="${d}" data-total="${c}">${d}(${c})</span>`)
    .join(" ");
}

function renderIntervals(intervals) {
  const counts = {};
  return intervals
    .map((d) => {
      counts[d] = (counts[d] || 0) + 1;
      return `<span class="interval-item" data-interval="${d}" data-occurrence="${counts[d]}">${d}</span>`;
    })
    .join(" ");
}

function renderPitchNames(pitches) {
  if (state.params.N !== 12) {
    return pitches.map((p) => `<span class="pitch-name" data-pitch="${p}">step${p}</span>`).join("");
  }
  const noteNames = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];
  const baseNote = parseInt(els.baseNote.value, 10) || 0;
  const baseOctave = parseInt(els.baseOctave.value, 10) || 4;
  const baseMidi = (baseOctave + 1) * 12 + baseNote;
  return pitches
    .map((p) => {
      const midi = baseMidi + p;
      const note = noteNames[((midi % 12) + 12) % 12];
      const octave = Math.floor(midi / 12) - 1;
      return `<span class="pitch-name" data-pitch="${p}">${note}${octave}</span>`;
    })
    .join("");
}

function renderPitchPcSup(pitches) {
  const N = state.params.N;
  return pitches
    .map((p) => {
      const pc = ((p % N) + N) % N;
      const octs = Math.floor(p / N);
      if (octs === 0) {
        return `<span class="pitch-pc" data-pitch="${p}">${pc}</span>`;
      }
      return `<span class="pitch-pc" data-pitch="${p}">${pc}<sup>+${octs}</sup></span>`;
    })
    .join("");
}

function renderPitches(pitches) {
  return pitches
    .map((p) => `<span class="pitch-item" data-pitch="${p}">${p}</span>`)
    .join("");
}

function intervalCountsFromPitch(pitches, pitch) {
  const counts = new Map();
  pitches.forEach((p) => {
    if (p !== pitch) {
      const d = Math.abs(p - pitch);
      counts.set(d, (counts.get(d) || 0) + 1);
    }
  });
  return counts;
}

function clearCountHighlights() {
  const items = els.selectedInfo.querySelectorAll(".count-item, .interval-item");
  items.forEach((el) => {
    el.classList.remove("highlight");
    el.classList.remove("partial");
    el.style.color = "";
    el.style.borderColor = "";
  });
  const pitchItems = els.selectedInfo.querySelectorAll(".pitch-item, .pitch-name, .pitch-pc");
  pitchItems.forEach((el) => el.classList.remove("pitch-highlight"));
}

function highlightCounts(countMap) {
  const totals = new Map();
  els.selectedInfo.querySelectorAll(".count-item").forEach((el) => {
    const interval = parseInt(el.dataset.interval, 10);
    const total = parseInt(el.dataset.total || "0", 10);
    totals.set(interval, total);
  });
  const countItems = els.selectedInfo.querySelectorAll(".count-item");
  countItems.forEach((el) => {
    const interval = parseInt(el.dataset.interval, 10);
    if (countMap.has(interval)) {
      el.classList.add("highlight");
      const total = totals.get(interval) || 0;
      const localCount = countMap.get(interval) || 0;
      if (total && localCount < total) {
        el.classList.add("partial");
      }
      const maxInterval = state.hoverWindowL || interval || 1;
      const hue = hueForInterval(interval, maxInterval);
      el.style.color = `hsl(${hue}, 60%, 45%)`;
      el.style.borderColor = `hsla(${hue}, 60%, 45%, 0.85)`;
    } else {
      el.classList.remove("highlight");
      el.classList.remove("partial");
      el.style.color = "";
      el.style.borderColor = "";
    }
  });
  const intervalItems = els.selectedInfo.querySelectorAll(".interval-item");
  intervalItems.forEach((el) => {
    const interval = parseInt(el.dataset.interval, 10);
    const occurrence = parseInt(el.dataset.occurrence || "0", 10);
    if (countMap.has(interval) && occurrence <= (countMap.get(interval) || 0)) {
      el.classList.add("highlight");
      const total = totals.get(interval) || 0;
      const localCount = countMap.get(interval) || 0;
      if (total && localCount < total) {
        el.classList.add("partial");
      }
      const maxInterval = state.hoverWindowL || interval || 1;
      const hue = hueForInterval(interval, maxInterval);
      el.style.color = `hsl(${hue}, 60%, 45%)`;
      el.style.borderColor = `hsla(${hue}, 60%, 45%, 0.85)`;
    } else {
      el.classList.remove("highlight");
      el.classList.remove("partial");
      el.style.color = "";
      el.style.borderColor = "";
    }
  });
  const pitchItems = els.selectedInfo.querySelectorAll(".pitch-item, .pitch-name, .pitch-pc");
  pitchItems.forEach((el) => {
    const pitch = parseInt(el.dataset.pitch, 10);
    if (pitch === state.hoverPitch) {
      el.classList.add("pitch-highlight");
    } else {
      el.classList.remove("pitch-highlight");
    }
  });
}

function updateHoverCountsLine(countMap) {
  const line = document.getElementById("hoverCountsLine");
  if (!line) return;
  if (!countMap || countMap.size === 0) {
    line.textContent = "hover counts: —";
    return;
  }
  const parts = Array.from(countMap.entries())
    .sort((a, b) => a[0] - b[0])
    .map(([d, c]) => `${d}(${c})`);
  line.textContent = `hover counts: ${parts.join(" ")}`;
}

function render() {
  buildTabs(Object.keys(state.resultsByO).map(Number));
  updateTable();
  renderPlot();
  updateMeta();
  updateHoverInfo();
  renderFavorites();
  const rec = (state.resultsByO[state.activeO] || [])[0];
  if (rec) {
    els.anchorSummary.textContent = `anchors: ${rec.anchors.join(" ")}`;
  } else {
    els.anchorSummary.textContent = "";
  }
}

function recompute() {
  const intervals = parseIntervals(els.intervals.value);
  if (intervals.length === 0) return;
  const N = Math.max(1, parseInt(els.edo.value, 10) || 12);
  const minO = Math.max(1, parseInt(els.minO.value, 10) || 1);
  const maxO = Math.max(minO, parseInt(els.maxO.value, 10) || minO);

  state.params = { ...defaultParams, N, useDamping: els.useDamping.value !== "off" };
  state.params.alpha = calibrateAlpha(state.params, 0.5);
  state.gRef = computeReferenceG(state.params);
  renderOddBiasToggles(intervals);
  state.resultsByO = {};
  const Os = [];
  let permCount = 0;
  for (let O = minO; O <= maxO; O++) {
    const { records } = computeForWindow(intervals, state.params, O);
    state.resultsByO[O] = records;
    Os.push(O);
    permCount = Math.max(permCount, records.length);
  }
  const savedO = parseInt(localStorage.getItem(storageKeys.activeO) || "", 10);
  state.activeO = Os.includes(savedO) ? savedO : (Os.includes(3) ? 3 : Os[0]);
  const savedPerm = (localStorage.getItem(storageKeys.selectedPerm) || "").trim();
  state.selected = null;
  if (savedPerm) {
    const recs = state.resultsByO[state.activeO] || [];
    const match = recs.find((r) => r.perm.join(" ") === savedPerm);
    if (match) state.selected = match;
  }
  els.status.textContent = `Computed ${permCount} permutations across ${Os.length} windows`;
  render();
}

function saveInputs() {
  localStorage.setItem(storageKeys.intervals, els.intervals.value);
  localStorage.setItem(storageKeys.edo, els.edo.value);
  localStorage.setItem(storageKeys.baseNote, els.baseNote.value);
  localStorage.setItem(storageKeys.baseOctave, els.baseOctave.value);
  localStorage.setItem(storageKeys.minO, els.minO.value);
  localStorage.setItem(storageKeys.maxO, els.maxO.value);
  localStorage.setItem(storageKeys.xSpacing, els.xSpacing.value);
  localStorage.setItem(storageKeys.useDamping, els.useDamping.value);
}

function loadInputs() {
  const storedIntervals = localStorage.getItem(storageKeys.intervals);
  if (storedIntervals) els.intervals.value = storedIntervals;
  const storedEdo = localStorage.getItem(storageKeys.edo);
  if (storedEdo) els.edo.value = storedEdo;
  const storedBaseNote = localStorage.getItem(storageKeys.baseNote);
  if (storedBaseNote) els.baseNote.value = storedBaseNote;
  const storedBaseOctave = localStorage.getItem(storageKeys.baseOctave);
  if (storedBaseOctave) els.baseOctave.value = storedBaseOctave;
  const storedMin = localStorage.getItem(storageKeys.minO);
  if (storedMin) els.minO.value = storedMin;
  const storedMax = localStorage.getItem(storageKeys.maxO);
  if (storedMax) els.maxO.value = storedMax;
  const storedSpacing = localStorage.getItem(storageKeys.xSpacing);
  if (storedSpacing) els.xSpacing.value = storedSpacing;
  const storedDamping = localStorage.getItem(storageKeys.useDamping);
  if (storedDamping) els.useDamping.value = storedDamping;
  const storedFilter = localStorage.getItem(storageKeys.filter);
  if (storedFilter) els.filter.value = storedFilter;
}

function loadFavorites() {
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

function saveFavorites() {
  localStorage.setItem(storageKeys.favorites, JSON.stringify(state.favorites));
}

function favoriteKey(rec) {
  const O = state.activeO;
  return `${els.intervals.value}|O${O}|${rec.perm.join(",")}|${rec.pitches.join(",")}`;
}

function toggleFavorite(rec) {
  const key = favoriteKey(rec);
  const idx = state.favorites.findIndex((f) => f.key === key);
  if (idx >= 0) {
    state.favorites.splice(idx, 1);
  } else {
    state.favorites.push({
      key,
      intervals: els.intervals.value,
      O: state.activeO,
      perm: rec.perm,
      pitches: rec.pitches,
      total: rec.total
    });
  }
  saveFavorites();
}

function renderFavorites() {
  els.favoritesList.innerHTML = "";
  if (!state.favorites.length) {
    els.favoritesList.textContent = "No favorites yet.";
    return;
  }
  const list = document.createElement("div");
  state.favorites.forEach((fav) => {
    const item = document.createElement("div");
    item.className = "fav-item";
    const total = typeof fav.total === "number" ? fav.total.toFixed(3) : "n/a";
    item.innerHTML = `<span>O${fav.O} perm ${fav.perm.join(" ")} | ${fav.pitches.join(" ")} | t=${total}</span>`;
    const btn = document.createElement("button");
    btn.textContent = "Select";
    btn.addEventListener("click", () => {
      const recs = state.resultsByO[fav.O] || [];
      const match = recs.find((r) => r.perm.join(" ") === fav.perm.join(" "));
      if (match) {
        state.activeO = fav.O;
        state.selected = match;
        localStorage.setItem(storageKeys.activeO, fav.O.toString());
        localStorage.setItem(storageKeys.selectedPerm, match.perm.join(" "));
        render();
      }
    });
    item.appendChild(btn);
    list.appendChild(item);
  });
  els.favoritesList.appendChild(list);
}

async function requestMidiAccess() {
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
  } catch (err) {
    els.status.textContent = "MIDI access denied";
    return null;
  }
}

function refreshMidiOutputs() {
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

function previewSelected() {
  const rec = state.selected || (state.resultsByO[state.activeO] || [])[0];
  if (!rec) return;
  requestMidiAccess().then(() => {
    const out = getSelectedOutput();
    if (!out) {
      els.status.textContent = "Select a MIDI output";
      return;
    }
    const base = 60;
    const notes = rec.pitches.map((p) => base + p).filter((n) => n >= 0 && n <= 127);
    const now = window.performance.now();
    const durationMs = 2000;
    notes.forEach((note) => out.send([0x90, note, 80], now));
    notes.forEach((note) => out.send([0x80, note, 64], now + durationMs));
  });
}

let recomputeTimer = null;
function scheduleRecompute() {
  if (recomputeTimer) {
    clearTimeout(recomputeTimer);
  }
  recomputeTimer = setTimeout(() => {
    saveInputs();
    recompute();
  }, 150);
}

els.runBtn.addEventListener("click", () => {
  saveInputs();
  recompute();
});
[els.intervals, els.edo, els.baseNote, els.baseOctave, els.minO, els.maxO, els.xSpacing, els.useDamping].forEach((el) => {
  el.addEventListener("input", scheduleRecompute);
  el.addEventListener("change", scheduleRecompute);
});
els.filter.addEventListener("input", () => {
  localStorage.setItem(storageKeys.filter, els.filter.value);
  updateTable();
});
els.midiOut.addEventListener("click", () => {
  requestMidiAccess();
});
els.midiOut.addEventListener("change", () => {
  localStorage.setItem(storageKeys.midiOut, els.midiOut.value);
});
els.midiPreview.addEventListener("click", previewSelected);
window.addEventListener("resize", () => {
  renderPlot();
});

els.plot.addEventListener("mousemove", (event) => {
  const rect = els.plot.getBoundingClientRect();
  const scaleX = els.plot.width / rect.width;
  const scaleY = els.plot.height / rect.height;
  const x = (event.clientX - rect.left) * scaleX;
  const y = (event.clientY - rect.top) * scaleY;
  const rec = state.selected || (state.resultsByO[state.activeO] || [])[0];
  const L = state.activeO * state.params.N;
  let hit = null;
  if (rec) {
    const pad = 48;
    const height = els.plot.height - pad * 2;
    const yValue = ((els.plot.height - pad - y) / height) * L;
    const nearest = rec.pitches.reduce((best, p) => {
      const dist = Math.abs(p - yValue);
      if (!best || dist < best.dist) return { pitch: p, dist };
      return best;
    }, null);
    if (nearest && nearest.dist <= 0.4) {
      hit = nearest.pitch;
    }
  }
  if (hit === null) {
    if (state.hoverPitch !== null) {
      state.hoverPitch = null;
      clearCountHighlights();
      renderPlot();
      updateHoverInfo();
      updateHoverCountsLine(null);
    }
    return;
  }
  if (hit !== state.hoverPitch) {
    state.hoverPitch = hit;
    state.hoverWindowL = state.activeO * state.params.N;
    const rec = state.selected || (state.resultsByO[state.activeO] || [])[0];
    if (rec) {
      const counts = intervalCountsFromPitch(rec.pitches, hit);
      highlightCounts(counts);
      updateHoverCountsLine(counts);
    }
    renderPlot();
    updateHoverInfo();
  }
});

els.plot.addEventListener("mouseleave", () => {
  state.hoverPitch = null;
  clearCountHighlights();
  renderPlot();
  updateHoverInfo();
  updateHoverCountsLine(null);
});

loadInputs();
loadFavorites();
recompute();
