import TextPreviewViz from "./TextPreviewViz.jsx";
import EuclideanCircleViz from "./EuclideanCircleViz.jsx";

export const TEXT_PREVIEW_KEY = "textPreview";

export const TEXT_PREVIEW_ENTRY = {
  label: "Text",
  component: TextPreviewViz,
  requires: {
    draft: true
  }
};

export const VISUALIZER_REGISTRY = {
  euclideanPatterns: {
    defaultKey: "euclidCircle",
    options: {
      euclidCircle: {
        label: "Circle",
        component: EuclideanCircleViz,
        requires: {
          vizModelKind: "euclidean"
        }
      }
    }
  }
};
