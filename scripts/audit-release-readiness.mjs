import { execFile } from "node:child_process";
import { access, readFile } from "node:fs/promises";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const requiredEnvironments = ["beta", "production"];
const requiredWorkflowFiles = [
  ".github/workflows/ci.yml",
  ".github/workflows/backend-image.yml",
  ".github/workflows/deploy-backend.yml",
  ".github/workflows/deployment-smoke.yml",
  ".github/workflows/extension-package.yml",
  ".github/workflows/chrome-web-store.yml"
];
const requiredEnvironmentInputs = [
  "BACKEND_PUBLIC_URL",
  "CADDY_EMAIL",
  "CWS_EXTENSION_ID",
  "CWS_PUBLISHER_ID",
  "CWS_SERVICE_ACCOUNT_JSON",
  "VPS_HOST",
  "VPS_SSH_KEY",
  "VPS_USER"
];

const results = [];

function addResult(name, passed, detail) {
  results.push({ detail, name, passed });
}

async function fileExists(filePath) {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function readText(filePath) {
  return readFile(filePath, "utf8");
}

async function run(command, args) {
  const { stdout } = await execFileAsync(command, args, {
    maxBuffer: 10 * 1024 * 1024
  });
  return stdout.trim();
}

async function runJson(command, args) {
  const output = await run(command, args);
  return JSON.parse(output);
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

function hasRequiredReviewers(environment) {
  return Boolean(environment.protection_rules?.some((rule) => (
    rule.type === "required_reviewers"
    && Array.isArray(rule.reviewers)
    && rule.reviewers.length > 0
  )));
}

async function environmentNames(repo, environmentName, kind) {
  const command = kind === "secret" ? "secret" : "variable";
  const rows = await runJson("gh", [
    command,
    "list",
    "--repo",
    repo,
    "--env",
    environmentName,
    "--json",
    "name"
  ]);
  return new Set((rows ?? []).map((row) => row.name));
}

async function auditEnvironmentInputs(repo, environmentName) {
  let secretNames;
  let variableNames;
  try {
    [secretNames, variableNames] = await Promise.all([
      environmentNames(repo, environmentName, "secret"),
      environmentNames(repo, environmentName, "variable")
    ]);
  } catch (error) {
    addResult(
      `environment inputs are readable: ${environmentName}`,
      false,
      String(error)
    );
    return;
  }

  const missing = requiredEnvironmentInputs.filter((name) => (
    !secretNames.has(name) && !variableNames.has(name)
  ));
  addResult(
    `environment inputs configured: ${environmentName}`,
    missing.length === 0,
    missing.length === 0 ? "all required input names are present" : `missing ${missing.join(", ")}`
  );
}

async function auditWorkflows() {
  for (const workflowFile of requiredWorkflowFiles) {
    addResult(
      `workflow file exists: ${workflowFile}`,
      await fileExists(workflowFile),
      workflowFile
    );
  }

  const deployWorkflow = await readText(".github/workflows/deploy-backend.yml");
  const ciWorkflow = await readText(".github/workflows/ci.yml");
  addResult(
    "CI runs just check",
    /run:\s*just check/.test(ciWorkflow),
    "CI must execute the same check command documented for local verification."
  );
  addResult(
    "backend deploy has environment-scoped concurrency",
    /concurrency:\s*\n\s*group:\s*backend-\$\{\{\s*inputs\.deploy_environment\s*\}\}/.test(deployWorkflow),
    "Deploy workflow should serialize deploys per environment."
  );
  addResult(
    "backend deploy targets GitHub Actions environments",
    /environment:\s*\$\{\{\s*inputs\.deploy_environment\s*\}\}/.test(deployWorkflow),
    "Deploy workflow must bind jobs to beta or production environments."
  );
}

async function auditGitHub(repo) {
  try {
    await run("gh", ["repo", "view", repo, "--json", "nameWithOwner"]);
  } catch (error) {
    addResult("GitHub repository is readable through gh", false, String(error));
    return;
  }

  addResult("GitHub repository is readable through gh", true, repo);

  let environmentsResponse;
  try {
    environmentsResponse = await runJson("gh", ["api", `repos/${repo}/environments`]);
  } catch (error) {
    addResult("GitHub environments API is readable", false, String(error));
    return;
  }

  const environments = new Map(
    (environmentsResponse.environments ?? []).map((environment) => [environment.name, environment])
  );
  for (const environmentName of requiredEnvironments) {
    addResult(
      `GitHub environment exists: ${environmentName}`,
      environments.has(environmentName),
      environmentName
    );
    if (environments.has(environmentName)) {
      await auditEnvironmentInputs(repo, environmentName);
    }
  }

  const production = environments.get("production");
  addResult(
    "production environment has required reviewers",
    production ? hasRequiredReviewers(production) : false,
    "Required reviewers must be configured in GitHub repository settings."
  );
}

async function auditChecklist() {
  const checklist = await readText("docs/pre-release-goals.md");
  const remaining = checklist.match(/^- \[ \] .+$/gm) ?? [];
  addResult(
    "pre-release checklist still tracks external release gates",
    remaining.length > 0,
    `${remaining.length} unchecked item(s) remain.`
  );
}

await auditWorkflows();
await auditGitHub(await repoSlug());
await auditChecklist();

for (const result of results) {
  const marker = result.passed ? "PASS" : "FAIL";
  console.log(`${marker} ${result.name} - ${result.detail}`);
}

const failed = results.filter((result) => !result.passed);
if (failed.length > 0) {
  console.error(`Release readiness audit failed ${failed.length} check(s).`);
  process.exitCode = 1;
}
