import { parseParenList } from "./parseParenList.js";

function errorResult(message) {
  return { ok: false, error: message || "Failed to parse list." };
}

function isNumericTree(values) {
  if (Array.isArray(values)) {
    return values.every((entry) => isNumericTree(entry));
  }
  return Number.isFinite(values);
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
  if (!isNumericTree(parsed)) {
    return errorResult("Input list JSON must contain only numbers or arrays.");
  }
  return { ok: true, values: parsed, normalizedText: JSON.stringify(parsed) };
}

function parseFlatList(raw) {
  const parts = raw.split(/[\s,]+/).filter(Boolean);
  if (!parts.length) {
    return { ok: true, values: [], normalizedText: "" };
  }
  const values = [];
  for (const part of parts) {
    const parsed = parseTokenToValues(part);
    if (!parsed.ok) return parsed;
    parsed.values.forEach((value) => values.push(value));
  }
  return { ok: true, values, normalizedText: values.join(" ") };
}

export function parseUserList(text) {
  const raw = typeof text === "string" ? text.trim() : "";
  if (!raw) {
    return { ok: true, values: [], normalizedText: "" };
  }
  const firstChar = raw[0];
  if (firstChar === "[") {
    return parseJsonArray(raw);
  }
  if (firstChar === "(") {
    return parseParenList(raw);
  }
  return parseFlatList(raw);
}
