import { useStore } from "../../state/store.js";
import {
  selectActiveDraftIdByLensInstanceId,
  selectDraftOrderByLensInstanceId,
  selectDraftsById,
  selectLastErrorByLensInstanceId,
  selectLensOutputSelection,
  selectRuntimeWarningsByLensInstanceId,
  selectSelectedLensInstanceId
} from "../../state/selectors.js";

export function useDraftSelectors() {
  const draftsById = useStore(selectDraftsById);
  const draftOrderByLensInstanceId = useStore(selectDraftOrderByLensInstanceId);
  const activeDraftIdByLensInstanceId = useStore(selectActiveDraftIdByLensInstanceId);
  const lastErrorByLensInstanceId = useStore(selectLastErrorByLensInstanceId);
  const selectedLensInstanceId = useStore(selectSelectedLensInstanceId);
  const runtimeWarningsByLensInstanceId = useStore(selectRuntimeWarningsByLensInstanceId);
  const selectedDraftId = useStore((state) => state.authoritative.selection.draftId);
  const lensOutputSelection = useStore((state) =>
    selectLensOutputSelection(state, selectedLensInstanceId)
  );

  return {
    draftsById,
    draftOrderByLensInstanceId,
    activeDraftIdByLensInstanceId,
    lastErrorByLensInstanceId,
    selectedLensInstanceId,
    selectedDraftId,
    lensOutputSelection,
    runtimeWarningsByLensInstanceId
  };
}
