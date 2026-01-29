import { assertNumericTree } from "./invariants.js";

function errorResult(message) {
  return { ok: false, error: message || "Failed to parse list." };
}

function assertValues(values) {
  try {
    assertNumericTree(values, "parseUserList");
  } catch (error) {
    return errorResult(error && error.message ? error.message : "Invalid numeric list.");
  }
  return null;
}

function parseJsonArray(raw) {
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch (error) {
    const details = error && error.message ? ` ${error.message}` : "";
    return errorResult(`Input list JSON parse failed.${details}`);
  }
  if (!Array.isArray(parsed)) {
    return errorResult("Input list JSON must be an array.");
  }
  const err = assertValues(parsed);
  if (err) return err;
  return { ok: true, values: parsed, normalizedText: JSON.stringify(parsed) };
}

function tokenizeLisp(raw) {
  const tokens = [];
  let cursor = 0;
  while (cursor < raw.length) {
    const char = raw[cursor];
    if (/\s/.test(char)) {
      cursor += 1;
      continue;
    }
    if (char === "(" || char === ")") {
      tokens.push(char);
      cursor += 1;
      continue;
    }
    let end = cursor;
    while (end < raw.length && !/\s/.test(raw[end]) && raw[end] !== "(" && raw[end] !== ")") {
      end += 1;
    }
    tokens.push(raw.slice(cursor, end));
    cursor = end;
  }
  return tokens;
}

function parseLispList(raw) {
  const tokens = tokenizeLisp(raw);
  let index = 0;

  function parseValue() {
    if (index >= tokens.length) {
      return errorResult("Unexpected end of list.");
    }
    const token = tokens[index];
    index += 1;
    if (token === "(") {
      const items = [];
      while (index < tokens.length && tokens[index] !== ")") {
        const parsed = parseValue();
        if (!parsed.ok) return parsed;
        items.push(parsed.value);
      }
      if (tokens[index] !== ")") {
        return errorResult("Missing closing ')'.");
      }
      index += 1;
      return { ok: true, value: items };
    }
    if (token === ")") {
      return errorResult("Unexpected ')'.");
    }
    const numberValue = Number(token);
    if (!Number.isFinite(numberValue)) {
      return errorResult(`Invalid number "${token}".`);
    }
    return { ok: true, value: numberValue };
  }

  if (!tokens.length) {
    return { ok: true, values: [], normalizedText: "" };
  }
  if (tokens[0] !== "(") {
    return errorResult("Lisp list must start with '('.");
  }

  const parsed = parseValue();
  if (!parsed.ok) return parsed;
  if (!Array.isArray(parsed.value)) {
    return errorResult("Lisp input must be a list.");
  }
  if (index < tokens.length) {
    return errorResult("Unexpected tokens after list.");
  }
  const err = assertValues(parsed.value);
  if (err) return err;
  return { ok: true, values: parsed.value, normalizedText: JSON.stringify(parsed.value) };
}

function parseFlatList(raw) {
  const parts = raw.split(/[,\s]+/).filter(Boolean);
  if (!parts.length) {
    return { ok: true, values: [], normalizedText: "" };
  }
  const values = [];
  for (const part of parts) {
    const numberValue = Number(part);
    if (!Number.isFinite(numberValue)) {
      return errorResult(`Invalid number "${part}".`);
    }
    values.push(numberValue);
  }
  const err = assertValues(values);
  if (err) return err;
  return { ok: true, values, normalizedText: values.join(" ") };
}

export function parseUserList(text, parseMode = "auto") {
  const raw = typeof text === "string" ? text.trim() : "";
  if (!raw) {
    return { ok: true, values: [], normalizedText: "" };
  }

  const mode = typeof parseMode === "string" ? parseMode : "auto";
  if (mode === "nested" || mode === "json") {
    return parseJsonArray(raw);
  }
  if (mode === "flat") {
    return parseFlatList(raw);
  }
  if (mode === "lisp") {
    return parseLispList(raw);
  }

  if (raw[0] === "[") {
    return parseJsonArray(raw);
  }
  if (raw[0] === "(") {
    return parseLispList(raw);
  }
  return parseFlatList(raw);
}
