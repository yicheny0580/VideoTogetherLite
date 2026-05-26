import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";

const previousImage = process.env.ROLLBACK_PREVIOUS_IMAGE ?? "videotogetherlite-server:rollback-previous";
const currentImage = process.env.ROLLBACK_CURRENT_IMAGE ?? "videotogetherlite-server:rollback-current";
const hostPort = process.env.ROLLBACK_CADDY_PORT ?? "18082";
const backendUrl = `http://127.0.0.1:${hostPort}`;
const projectName = `vtl-rollback-${Date.now()}`;
const commandTimeoutMs = Number.parseInt(process.env.ROLLBACK_COMMAND_TIMEOUT_MS ?? "120000", 10);
const previousExtensionHost = process.env.ROLLBACK_PREVIOUS_EXTENSION_HOST ?? "https://rollback-previous.example.com";
const currentExtensionHost = process.env.ROLLBACK_CURRENT_EXTENSION_HOST ?? "https://rollback-current.example.com";

function run(command, args, options = {}) {
  return new Promise((resolve, reject) => {
    let settled = false;
    let stdout = "";
    const child = spawn(command, args, {
      cwd: options.cwd ?? process.cwd(),
      env: { ...process.env, ...options.env },
      stdio: options.stdio ?? "inherit"
    });
    child.stdout?.setEncoding("utf8");
    child.stdout?.on("data", (chunk) => {
      stdout += chunk;
    });
    const timeout = setTimeout(() => {
      if (settled) return;
      settled = true;
      child.kill("SIGTERM");
      reject(new Error(`${command} ${args.join(" ")} timed out after ${commandTimeoutMs}ms`));
    }, options.timeoutMs ?? commandTimeoutMs);
    child.once("error", (error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      reject(error);
    });
    child.once("exit", (code) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      if (code === 0) {
        resolve(stdout.trim());
        return;
      }
      reject(new Error(`${command} ${args.join(" ")} exited with ${code}`));
    });
  });
}

async function waitForHealth() {
  const deadline = Date.now() + 60_000;
  let lastError = null;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(`${backendUrl}/healthz`);
      if (response.ok) return;
      lastError = new Error(`health returned ${response.status}`);
    } catch (error) {
      lastError = error;
    }
    await new Promise((resolve) => {
      setTimeout(resolve, 1_000);
    });
  }
  throw new Error(`Timed out waiting for ${backendUrl}/healthz: ${lastError}`);
}

async function writeCompose(composeFile, caddyFile, image) {
  await writeFile(caddyFile, `:8088 {
\tencode zstd gzip
\treverse_proxy server:8080
}
`);
  await writeFile(composeFile, `services:
  server:
    image: ${image}
    environment:
      ALLOWED_ORIGINS: "*"
      LISTEN_ADDR: ":8080"
      ROOM_TTL: "3m"
    expose:
      - "8080"

  caddy:
    image: caddy:2-alpine
    depends_on:
      - server
    ports:
      - "127.0.0.1:${hostPort}:8088"
    volumes:
      - ./Caddyfile:/etc/caddy/Caddyfile:ro
`);
}

async function assertServerImage(composeFile, expectedImage) {
  const containerId = await run("docker", ["compose", "-p", projectName, "-f", composeFile, "ps", "-q", "server"], {
    stdio: "pipe"
  });
  const actualImage = await run("docker", ["inspect", "--format", "{{.Config.Image}}", containerId], {
    stdio: "pipe"
  });
  if (actualImage !== expectedImage) {
    throw new Error(`Expected server image ${expectedImage}, got ${actualImage}`);
  }
}

async function verifyBackendImage(composeFile, caddyFile, image) {
  await writeCompose(composeFile, caddyFile, image);
  await run("docker", ["compose", "-p", projectName, "-f", composeFile, "up", "-d", "--force-recreate"]);
  await waitForHealth();
  await assertServerImage(composeFile, image);
  await run("node", ["scripts/smoke-backend.mjs", backendUrl]);
}

async function buildExtensionZip(label, host, outputDir) {
  await run("pnpm", ["build:extension"], {
    env: {
      VITE_RELEASE_CHANNEL: label,
      VITE_VIDEOTOGETHER_LITE_HOST: host
    }
  });
  await run("node", ["scripts/validate-extension-package.mjs", "apps/extension/dist", host]);
  const zipPath = path.join(outputDir, `videotogether-lite-${label}.zip`);
  await run("zip", ["-qr", zipPath, "."], {
    cwd: "apps/extension/dist"
  });
  await run("unzip", ["-t", zipPath]);
  return zipPath;
}

const composeDir = await mkdtemp(path.join(tmpdir(), "videotogether-rollback-smoke-"));
const composeFile = path.join(composeDir, "docker-compose.yml");
const caddyFile = path.join(composeDir, "Caddyfile");
let composeStarted = false;

try {
  await run("docker", ["build", "--progress=plain", "-t", previousImage, "./apps/server"]);
  await run("docker", ["build", "--progress=plain", "-t", currentImage, "./apps/server"]);
  await verifyBackendImage(composeFile, caddyFile, currentImage);
  composeStarted = true;
  await verifyBackendImage(composeFile, caddyFile, previousImage);

  const previousZip = await buildExtensionZip("previous", previousExtensionHost, composeDir);
  const currentZip = await buildExtensionZip("current", currentExtensionHost, composeDir);
  console.log(`Rollback smoke passed. Backend rolled back to ${previousImage}.`);
  console.log(`Extension rollback artifacts verified: ${previousZip} and ${currentZip}`);
} finally {
  if (composeStarted) {
    await run("docker", ["compose", "-p", projectName, "-f", composeFile, "down", "-v"]).catch((error) => {
      console.error(error);
    });
  }
}
