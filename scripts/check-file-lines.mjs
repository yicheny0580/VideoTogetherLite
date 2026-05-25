import { readdir, readFile } from "node:fs/promises";
import path from "node:path";

const maxLines = 400;
const roots = ["apps", "packages", "scripts"];
const extensions = new Set([".js", ".jsx", ".mjs", ".ts", ".tsx"]);
const ignoredDirectories = new Set([
  "coverage",
  "dist",
  "node_modules",
  ".git"
]);

async function collectFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];

  for (const entry of entries) {
    const fullPath = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      if (!ignoredDirectories.has(entry.name)) {
        files.push(...await collectFiles(fullPath));
      }
      continue;
    }

    if (extensions.has(path.extname(entry.name))) {
      files.push(fullPath);
    }
  }

  return files;
}

const files = (await Promise.all(roots.map(collectFiles))).flat();
const failures = [];

for (const file of files) {
  const content = await readFile(file, "utf8");
  const lines = content.split(/\r?\n/).length;
  if (lines > maxLines) {
    failures.push(`${file}: ${lines} lines`);
  }
}

if (failures.length > 0) {
  console.error(`Files must not exceed ${maxLines} lines:\n${failures.join("\n")}`);
  process.exitCode = 1;
}
