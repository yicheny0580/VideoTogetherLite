import { readdir, readFile } from "node:fs/promises";
import path from "node:path";

const roots = ["README.MD", "README_zh.MD", "apps/server/README.md", "docs"];
const ignoredFiles = new Set(["docs/pre-release-goals.md"]);
const blockedPatterns = [
  { pattern: /\bVideoTogether\/VideoTogether\b/i, reason: "old upstream repo URL" },
  { pattern: /\bfork\b/i, reason: "fork-era wording" },
  { pattern: /vt\.panghair\.com/i, reason: "old backend host" },
  { pattern: /Easy Share/i, reason: "removed legacy feature claim" },
  { pattern: /Safari|Firefox/i, reason: "removed browser support claim" },
  { pattern: /语音|文字聊天|网页代理/i, reason: "removed legacy feature claim" }
];

async function collectMarkdownFiles(entryPath) {
  const stat = await import("node:fs/promises").then((fs) => fs.stat(entryPath));
  if (stat.isFile()) return [entryPath];

  const entries = await readdir(entryPath, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const fullPath = path.join(entryPath, entry.name);
    if (entry.isDirectory()) {
      files.push(...await collectMarkdownFiles(fullPath));
    } else if (entry.name.endsWith(".md") || entry.name.endsWith(".MD")) {
      files.push(fullPath);
    }
  }
  return files;
}

const files = (await Promise.all(roots.map(collectMarkdownFiles)))
  .flat()
  .filter((file) => !ignoredFiles.has(file));
const failures = [];

for (const file of files) {
  const content = await readFile(file, "utf8");
  for (const { pattern, reason } of blockedPatterns) {
    if (pattern.test(content)) {
      failures.push(`${file}: ${reason}`);
    }
  }
}

if (failures.length > 0) {
  console.error(`Stale release wording found:\n${failures.join("\n")}`);
  process.exitCode = 1;
}
