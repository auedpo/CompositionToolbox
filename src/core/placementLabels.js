export function engineLabelForId(id) {
  if (id === "v1") return "uniform-centers";
  if (id === "repulse") return "repulsion-centers";
  if (id === "prefixDominance") return "prefix-dominance";
  if (id === "v2") return "prefix-slack";
  return id || "";
}
