import InputListParamEditor from "./InputListParamEditor.jsx";

const paramEditorsById = new Map([
  ["inputList", InputListParamEditor]
]);

export function getParamEditorForLens(lensDef) {
  if (!lensDef) return null;
  const editorKey = lensDef.paramEditorId || (lensDef.meta && lensDef.meta.id);
  return editorKey ? paramEditorsById.get(editorKey) || null : null;
}
