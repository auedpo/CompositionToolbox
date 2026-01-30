import { useMemo } from "react";

import { listLenses } from "../../lenses/lensRegistry.js";

export function useLensRegistry() {
  return useMemo(() => {
    return listLenses().map((lens) => ({
      lensId: lens.meta.id,
      name: lens.meta.name || lens.meta.id,
      category: lens.meta.category || lens.meta.kind || "lens"
    }));
  }, []);
}
