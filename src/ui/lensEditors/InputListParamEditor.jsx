import React, { useEffect, useMemo, useState } from "react";

import { parseUserList } from "../../core/parseUserList.js";

function isFlatNumericArray(values) {
  return Array.isArray(values) && values.every((value) => typeof value === "number" && Number.isFinite(value));
}

export default function InputListParamEditor({
  lensInstanceId,
  params,
  replaceParams,
  derivedError
}) {
  const [localText, setLocalText] = useState("");
  const [localError, setLocalError] = useState(null);
  const [localParseMode, setLocalParseMode] = useState("auto");

  const paramsSignature = useMemo(() => JSON.stringify(params || {}), [params]);

  useEffect(() => {
    if (!lensInstanceId) {
      setLocalText("");
      setLocalError(null);
      setLocalParseMode("auto");
      return;
    }
    if (params && typeof params.text === "string") {
      setLocalText(params.text);
    } else if (params && params.values !== undefined) {
      setLocalText(isFlatNumericArray(params.values)
        ? params.values.join(" ")
        : JSON.stringify(params.values));
    } else {
      setLocalText("");
    }
    setLocalParseMode(typeof params?.parseMode === "string" ? params.parseMode : "auto");
    setLocalError(null);
  }, [lensInstanceId, paramsSignature]);

  const handleApply = () => {
    const result = parseUserList(localText, localParseMode);
    if (!result.ok) {
      setLocalError(result.error || "Unable to parse list.");
      return;
    }
    replaceParams({
      ...(params && typeof params === "object" ? params : {}),
      values: result.values,
      text: localText,
      parseMode: localParseMode
    });
    setLocalError(null);
  };

  const handleNormalize = () => {
    const result = parseUserList(localText, localParseMode);
    if (!result.ok) {
      setLocalError(result.error || "Unable to parse list.");
      return;
    }
    setLocalText(result.normalizedText);
    setLocalError(null);
  };

  return (
    <div>
      <div className="hint">Input List</div>
      <select
        className="component-field"
        value={localParseMode}
        onChange={(event) => setLocalParseMode(event.target.value)}
      >
        <option value="auto">Auto</option>
        <option value="flat">Flat (spaces/commas)</option>
        <option value="json">JSON array</option>
        <option value="lisp">Lisp list</option>
      </select>
      <textarea
        className="component-field"
        value={localText}
        onChange={(event) => {
          setLocalText(event.target.value);
          if (localError) setLocalError(null);
        }}
        rows={8}
      />
      <div>
        <button
          type="button"
          className="component-button"
          onClick={handleApply}
        >
          Apply
        </button>
        <button
          type="button"
          className="component-button"
          onClick={handleNormalize}
        >
          Normalize
        </button>
      </div>
      {localError ? (
        <div className="hint">{localError}</div>
      ) : null}
      {derivedError ? (
        <div className="hint">Error: {derivedError}</div>
      ) : null}
    </div>
  );
}
