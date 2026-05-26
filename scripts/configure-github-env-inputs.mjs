import { execFile, spawn } from "node:child_process";
import { readFile } from "node:fs/promises";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const defaultEnvironments = ["beta", "production"];
const targetEnvironments = (process.env.TARGET_ENVIRONMENTS ?? defaultEnvironments.join(","))
  .split(",")
  .map((value) => value.trim())
  .filter(Boolean);

const variableInputs = [
  "ALLOWED_ORIGINS",
  "BACKEND_PUBLIC_URL",
  "CADDY_EMAIL",
  "CWS_EXTENSION_ID",
  "CWS_PUBLISHER_ID",
  "ROOM_TTL"
];
const secretInputs = [
  "CWS_CLIENT_ID",
  "CWS_CLIENT_SECRET",
  "CWS_REFRESH_TOKEN",
  "VPS_HOST",
  "VPS_SSH_KEY",
  "VPS_USER"
];
const optionalInputs = new Set(["ALLOWED_ORIGINS", "ROOM_TTL"]);

function delay(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

async function run(command, args) {
  const { stdout } = await execFileAsync(command, args, {
    maxBuffer: 10 * 1024 * 1024,
    timeout: 30_000
  });
  return stdout.trim();
}

async function repoSlug() {
  const configuredRepo = process.env.GITHUB_REPOSITORY;
  if (configuredRepo) {
    return configuredRepo;
  }
  const remote = await run("git", ["remote", "get-url", "origin"]);
  const match = /github\.com[:/]([^/]+\/[^/.]+)(?:\.git)?$/.exec(remote.trim());
  if (!match) {
    throw new Error(`Could not derive GitHub repository from origin: ${remote}`);
  }
  return match[1];
}

function parseDotenv(content) {
  const values = new Map();
  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (line === "" || line.startsWith("#")) {
      continue;
    }
    const equals = line.indexOf("=");
    if (equals <= 0) {
      continue;
    }
    const key = line.slice(0, equals).trim();
    let value = line.slice(equals + 1).trim();
    if (
      (value.startsWith("\"") && value.endsWith("\""))
      || (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    values.set(key, value.replaceAll("\\n", "\n"));
  }
  return values;
}

async function loadFileValues() {
  if (!process.env.RELEASE_INPUTS_FILE) {
    return new Map();
  }
  return parseDotenv(await readFile(process.env.RELEASE_INPUTS_FILE, "utf8"));
}

function inputValue(fileValues, environmentName, inputName) {
  const prefix = environmentName.toUpperCase().replaceAll("-", "_");
  return fileValues.get(`${prefix}_${inputName}`)
    ?? process.env[`${prefix}_${inputName}`]
    ?? fileValues.get(inputName)
    ?? process.env[inputName]
    ?? "";
}

function setGhValue(kind, repo, environmentName, name, value) {
  return new Promise((resolve, reject) => {
    const child = spawn("gh", [
      kind,
      "set",
      name,
      "--repo",
      repo,
      "--env",
      environmentName
    ], {
      stdio: ["pipe", "pipe", "pipe"]
    });
    let stderr = "";
    child.stderr.setEncoding("utf8");
    child.stderr.on("data", (chunk) => {
      stderr += chunk;
    });
    child.once("error", reject);
    child.once("exit", (code) => {
      if (code === 0) {
        resolve();
        return;
      }
      reject(new Error(`gh ${kind} set ${name} --env ${environmentName} exited with ${code}: ${stderr.trim()}`));
    });
    child.stdin.end(value);
  });
}

async function setWithRetry(kind, repo, environmentName, name, value) {
  let lastError;
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    try {
      await setGhValue(kind, repo, environmentName, name, value);
      return;
    } catch (error) {
      lastError = error;
      if (attempt < 3) {
        await delay(attempt * 1000);
      }
    }
  }
  throw lastError;
}

const repo = await repoSlug();
const fileValues = await loadFileValues();
let missingCount = 0;

for (const environmentName of targetEnvironments) {
  for (const inputName of variableInputs) {
    const value = inputValue(fileValues, environmentName, inputName);
    if (value === "") {
      if (!optionalInputs.has(inputName)) {
        console.error(`Missing ${environmentName.toUpperCase()}_${inputName} or ${inputName}.`);
        missingCount += 1;
      }
      continue;
    }
    await setWithRetry("variable", repo, environmentName, inputName, value);
    console.log(`Set environment variable ${inputName} for ${environmentName}.`);
  }

  for (const inputName of secretInputs) {
    const value = inputValue(fileValues, environmentName, inputName);
    if (value === "") {
      console.error(`Missing ${environmentName.toUpperCase()}_${inputName} or ${inputName}.`);
      missingCount += 1;
      continue;
    }
    await setWithRetry("secret", repo, environmentName, inputName, value);
    console.log(`Set environment secret ${inputName} for ${environmentName}.`);
  }
}

if (missingCount > 0) {
  console.error(`Missing ${missingCount} required environment input value(s).`);
  process.exitCode = 1;
}
