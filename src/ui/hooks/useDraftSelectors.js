import { useStore } from "../../state/store.js";
import {
  selectActiveDraftIdByLensInstanceId,
  selectDraftOrderByLensInstanceId,
  selectDraftsById,
  selectLastErrorByLensInstanceId,
  selectSelectedLensInstanceId
} from "../../state/selectors.js";

export function useDraftSelectors() {
  const draftsById = useStore(selectDraftsById);
  const draftOrderByLensInstanceId = useStore(selectDraftOrderByLensInstanceId);
  const activeDraftIdByLensInstanceId = useStore(selectActiveDraftIdByLensInstanceId);
  const lastErrorByLensInstanceId = useStore(selectLastErrorByLensInstanceId);
  const selectedLensInstanceId = useStore(selectSelectedLensInstanceId);
  const selectedDraftId = useStore((state) => state.authoritative.selection.draftId);

  return {
    draftsById,
    draftOrderByLensInstanceId,
    activeDraftIdByLensInstanceId,
    lastErrorByLensInstanceId,
    selectedLensInstanceId,
    selectedDraftId
  };
}
