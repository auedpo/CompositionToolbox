import { useStore } from "../../state/store.js";
import { selectLaneOrder, selectLanesById, selectLensInstancesById } from "../../state/selectors.js";

export function useLaneOrder() {
  return useStore(selectLaneOrder);
}

export function useLanesById() {
  return useStore(selectLanesById);
}

export function useLensInstancesById() {
  return useStore(selectLensInstancesById);
}
