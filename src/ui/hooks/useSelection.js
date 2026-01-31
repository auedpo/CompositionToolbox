import { useStore } from "../../state/store.js";

export function useSelection() {
  const selection = useStore((state) => state.authoritative.selection);
  const actions = useStore((state) => state.actions);

  const selectLane = (laneId) => {
    actions.setSelection({ laneId, lensInstanceId: undefined, draftId: undefined });
  };

  const selectLens = (lensInstanceId) => {
    actions.setSelection({ lensInstanceId });
  };

  const selectDraft = (draftId) => {
    actions.setSelection({ draftId });
  };

  return {
    selection,
    selectLane,
    selectLens,
    selectDraft
  };
}
