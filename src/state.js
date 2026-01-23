export const defaultParams = {
  // Pitch/EDO geometry and compound interval handling.
  edoSteps: 12,
  compoundReliefM: 0.55,
  // Ratio cost targets and weighting.
  sigmaCents: 20.0,
  ratioLambda: 0.20,
  // Roughness model and weighting.
  roughAlpha: 0.0,
  roughPartialsK: 12,
  ampPower: 1.0,
  roughA: 3.5,
  roughB: 5.75,
  // Register damping.
  registerDampingK: 1.6,
  // Anchor placement parameters (v2).
  anchorAlpha: 0.3,
  anchorBeta: 1.0,
  anchorRho: 0.5,
  // Center repulsion placement parameters (Engine A).
  repulseGamma: 1.0,
  repulseKappa: 0.4,
  repulseLambda: 0.1,
  repulseEta: 0.08,
  repulseIterations: 60,
  repulseAlpha: 1.0,
  midiTailMs: 200,
  // Reference tuning.
  fRefHz: 55.0
};

export const state = {
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
  favorites: [],
  pendingOddBias: null,
  favoritePromptHandlers: null
};

export const els = {
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
  keyboard: document.getElementById("keyboard"),
  resultsTable: document.getElementById("resultsTable"),
  filter: document.getElementById("filter"),
  useDamping: document.getElementById("useDamping"),
  oddBias: document.getElementById("oddBias"),
  favoritesList: document.getElementById("favoritesList"),
  anchorSummary: document.getElementById("anchorSummary"),
  anchorMath: document.getElementById("anchorMath"),
  midiOut: document.getElementById("midiOut"),
  midiPreview: document.getElementById("midiPreview"),
  guitarTuning: document.getElementById("guitarTuning"),
  placementMode: document.getElementById("placementMode"),
  placementParams: document.getElementById("placementParams"),
  midiParams: document.getElementById("midiParams"),
  fretboard: document.getElementById("fretboard"),
  favoritePrompt: document.getElementById("favoritePrompt"),
  favoritePromptText: document.getElementById("favoritePromptText"),
  favoriteSwitchBtn: document.getElementById("favoriteSwitchBtn"),
  favoriteImportBtn: document.getElementById("favoriteImportBtn"),
  favoriteCancelBtn: document.getElementById("favoriteCancelBtn")
};

export const storageKeys = {
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
  selectedPerm: "intervalApplet.selectedPerm",
  anchorAlpha: "intervalApplet.anchorAlpha",
  anchorBeta: "intervalApplet.anchorBeta",
  anchorRho: "intervalApplet.anchorRho",
  placementMode: "intervalApplet.placementMode",
  guitarTuning: "intervalApplet.guitarTuning",
  repulseGamma: "intervalApplet.repulseGamma",
  repulseKappa: "intervalApplet.repulseKappa",
  repulseLambda: "intervalApplet.repulseLambda",
  repulseEta: "intervalApplet.repulseEta",
  repulseIterations: "intervalApplet.repulseIterations",
  repulseAlpha: "intervalApplet.repulseAlpha",
  midiTailMs: "intervalApplet.midiTailMs"
};
