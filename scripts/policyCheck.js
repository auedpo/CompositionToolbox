import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const SRC_DIR = path.join(ROOT, "src");
const AGENTS_PATH = path.join(ROOT, "AGENTS.md");

const violations = [];
const warnings = [];

function collectFiles(dir) {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  const out = [];
  for (const entry of entries) {
    if (entry.name === "node_modules" || entry.name === ".git") continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      out.push(...collectFiles(full));
    } else if (entry.isFile() && entry.name.endsWith(".js")) {
      out.push(full);
    }
  }
  return out;
}

function readText(filePath) {
  return fs.readFileSync(filePath, "utf8");
}

function rel(filePath) {
  return path.relative(ROOT, filePath);
}

function checkAgents() {
  if (!fs.existsSync(AGENTS_PATH)) {
    violations.push("Missing AGENTS.md at repo root.");
  }
}

const uiImportPattern = /from\s+["'][^"']*(?:\\|\/)ui(?:\\|\/)/;
const uiRequirePattern = /require\(["'][^"']*(?:\\|\/)ui(?:\\|\/)/;
const reactImportPattern = /from\s+["']react(?:-dom)?["']/;
const reactRequirePattern = /require\(["']react(?:-dom)?["']\)/;

function checkForbiddenImports(files, kindLabel) {
  for (const file of files) {
    const text = readText(file);
    if (uiImportPattern.test(text) || uiRequirePattern.test(text)) {
      violations.push(`${kindLabel} imports from src/ui: ${rel(file)}`);
    }
    if (reactImportPattern.test(text) || reactRequirePattern.test(text)) {
      violations.push(`${kindLabel} imports React libraries: ${rel(file)}`);
    }
  }
}

function checkDraftConstructors(files) {
  const ignore = new Set([
    path.join(SRC_DIR, "core", "invariants.js"),
    path.join(SRC_DIR, "lenses", "lensRuntime.js"),
    path.join(SRC_DIR, "core", "lensHost.js")
  ]);
  const draftIdPattern = /\bdraftId\s*:/;
  for (const file of files) {
    if (ignore.has(file)) continue;
    const text = readText(file);
    if (draftIdPattern.test(text) && !/\bmakeDraft\b/.test(text)) {
      violations.push(`Possible ad-hoc Draft literal (missing makeDraft): ${rel(file)}`);
    }
  }
}

checkAgents();

if (fs.existsSync(SRC_DIR)) {
  const allFiles = collectFiles(SRC_DIR);
  const coreFiles = allFiles.filter((file) => file.includes(`${path.sep}core${path.sep}`));
  const lensFiles = allFiles.filter((file) => file.includes(`${path.sep}lenses${path.sep}`));
  const draftAuthorFiles = [...new Set([...coreFiles, ...lensFiles])];

  checkForbiddenImports(coreFiles, "Core module");
  checkForbiddenImports(lensFiles, "Lens module");
  checkDraftConstructors(draftAuthorFiles);
}

if (violations.length) {
  console.error("Policy check failed:");
  violations.forEach((msg) => console.error(`- ${msg}`));
  process.exitCode = 1;
}

if (warnings.length) {
  console.warn("Policy check warnings:");
  warnings.forEach((msg) => console.warn(`- ${msg}`));
}

if (!violations.length) {
  console.log("Policy check ok");
}
