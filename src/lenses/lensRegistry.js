import { intervalPlacementLens } from "./intervalPlacementLens.js";
import { euclideanPatternsLens } from "./euclideanPatternsLens.js";

const registry = new Map();

export function registerLens(lens) {
  if (!lens || !lens.id) return;
  registry.set(lens.id, lens);
}

export function getLens(id) {
  return registry.get(id) || null;
}

export function listLenses() {
  return Array.from(registry.values());
}

registerLens(intervalPlacementLens);
registerLens(euclideanPatternsLens);
