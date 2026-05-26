import { execFile, spawn } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const requiredEnvironments = ["beta", "production"];
const ghRetries = Number.parseInt(process.env.GH_RETRIES ?? "3", 10);
const ghTimeoutMs = Number.parseInt(process.env.GH_TIMEOUT_MS ?? "30000", 10);

function delay(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

async function run(command, args, options = {}) {
  let lastError;
  const attempts = command === "gh" ? ghRetries : 1;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      if (options.input !== undefined) {
        return await runWithInput(command, args, options.input);
      }
      const { stdout } = await execFileAsync(command, args, {
        maxBuffer: 10 * 1024 * 1024,
        timeout: command === "gh" ? ghTimeoutMs : undefined
      });
      return stdout.trim();
    } catch (error) {
      lastError = error;
      if (attempt < attempts) {
        await delay(1000 * attempt);
      }
    }
  }
  throw lastError;
}

function runWithInput(command, args, input) {
  return new Promise((resolve, reject) => {
    let settled = false;
    let stdout = "";
    let stderr = "";
    const child = spawn(command, args, {
      stdio: ["pipe", "pipe", "pipe"]
    });
    const timeout = command === "gh"
      ? setTimeout(() => {
        if (settled) {
          return;
        }
        settled = true;
        child.kill("SIGTERM");
        reject(new Error(`${command} ${args.join(" ")} timed out after ${ghTimeoutMs}ms`));
      }, ghTimeoutMs)
      : null;

    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk) => {
      stdout += chunk;
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk;
    });
    child.once("error", (error) => {
      if (settled) {
        return;
      }
      settled = true;
      if (timeout) {
        clearTimeout(timeout);
      }
      reject(error);
    });
    child.once("exit", (code) => {
      if (settled) {
        return;
      }
      settled = true;
      if (timeout) {
        clearTimeout(timeout);
      }
      if (code === 0) {
        resolve(stdout.trim());
        return;
      }
      reject(new Error(`${command} ${args.join(" ")} exited with ${code}: ${stderr.trim()}`));
    });

    child.stdin.end(input);
  });
}

async function runJson(command, args, options = {}) {
  const output = await run(command, args, options);
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

async function authenticatedLogin() {
  return run("gh", ["api", "user", "--jq", ".login"]);
}

async function userId(login) {
  return run("gh", ["api", `users/${login}`, "--jq", ".id"]);
}

async function putEnvironment(repo, name, body) {
  await runJson("gh", [
    "api",
    "--method",
    "PUT",
    `repos/${repo}/environments/${name}`,
    "--input",
    "-"
  ], {
    input: JSON.stringify(body)
  });
}

const repo = await repoSlug();
const productionReviewer = process.env.PRODUCTION_REVIEWER || await authenticatedLogin();
const productionReviewerId = Number(await userId(productionReviewer));

for (const environment of requiredEnvironments) {
  const body = environment === "production"
    ? {
      deployment_branch_policy: null,
      reviewers: [{
        id: productionReviewerId,
        type: "User"
      }],
      wait_timer: 0
    }
    : {};

  await putEnvironment(repo, environment, body);
  const reviewerMessage = environment === "production"
    ? ` with required reviewer ${productionReviewer}`
    : "";
  console.log(`Configured GitHub environment ${environment}${reviewerMessage}.`);
}
