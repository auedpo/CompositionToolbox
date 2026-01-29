// Purpose: parseParenList.js provides exports: parseParenList.
// Interacts with: no imports.
// Role: UI layer module within the broader app graph.
function errorResult(message) {
  return { ok: false, error: message || "Failed to parse list." };
}

function isNumberToken(token) {
  return /^[+-]?(?:\d+(?:\.\d+)?|\.\d+)(?:e[+-]?\d+)?$/i.test(token);
}

function parseNumber(token) {
  if (!isNumberToken(token)) return null;
  const value = Number(token);
  return Number.isFinite(value) ? value : null;
}

function expandRange(token) {
  const parts = token.split("..");
  if (parts.length !== 2 || !parts[0] || !parts[1]) {
    return errorResult(`Invalid range "${token}".`);
  }
  const start = parseNumber(parts[0]);
  const end = parseNumber(parts[1]);
  if (!Number.isFinite(start) || !Number.isFinite(end)) {
    return errorResult(`Invalid range bounds in "${token}".`);
  }
  if (!Number.isInteger(start) || !Number.isInteger(end)) {
    return errorResult("Range bounds must be integers.");
  }
  const step = start <= end ? 1 : -1;
  const values = [];
  for (let value = start; step > 0 ? value <= end : value >= end; value += step) {
    values.push(value);
  }
  return { ok: true, values };
}

function expandRepeat(token) {
  const match = token.match(/^([+-]?(?:\d+(?:\.\d+)?|\.\d+)(?:e[+-]?\d+)?)\s*([*xX])\s*([+-]?\d+)$/);
  if (!match) {
    return errorResult(`Invalid repeat token "${token}".`);
  }
  const value = Number(match[1]);
  const count = Number(match[3]);
  if (!Number.isFinite(value)) {
    return errorResult(`Invalid repeat value in "${token}".`);
  }
  if (!Number.isInteger(count) || count < 0) {
    return errorResult("Repeat count must be an integer >= 0.");
  }
  return { ok: true, values: Array(count).fill(value) };
}

function parseTokenToValues(token) {
  if (token.includes("..")) {
    if (token.split("..").length !== 2) {
      return errorResult(`Invalid range "${token}".`);
    }
    return expandRange(token);
  }
  if (token.includes("*") || token.includes("x") || token.includes("X")) {
    return expandRepeat(token);
  }
  const value = parseNumber(token);
  if (!Number.isFinite(value)) {
    return errorResult(`Invalid number "${token}".`);
  }
  return { ok: true, values: [value] };
}

function tokenizeParen(raw) {
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

function isNumericTree(values) {
  if (Array.isArray(values)) {
    return values.every((entry) => isNumericTree(entry));
  }
  return Number.isFinite(values);
}

export function parseParenList(text) {
  const raw = typeof text === "string" ? text.trim() : "";
  if (!raw) {
    return { ok: true, values: [], normalizedText: "" };
  }
  const tokens = tokenizeParen(raw);
  if (!tokens.length) {
    return { ok: true, values: [], normalizedText: "" };
  }
  let index = 0;

  function parseList() {
    if (tokens[index] !== "(") {
      return errorResult("Paren list must start with '('.");
    }
    index += 1;
    const items = [];
    while (index < tokens.length && tokens[index] !== ")") {
      const token = tokens[index];
      if (token === "(") {
        const parsed = parseList();
        if (!parsed.ok) return parsed;
        items.push(parsed.values);
        continue;
      }
      if (token === ")") {
        return errorResult("Unexpected ')'.");
      }
      index += 1;
      const parsed = parseTokenToValues(token);
      if (!parsed.ok) return parsed;
      parsed.values.forEach((value) => items.push(value));
    }
    if (tokens[index] !== ")") {
      return errorResult("Missing closing ')'.");
    }
    index += 1;
    return { ok: true, values: items };
  }

  const parsed = parseList();
  if (!parsed.ok) return parsed;
  if (index < tokens.length) {
    return errorResult("Unexpected tokens after list.");
  }
  if (!isNumericTree(parsed.values)) {
    return errorResult("Invalid numeric list.");
  }
  const hasNested = parsed.values.some((value) => Array.isArray(value));
  return {
    ok: true,
    values: parsed.values,
    normalizedText: hasNested ? JSON.stringify(parsed.values) : parsed.values.join(" ")
  };
}
