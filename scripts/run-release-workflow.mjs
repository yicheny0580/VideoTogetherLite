import { execFile, spawn } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const validChannels = new Set(["beta", "production"]);
const validPublishTypes = new Set(["STAGED_PUBLISH", "DEFAULT_PUBLISH", "upload_only"]);
const defaultSteps = ["ci", "deployment-smoke", "backend-image", "deploy-backend", "extension-package"];
const stepAliases = new Map([
  ["backend", "backend-image"],
  ["build-image", "backend-image"],
  ["cws", "chrome-web-store"],
  ["deploy", "deploy-backend"],
  ["extension", "extension-package"],
  ["image", "backend-image"],
  ["package", "extension-package"],
  ["smoke", "deployment-smoke"],
  ["store", "chrome-web-store"]
]);
const workflows = new Map([
  ["ci", "ci.yml"],
  ["deployment-smoke", "deployment-smoke.yml"],
  ["backend-image", "backend-image.yml"],
  ["deploy-backend", "deploy-backend.yml"],
  ["extension-package", "extension-package.yml"],
  ["chrome-web-store", "chrome-web-store.yml"]
]);

function usage() {
  console.log(`Usage: node scripts/run-release-workflow.mjs [options] [step ...]

Steps:
  ci deployment-smoke backend-image deploy-backend extension-package chrome-web-store

Environment:
  RELEASE_CHANNEL       beta or production. Defaults to beta.
  RELEASE_REF           Remote branch or tag to dispatch. Defaults to current branch.
  IMAGE_TAG             Backend image tag for deploy. Defaults to v* ref or sha-<short sha>.
  CWS_PUBLISH_TYPE      STAGED_PUBLISH, DEFAULT_PUBLISH, or upload_only. Defaults to upload_only.
  RELEASE_STEPS         Comma-separated steps when no CLI steps are given.
  RELEASE_DRY_RUN=1     Print gh commands without dispatching.
  RELEASE_WATCH=0       Dispatch workflows without watching them.

Examples:
  RELEASE_DRY_RUN=1 just run-release-workflow
  RELEASE_CHANNEL=beta IMAGE_TAG=sha-abcdef0 just run-release-workflow backend-image deploy-backend
  RELEASE_CHANNEL=production RELEASE_REF=v3.0.23 just run-release-workflow backend-image deploy-backend
`);
}

function parseArgs(argv) {
  const steps = [];
  let dryRun = process.env.RELEASE_DRY_RUN === "1";
  let watch = process.env.RELEASE_WATCH !== "0";

  for (const arg of argv) {
    if (arg === "--help" || arg === "-h") {
      usage();
      process.exit(0);
    }
    if (arg === "--dry-run") {
      dryRun = true;
      continue;
    }
    if (arg === "--no-watch") {
      watch = false;
      continue;
    }
    steps.push(...arg.split(",").map((value) => value.trim()).filter(Boolean));
  }

  if (steps.length === 0 && process.env.RELEASE_STEPS) {
    steps.push(...process.env.RELEASE_STEPS.split(",").map((value) => value.trim()).filter(Boolean));
  }

  return {
    dryRun,
    steps: steps.length > 0 ? steps : defaultSteps,
    watch
  };
}

function normalizeStep(step) {
  const withoutExtension = step.endsWith(".yml") ? step.slice(0, -4) : step;
  const normalized = stepAliases.get(withoutExtension) ?? withoutExtension;
  if (!workflows.has(normalized)) {
    throw new Error(`Unknown release workflow step: ${step}`);
  }
  return normalized;
}

function shellQuote(value) {
  if (/^[A-Za-z0-9_./:@=-]+$/.test(value)) {
    return value;
  }
  return `'${value.replaceAll("'", "'\\''")}'`;
}

async function run(command, args) {
  try {
    const { stdout } = await execFileAsync(command, args, {
      maxBuffer: 10 * 1024 * 1024
    });
    return stdout.trim();
  } catch (error) {
    const detail = error.stderr?.trim() || error.message;
    throw new Error(`${command} ${args.join(" ")} failed: ${detail}`, { cause: error });
  }
}

function runLive(command, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      stdio: "inherit"
    });
    child.once("error", reject);
    child.once("exit", (code) => {
      if (code === 0) {
        resolve();
        return;
      }
      reject(new Error(`${command} ${args.join(" ")} exited with ${code}`));
    });
  });
}

async function runJson(command, args) {
  const output = await run(command, args);
  return output === "" ? null : JSON.parse(output);
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

async function currentRef() {
  if (process.env.RELEASE_REF) {
    return process.env.RELEASE_REF;
  }
  const branch = await run("git", ["branch", "--show-current"]);
  if (branch !== "") {
    return branch;
  }
  return run("git", ["rev-parse", "HEAD"]);
}

async function currentSha() {
  return process.env.GITHUB_SHA ?? await run("git", ["rev-parse", "HEAD"]);
}

function refName(ref) {
  return ref.replace(/^refs\/heads\//, "").replace(/^refs\/tags\//, "");
}

function defaultImageTag(ref, sha) {
  const cleanRef = refName(ref);
  if (/^v\d/.test(cleanRef)) {
    return cleanRef;
  }
  return `sha-${sha.slice(0, 7)}`;
}

function workflowInputs(step, context) {
  switch (step) {
  case "backend-image":
    return context.passImageTagInput ? { image_tag: context.imageTag } : {};
  case "deploy-backend":
    return {
      deploy_environment: context.channel,
      image_tag: context.imageTag
    };
  case "extension-package":
    return { channel: context.channel };
  case "chrome-web-store":
    return {
      channel: context.channel,
      publish_type: context.publishType
    };
  default:
    return {};
  }
}

function workflowRunArgs(repo, workflow, ref, inputs) {
  const args = ["workflow", "run", workflow, "--repo", repo, "--ref", ref];
  for (const [key, value] of Object.entries(inputs)) {
    args.push("-f", `${key}=${value}`);
  }
  return args;
}

async function latestWorkflowRun(repo, workflow, sinceMs) {
  const rows = await runJson("gh", [
    "run",
    "list",
    "--repo",
    repo,
    "--workflow",
    workflow,
    "--event",
    "workflow_dispatch",
    "--limit",
    "20",
    "--json",
    "databaseId,status,conclusion,createdAt,url,headSha,headBranch,displayTitle"
  ]);
  return (rows ?? [])
    .filter((row) => Date.parse(row.createdAt) >= sinceMs - 5_000)
    .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt))[0] ?? null;
}

async function waitForRun(repo, workflow, sinceMs) {
  const deadline = Date.now() + 60_000;
  while (Date.now() < deadline) {
    const runRow = await latestWorkflowRun(repo, workflow, sinceMs);
    if (runRow) {
      return runRow;
    }
    await new Promise((resolve) => {
      setTimeout(resolve, 2_000);
    });
  }
  throw new Error(`Timed out waiting for ${workflow} run to appear in GitHub Actions.`);
}

async function dispatchStep(step, context) {
  const workflow = workflows.get(step);
  const inputs = workflowInputs(step, context);
  const args = workflowRunArgs(context.repo, workflow, context.ref, inputs);
  console.log(`Dispatching ${workflow} on ${context.ref}.`);

  if (context.dryRun) {
    console.log(`DRY RUN gh ${args.map(shellQuote).join(" ")}`);
    return;
  }

  const sinceMs = Date.now();
  await run("gh", args);
  const runRow = await waitForRun(context.repo, workflow, sinceMs);
  console.log(`Run ${runRow.databaseId}: ${runRow.url}`);

  if (runRow.headSha && runRow.headSha !== context.sha) {
    console.warn(`Run head SHA is ${runRow.headSha}; local SHA is ${context.sha}.`);
  }

  if (context.watch) {
    await runLive("gh", ["run", "watch", String(runRow.databaseId), "--repo", context.repo, "--exit-status"]);
  }
}

const { dryRun, steps, watch } = parseArgs(process.argv.slice(2));
const channel = process.env.RELEASE_CHANNEL ?? "beta";
const publishType = process.env.CWS_PUBLISH_TYPE ?? "upload_only";

if (!validChannels.has(channel)) {
  throw new Error(`RELEASE_CHANNEL must be one of ${[...validChannels].join(", ")}.`);
}
if (!validPublishTypes.has(publishType)) {
  throw new Error(`CWS_PUBLISH_TYPE must be one of ${[...validPublishTypes].join(", ")}.`);
}

const ref = await currentRef();
const sha = await currentSha();
const context = {
  channel,
  dryRun,
  imageTag: process.env.IMAGE_TAG ?? defaultImageTag(ref, sha),
  passImageTagInput: Boolean(process.env.IMAGE_TAG) || /^v\d/.test(refName(ref)),
  publishType,
  ref,
  repo: process.env.RELEASE_REPO ?? await repoSlug(),
  sha,
  watch
};
const normalizedSteps = steps.map(normalizeStep);

console.log(`Release channel: ${context.channel}`);
console.log(`GitHub repo: ${context.repo}`);
console.log(`Release ref: ${context.ref}`);
console.log(`Backend image tag: ${context.imageTag}`);
console.log(`Steps: ${normalizedSteps.join(", ")}`);

for (const step of normalizedSteps) {
  await dispatchStep(step, context);
}
