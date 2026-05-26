import { readFile } from "node:fs/promises";

const manifestPath = process.argv[2];
const statusPath = process.argv[3];

if (!manifestPath || !statusPath) {
  console.error("Usage: node scripts/compare-extension-version.mjs <manifest.json> <cws-status.json>");
  process.exit(1);
}

function parseVersion(version) {
  if (typeof version !== "string" || !/^\d+(\.\d+){0,3}$/.test(version)) {
    throw new Error(`Invalid Chrome extension version: ${version}`);
  }
  return version.split(".").map((part) => Number.parseInt(part, 10));
}

function compareVersions(left, right) {
  const a = parseVersion(left);
  const b = parseVersion(right);
  for (let i = 0; i < 4; i += 1) {
    const diff = (a[i] ?? 0) - (b[i] ?? 0);
    if (diff !== 0) return diff;
  }
  return 0;
}

function collectVersions(status) {
  const revisions = [
    status.publishedItemRevisionStatus,
    status.submittedItemRevisionStatus
  ].filter(Boolean);

  return revisions.flatMap((revision) => (
    revision.distributionChannels ?? []
  )).map((channel) => channel.crxVersion).filter(Boolean);
}

const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
const status = JSON.parse(await readFile(statusPath, "utf8"));
const currentVersions = collectVersions(status);

if (currentVersions.length === 0) {
  console.log("No published or submitted Chrome Web Store version found.");
  process.exit(0);
}

const newestVersion = currentVersions.toSorted(compareVersions).at(-1);
if (compareVersions(manifest.version, newestVersion) <= 0) {
  console.error(`Manifest version ${manifest.version} must be greater than Chrome Web Store version ${newestVersion}.`);
  process.exit(1);
}

console.log(`Manifest version ${manifest.version} is greater than Chrome Web Store version ${newestVersion}.`);
