export const ENTITY = {
  DRAFT: "draft",
  MATERIAL: "material",
  CLIP: "clip"
};

// Hard rules:
// - Lens outputs (Drafts) never contain Materials.
// - Inventory never contains Drafts.
// - Desk never references Drafts.
// - Only Materials have stable IDs; Clips reference materialId.
