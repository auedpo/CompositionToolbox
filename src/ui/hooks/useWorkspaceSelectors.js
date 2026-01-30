import { useStore } from "../../state/store.js";
import { selectLensInstancesById, selectTrackOrder, selectTracksById } from "../../state/selectors.js";

export function useTrackOrder() {
  return useStore(selectTrackOrder);
}

export function useTracksById() {
  return useStore(selectTracksById);
}

export function useLensInstancesById() {
  return useStore(selectLensInstancesById);
}
