import { basicMathTransformerLens } from "./basicMathTransformerLens.js";
import { intervalPlacementLens } from "./intervalPlacementLens.js";
import { euclideanPatternsLens } from "./euclideanPatternsLens.js";
import { passthroughLens } from "./passthroughLens.js";
import { shiftSweepLens } from "./transformers/shiftSweep.js";

const registry = new Map();

export function registerLens(lens) {
  if (!lens || !lens.meta || !lens.meta.id) return;
  registry.set(lens.meta.id, lens);
}

export function getLens(id) {
  return registry.get(id) || null;
}

export function listLenses() {
  return Array.from(registry.values());
}

registerLens(intervalPlacementLens);
registerLens(euclideanPatternsLens);
registerLens(passthroughLens);
registerLens(basicMathTransformerLens);
registerLens(shiftSweepLens);
