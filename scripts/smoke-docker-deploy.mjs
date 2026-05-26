import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";

const imageTag = process.env.SMOKE_IMAGE ?? "videotogetherlite-server:smoke";
const hostPort = process.env.SMOKE_CADDY_PORT ?? "18080";
const buildTimeoutMs = Number.parseInt(process.env.SMOKE_DOCKER_BUILD_TIMEOUT_MS ?? "180000", 10);
const commandTimeoutMs = Number.parseInt(process.env.SMOKE_DOCKER_COMMAND_TIMEOUT_MS ?? "60000", 10);
const hostBuildFallback = process.env.SMOKE_DOCKER_HOST_BUILD_FALLBACK !== "0";
const backendUrl = `http://127.0.0.1:${hostPort}`;
const projectName = `vtl-smoke-${Date.now()}`;

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
    const timeout = options.timeoutMs
      ? setTimeout(() => {
        if (settled) {
          return;
        }
        settled = true;
        child.kill("SIGTERM");
        reject(new Error(`${command} ${args.join(" ")} timed out after ${options.timeoutMs}ms`));
      }, options.timeoutMs)
      : null;
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
      if (response.ok) {
        return;
      }
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

async function dockerArchitecture() {
  const output = await run("docker", ["info", "--format", "{{.Architecture}}"], {
    stdio: "pipe",
    timeoutMs: commandTimeoutMs
  });
  return output.trim();
}

function goArch(dockerArch) {
  switch (dockerArch) {
  case "aarch64":
  case "arm64":
    return "arm64";
  case "x86_64":
  case "x86-64":
  case "amd64":
    return "amd64";
  default:
    throw new Error(`Unsupported Docker architecture for host build fallback: ${dockerArch}`);
  }
}

const composeDir = await mkdtemp(path.join(tmpdir(), "videotogether-docker-smoke-"));
const composeFile = path.join(composeDir, "docker-compose.yml");
const caddyFile = path.join(composeDir, "Caddyfile");

await writeFile(caddyFile, `:8088 {
\tencode zstd gzip
\treverse_proxy server:8080
}
`);

await writeFile(composeFile, `services:
  server:
    image: ${imageTag}
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

let composeStarted = false;
let builtWithHostFallback = false;
try {
  try {
    await run("docker", ["build", "--progress=plain", "-t", imageTag, "./apps/server"], {
      timeoutMs: buildTimeoutMs
    });
  } catch (error) {
    if (!hostBuildFallback) {
      throw error;
    }
    console.warn(`Production Dockerfile build failed; using host-built runtime fallback. ${error}`);
    const fallbackDir = await mkdtemp(path.join(tmpdir(), "videotogether-runtime-image-"));
    const arch = goArch(await dockerArchitecture());
    await run("go", ["build", "-trimpath", "-ldflags=-s -w", "-o", path.join(fallbackDir, "videotogether-server"), "./apps/server"], {
      env: {
        CGO_ENABLED: "0",
        GOARCH: arch,
        GOOS: "linux"
      },
      timeoutMs: commandTimeoutMs
    });
    await writeFile(path.join(fallbackDir, "Dockerfile"), `FROM gcr.io/distroless/static-debian12:nonroot

ENV LISTEN_ADDR=:8080 \\
    ROOM_TTL=3m \\
    ALLOWED_ORIGINS=*

WORKDIR /app
COPY videotogether-server /app/videotogether-server

EXPOSE 8080
USER nonroot:nonroot
ENTRYPOINT ["/app/videotogether-server"]
CMD ["prod"]
`);
    await run("docker", ["build", "--progress=plain", "-t", imageTag, fallbackDir], {
      timeoutMs: buildTimeoutMs
    });
    builtWithHostFallback = true;
  }
  await run("docker", ["compose", "-p", projectName, "-f", composeFile, "up", "-d"], {
    timeoutMs: commandTimeoutMs
  });
  composeStarted = true;
  await waitForHealth();
  await run("node", ["scripts/smoke-backend.mjs", backendUrl]);
  const buildMode = builtWithHostFallback ? "host-built runtime image" : "apps/server/Dockerfile";
  console.log(`Docker+Caddy smoke passed for ${backendUrl} using ${buildMode}`);
} finally {
  if (composeStarted) {
    await run("docker", ["compose", "-p", projectName, "-f", composeFile, "down", "-v"], {
      stdio: "inherit"
    }).catch((error) => {
      console.error(error);
    });
  }
}
