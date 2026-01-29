import React, { useCallback, useEffect, useRef, useState } from "react";

import { parseUserList } from "./parseUserList.js";
import { useDebouncedCommit } from "./useDebouncedCommit.js";

const PARSERS = {
  userList: parseUserList
};

function getParamValue(params, key) {
  if (!params || typeof params !== "object") return undefined;
  return params[key];
}

function FieldLabel({ label }) {
  if (!label) return null;
  return <div className="hint">{label}</div>;
}

function FieldHelp({ help }) {
  if (!help) return null;
  return <div className="hint">{help}</div>;
}

function BooleanField({ field, params, onPatch }) {
  const value = Boolean(getParamValue(params, field.key));
  return (
    <div>
      <label>
        <input
          type="checkbox"
          checked={value}
          onChange={(event) => onPatch({ [field.key]: event.target.checked })}
        />
        <span> {field.label || field.key}</span>
      </label>
      <FieldHelp help={field.help} />
    </div>
  );
}

function NumberField({ field, params, onPatch }) {
  const current = getParamValue(params, field.key);
  const value = Number.isFinite(current) ? current : "";
  return (
    <div>
      <FieldLabel label={field.label || field.key} />
      <input
        type="number"
        className="component-field"
        value={value}
        min={field.min}
        max={field.max}
        step={field.step}
        onChange={(event) => {
          const raw = event.target.value;
          if (raw === "") {
            onPatch({ [field.key]: null });
            return;
          }
          const parsed = Number(raw);
          if (!Number.isFinite(parsed)) return;
          onPatch({ [field.key]: parsed });
        }}
      />
      <FieldHelp help={field.help} />
    </div>
  );
}

function EnumField({ field, params, onPatch }) {
  const options = Array.isArray(field.options) ? field.options : [];
  const current = getParamValue(params, field.key);
  const fallback = options.length ? options[0] : "";
  const value = typeof current === "string" && options.includes(current)
    ? current
    : fallback;
  return (
    <div>
      <FieldLabel label={field.label || field.key} />
      <select
        className="component-field"
        value={value}
        onChange={(event) => onPatch({ [field.key]: event.target.value })}
      >
        {options.map((option) => (
          <option key={option} value={option}>{option}</option>
        ))}
      </select>
      <FieldHelp help={field.help} />
    </div>
  );
}

function TypedListField({ field, params, onPatch }) {
  const sourceKey = field.sourceKey;
  const targetKey = field.targetKey;
  const parserId = field.parserId || "userList";
  const parseFn = PARSERS[parserId];
  const [error, setError] = useState(null);
  const lastResultRef = useRef(null);
  const text = typeof getParamValue(params, sourceKey) === "string" ? getParamValue(params, sourceKey) : "";
  const debounceMs = Number.isFinite(field.debounceMs) ? field.debounceMs : 200;

  const parseAndCommit = useCallback((nextText) => {
    if (typeof parseFn !== "function") {
      setError(`Unknown parser: ${parserId}`);
      lastResultRef.current = null;
      return;
    }
    const result = parseFn(nextText);
    if (!result.ok) {
      setError(result.error || "Unable to parse list.");
      lastResultRef.current = null;
      return;
    }
    lastResultRef.current = result;
    setError(null);
    onPatch({ [targetKey]: result.values });
  }, [onPatch, parserId, parseFn, targetKey]);

  const debounced = useDebouncedCommit(parseAndCommit, debounceMs);

  useEffect(() => {
    setError(null);
    lastResultRef.current = null;
  }, [text]);

  const handleNormalize = useCallback(() => {
    if (!lastResultRef.current) return;
    onPatch({ [sourceKey]: lastResultRef.current.normalizedText });
  }, [onPatch, sourceKey]);

  return (
    <div>
      <FieldLabel label={field.label || sourceKey} />
      <textarea
        className="component-field"
        value={text}
        onChange={(event) => {
          const nextText = event.target.value;
          onPatch({ [sourceKey]: nextText });
          debounced.schedule(nextText);
        }}
        onBlur={() => {
          debounced.flush();
        }}
        rows={6}
      />
      <div>
        <button
          type="button"
          className="component-button"
          onClick={handleNormalize}
          disabled={!lastResultRef.current}
        >
          Normalize
        </button>
      </div>
      {error ? <div className="hint">{error}</div> : null}
      <FieldHelp help={field.help} />
    </div>
  );
}

export function FieldRenderer({ field, params, onPatch, onReplace }) {
  switch (field.type) {
    case "boolean":
      return <BooleanField field={field} params={params} onPatch={onPatch} onReplace={onReplace} />;
    case "number":
      return <NumberField field={field} params={params} onPatch={onPatch} onReplace={onReplace} />;
    case "enum":
      return <EnumField field={field} params={params} onPatch={onPatch} onReplace={onReplace} />;
    case "typedList":
      return <TypedListField field={field} params={params} onPatch={onPatch} onReplace={onReplace} />;
    default:
      return null;
  }
}
