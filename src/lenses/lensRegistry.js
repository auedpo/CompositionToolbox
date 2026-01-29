import { basicMathTransformerLens } from "./basicMathTransformerLens.js";
import { intervalPlacementLens } from "./intervalPlacementLens.js";
import { euclideanPatternsLens } from "./euclideanPatternsLens.js";
import { inputListLens } from "./inputList.js";
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

export function getLensDef(id) {
  return getLens(id);
}

export function listLenses() {
  return Array.from(registry.values());
}

registerLens(intervalPlacementLens);
registerLens(euclideanPatternsLens);
registerLens(inputListLens);
registerLens(passthroughLens);
registerLens(basicMathTransformerLens);
registerLens(shiftSweepLens);
