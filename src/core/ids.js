// Purpose: ids.js provides exports: newId.
// Interacts with: no imports.
// Role: core domain layer module within the broader app graph.
let counter = 0;

export function newId(prefix = "id") {
  counter = (counter + 1) % 1000000;
  const time = Date.now().toString(36);
  const seq = counter.toString(36).padStart(3, "0");
  return `${prefix}_${time}_${seq}`;
}
