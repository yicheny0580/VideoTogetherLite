import { readFile } from "node:fs/promises";
import path from "node:path";

const distDir = process.argv[2] ?? "apps/extension/dist";
const expectedHost = process.argv[3] ?? "";
const manifestPath = path.join(distDir, "manifest.json");

function fail(message) {
  console.error(message);
  process.exitCode = 1;
}

function requireString(value, name) {
  if (typeof value !== "string" || value.trim() === "") {
    fail(`${name} must be a non-empty string.`);
  }
}

function requireArray(value, name) {
  if (!Array.isArray(value) || value.length === 0) {
    fail(`${name} must be a non-empty array.`);
    return [];
  }
  return value;
}

const manifest = JSON.parse(await readFile(manifestPath, "utf8"));

if (manifest.manifest_version !== 3) {
  fail("manifest_version must be 3.");
}
requireString(manifest.name, "name");
requireString(manifest.description, "description");
requireString(manifest.version, "version");

const permissions = new Set(manifest.permissions ?? []);
for (const permission of permissions) {
  if (!["activeTab", "storage"].includes(permission)) {
    fail(`Unexpected permission: ${permission}`);
  }
}
if (manifest.host_permissions !== undefined) {
  fail("host_permissions must stay empty unless release docs are updated.");
}

const contentScripts = requireArray(manifest.content_scripts, "content_scripts");
if (!contentScripts.some((script) => (
  script.all_frames === true
  && script.js?.includes("content.js")
  && script.matches?.includes("<all_urls>")
))) {
  fail("content_scripts must load content.js on <all_urls> in all frames.");
}

const resources = requireArray(manifest.web_accessible_resources, "web_accessible_resources");
if (!resources.some((entry) => (
  entry.matches?.includes("<all_urls>")
  && entry.resources?.includes("page.js")
))) {
  fail("page.js must be web-accessible on <all_urls>.");
}

if (manifest.action?.default_popup !== "popup.html") {
  fail("action.default_popup must point to popup.html.");
}

const pageBundle = await readFile(path.join(distDir, "page.js"), "utf8");
if (pageBundle.includes("https://vt.panghair.com:5000")) {
  fail("Built package still contains the stale vt.panghair.com backend.");
}
if (expectedHost !== "" && !pageBundle.includes(expectedHost)) {
  fail(`Built package does not contain expected backend host: ${expectedHost}`);
}
