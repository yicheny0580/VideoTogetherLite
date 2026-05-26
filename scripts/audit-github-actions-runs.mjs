import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const channel = process.env.RELEASE_CHANNEL ?? "beta";

const requiredRuns = [
  {
    description: "CI just-check workflow passed",
    workflow: "ci.yml"
  },
  {
    description: "Docker and Caddy deployment smoke workflow passed",
    workflow: "deployment-smoke.yml"
  }
];

function addResult(results, name, passed, detail) {
  results.push({ detail, name, passed });
}

async function run(command, args) {
  const { stdout } = await execFileAsync(command, args, {
    maxBuffer: 10 * 1024 * 1024
  });
  return stdout.trim();
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

async function currentSha() {
  return process.env.GITHUB_SHA ?? await run("git", ["rev-parse", "HEAD"]);
}

async function latestRun(repo, workflow, sha) {
  try {
    const response = await runJson("gh", [
      "api",
      `repos/${repo}/actions/workflows/${workflow}/runs`,
      "-f",
      `head_sha=${sha}`,
      "-f",
      "per_page=1"
    ]);
    return { run: response.workflow_runs?.[0] ?? null };
  } catch (error) {
    return { error };
  }
}

async function artifacts(repo, runId) {
  const response = await runJson("gh", [
    "api",
    `repos/${repo}/actions/runs/${runId}/artifacts`,
    "-f",
    "per_page=100"
  ]);
  return response.artifacts ?? [];
}

function runPassed(run) {
  return run?.status === "completed" && run.conclusion === "success";
}

const repo = await repoSlug();
const sha = await currentSha();
const shortSha = sha.slice(0, 7);
const results = [];

for (const requiredRun of requiredRuns) {
  const { error, run: runRow } = await latestRun(repo, requiredRun.workflow, sha);
  addResult(
    results,
    requiredRun.description,
    !error && runPassed(runRow),
    error
      ? `${requiredRun.workflow} is not readable for ${sha}: ${error.message}`
      : runRow
      ? `${requiredRun.workflow} run ${runRow.id}: ${runRow.status}/${runRow.conclusion}`
      : `No ${requiredRun.workflow} run found for ${sha}`
  );
}

const { error: extensionError, run: extensionRun } = await latestRun(repo, "extension-package.yml", sha);
addResult(
  results,
  `${channel} extension package workflow passed`,
  !extensionError && runPassed(extensionRun),
  extensionError
    ? `extension-package.yml is not readable for ${sha}: ${extensionError.message}`
    : extensionRun
    ? `extension-package.yml run ${extensionRun.id}: ${extensionRun.status}/${extensionRun.conclusion}`
    : `No extension-package.yml run found for ${sha}`
);

if (extensionRun) {
  const artifactRows = await artifacts(repo, extensionRun.id);
  const expectedPrefix = `videotogether-lite-${channel}-`;
  const matchingArtifact = artifactRows.find((artifact) => (
    artifact.name.startsWith(expectedPrefix) && artifact.name.endsWith(`-${shortSha}`)
  ));
  addResult(
    results,
    `${channel} extension artifact includes channel, version, and SHA`,
    Boolean(matchingArtifact),
    matchingArtifact
      ? matchingArtifact.name
      : `Expected artifact prefix ${expectedPrefix} and suffix -${shortSha}`
  );
}

for (const result of results) {
  const marker = result.passed ? "PASS" : "FAIL";
  console.log(`${marker} ${result.name} - ${result.detail}`);
}

const failed = results.filter((result) => !result.passed);
if (failed.length > 0) {
  console.error(`GitHub Actions run audit failed ${failed.length} check(s).`);
  process.exitCode = 1;
}
