import { useStore } from "../../state/store.js";

export function useSelection() {
  const selection = useStore((state) => state.authoritative.selection);
  const actions = useStore((state) => state.actions);

  const selectTrack = (trackId) => {
    actions.setSelection({ trackId, lensInstanceId: undefined, draftId: undefined });
  };

  const selectLens = (lensInstanceId, trackId) => {
    actions.setSelection({ lensInstanceId, trackId, draftId: undefined });
  };

  const selectDraft = (draftId) => {
    actions.setSelection({ draftId });
  };

  return {
    selection,
    selectTrack,
    selectLens,
    selectDraft
  };
}
