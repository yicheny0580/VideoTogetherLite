#!/usr/bin/env node

import { createServer } from "node:http";
import { constants as fsConstants, readFileSync } from "node:fs";
import { access, stat } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { spawn } from "node:child_process";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const extensionDist = resolve(root, "apps/extension/dist");
const extensionManifest = resolve(extensionDist, "manifest.json");
const fixtureVideoPath = resolve(root, "apps/extension/fixtures/sample-video.webm");
const fixtureVideoPathname = "/fixture-video.webm";
const fixtureVideo = readFileSync(fixtureVideoPath);
const profileDir = resolve(root, ".playwright/videotogetherlite-dev-profile");
const serviceHost = process.env.VITE_VIDEOTOGETHER_LITE_HOST || "http://127.0.0.1:5001";

const runningChildren = new Set();
let shuttingDown = false;

function usage() {
  console.log(`Usage: node scripts/dev-workflow.mjs <command>

Commands:
  dev      Run the Go server, extension watcher, and Chromium
  watch    Run the Go server and extension watcher
  browser  Launch Chromium with the current extension build
`);
}

function commandName(name) {
  return process.platform === "win32" ? `${name}.cmd` : name;
}

function delay(ms) {
  return new Promise((resolveDelay) => {
    setTimeout(resolveDelay, ms);
  });
}

function pipeWithPrefix(stream, prefix, output) {
  let buffered = "";
  stream.setEncoding("utf8");
  stream.on("data", (chunk) => {
    buffered += chunk;
    const lines = buffered.split(/\r?\n/);
    buffered = lines.pop() ?? "";
    for (const line of lines) {
      output.write(`[${prefix}] ${line}\n`);
    }
  });
  stream.on("end", () => {
    if (buffered.length > 0) {
      output.write(`[${prefix}] ${buffered}\n`);
    }
  });
}

function startChild(name, command, args, options = {}) {
  const child = spawn(commandName(command), args, {
    cwd: root,
    env: { ...process.env, ...options.env },
    stdio: ["ignore", "pipe", "pipe"]
  });

  runningChildren.add(child);
  pipeWithPrefix(child.stdout, name, process.stdout);
  pipeWithPrefix(child.stderr, name, process.stderr);

  const done = new Promise((resolveDone) => {
    child.once("exit", (code, signal) => {
      runningChildren.delete(child);
      resolveDone({ code, name, signal });
    });
  });

  child.once("error", (error) => {
    if (!shuttingDown) {
      console.error(`[${name}] failed to start: ${error.message}`);
    }
  });

  return { child, done, name };
}

async function stopChild(child) {
  if (child.exitCode !== null || child.signalCode !== null) {
    return;
  }

  child.kill("SIGTERM");
  await Promise.race([
    new Promise((resolveStop) => child.once("exit", resolveStop)),
    delay(5_000)
  ]);

  if (child.exitCode === null && child.signalCode === null) {
    child.kill("SIGKILL");
  }
}

function waitForSignal() {
  return new Promise((resolveSignal) => {
    process.once("SIGINT", () => resolveSignal({ kind: "signal", signal: "SIGINT" }));
    process.once("SIGTERM", () => resolveSignal({ kind: "signal", signal: "SIGTERM" }));
  });
}

async function waitForFile(filePath, timeoutMs, updatedAfterMs = 0) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    try {
      await access(filePath, fsConstants.R_OK);
      const fileStats = await stat(filePath);
      if (fileStats.mtimeMs >= updatedAfterMs) {
        return;
      }
    } catch {
      // The watcher may still be emptying or rebuilding the output directory.
    }
    await delay(500);
  }

  throw new Error(`Timed out waiting for ${filePath}`);
}

async function requireExtensionBuild() {
  try {
    await access(extensionManifest, fsConstants.R_OK);
  } catch {
    throw new Error(
      "Extension build not found. Run `just build-extension` before `just browser`."
    );
  }
}

function fixtureHtml() {
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>VideoTogether Lite local fixture</title>
    <style>
      body {
        background: #f7f8fa;
        color: #1f2937;
        font-family: system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
        margin: 0;
        padding: 32px;
      }
      main {
        max-width: 760px;
      }
      video {
        background: #111827;
        display: block;
        margin-top: 16px;
        width: min(100%, 640px);
      }
    </style>
  </head>
  <body>
    <main>
      <h1>VideoTogether Lite local fixture</h1>
      <p>This page exists so the unpacked extension has a local page with a video element.</p>
      <video aria-label="Fixture video" controls playsinline preload="metadata" title="Fixture video">
        <source src="${fixtureVideoPathname}" type="video/webm">
      </video>
    </main>
  </body>
</html>`;
}

function serveFixtureVideo(request, response) {
  const range = request.headers.range;
  if (!range) {
    response.writeHead(200, {
      "accept-ranges": "bytes",
      "cache-control": "no-store",
      "content-length": String(fixtureVideo.length),
      "content-type": "video/webm"
    });
    response.end(fixtureVideo);
    return;
  }

  const match = /^bytes=(\d*)-(\d*)$/.exec(range);
  if (!match) {
    response.writeHead(416, { "content-range": `bytes */${fixtureVideo.length}` });
    response.end();
    return;
  }

  const start = match[1] === "" ? 0 : Number.parseInt(match[1], 10);
  const requestedEnd = match[2] === "" ? fixtureVideo.length - 1 : Number.parseInt(match[2], 10);
  const end = Math.min(requestedEnd, fixtureVideo.length - 1);
  if (!Number.isFinite(start) || !Number.isFinite(end) || start > end || start >= fixtureVideo.length) {
    response.writeHead(416, { "content-range": `bytes */${fixtureVideo.length}` });
    response.end();
    return;
  }

  const chunk = fixtureVideo.subarray(start, end + 1);
  response.writeHead(206, {
    "accept-ranges": "bytes",
    "cache-control": "no-store",
    "content-length": String(chunk.length),
    "content-range": `bytes ${start}-${end}/${fixtureVideo.length}`,
    "content-type": "video/webm"
  });
  response.end(chunk);
}

async function startFixtureServer() {
  const server = createServer((request, response) => {
    const pathname = new URL(request.url ?? "/", "http://127.0.0.1").pathname;
    if (pathname === "/favicon.ico") {
      response.writeHead(204);
      response.end();
      return;
    }
    if (pathname === fixtureVideoPathname) {
      serveFixtureVideo(request, response);
      return;
    }

    response.writeHead(200, { "content-type": "text/html; charset=utf-8" });
    response.end(fixtureHtml());
  });

  await new Promise((resolveListen, rejectListen) => {
    server.once("error", rejectListen);
    server.listen(0, "127.0.0.1", resolveListen);
  });

  const address = server.address();
  if (address === null || typeof address === "string") {
    throw new Error("Could not determine fixture server address.");
  }

  return {
    close: () => new Promise((resolveClose) => server.close(resolveClose)),
    url: `http://127.0.0.1:${address.port}/`
  };
}

async function launchBrowser(fixtureUrl) {
  let chromium;
  try {
    ({ chromium } = await import("@playwright/test"));
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`Could not load Playwright. Run \`just setup\`. ${message}`, {
      cause: error
    });
  }

  let context;
  try {
    context = await chromium.launchPersistentContext(profileDir, {
      args: [
        `--disable-extensions-except=${extensionDist}`,
        `--load-extension=${extensionDist}`
      ],
      headless: false
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (message.includes("Executable doesn't exist")) {
      throw new Error("Playwright Chromium is missing. Run `just setup-browser`.", {
        cause: error
      });
    }
    throw error;
  }

  const serviceWorker = context.serviceWorkers()[0]
    ?? await context.waitForEvent("serviceworker", { timeout: 15_000 });
  const extensionId = serviceWorker.url().split("/")[2];
  const popupUrl = `chrome-extension://${extensionId}/popup.html`;

  const popup = await context.newPage();
  await popup.goto(popupUrl);

  const fixture = await context.newPage();
  await fixture.goto(fixtureUrl);

  console.log(`[browser] popup: ${popupUrl}`);
  console.log(`[browser] fixture: ${fixtureUrl}`);

  return context;
}

async function cleanup(context, fixture) {
  shuttingDown = true;
  if (context !== undefined) {
    await context.close().catch(() => undefined);
  }
  if (fixture !== undefined) {
    await fixture.close().catch(() => undefined);
  }
  await Promise.all([...runningChildren].map(stopChild));
}

async function runWatch({ openBrowser }) {
  const watchStartedAt = Date.now() - 1_000;
  const server = startChild("server", "go", ["run", "./apps/server", "debug"]);
  const watcher = startChild(
    "extension",
    "pnpm",
    ["--filter", "@videotogetherlite/extension", "dev"],
    { env: { VITE_VIDEOTOGETHER_LITE_HOST: serviceHost } }
  );

  let context;
  let fixture;
  const browserLifecycle = openBrowser
    ? (async () => {
      await waitForFile(extensionManifest, 120_000, watchStartedAt);
      fixture = await startFixtureServer();
      context = await launchBrowser(fixture.url);
      return new Promise((resolveClosed) => {
        context.on("close", () => resolveClosed({ kind: "browser" }));
      });
    })().catch((error) => ({ error, kind: "error" }))
    : new Promise(() => undefined);

  const childExit = Promise.race([server.done, watcher.done])
    .then((result) => ({ kind: "child", result }));
  const outcome = await Promise.race([childExit, waitForSignal(), browserLifecycle]);

  if (outcome.kind === "child") {
    const { code, name, signal } = outcome.result;
    console.error(`[${name}] exited with ${signal ?? code}`);
    await cleanup(context, fixture);
    process.exitCode = code ?? 1;
    return;
  }

  if (outcome.kind === "error") {
    console.error(outcome.error.message);
    await cleanup(context, fixture);
    process.exitCode = 1;
    return;
  }

  await cleanup(context, fixture);
}

async function runBrowser() {
  await requireExtensionBuild();
  const fixture = await startFixtureServer();
  let context;
  try {
    context = await launchBrowser(fixture.url);
    await Promise.race([
      waitForSignal(),
      new Promise((resolveClosed) => {
        context.on("close", () => resolveClosed({ kind: "browser" }));
      })
    ]);
  } finally {
    await cleanup(context, fixture);
  }
}

async function main() {
  const command = process.argv[2];
  if (command === "dev") {
    await runWatch({ openBrowser: true });
    return;
  }
  if (command === "watch") {
    await runWatch({ openBrowser: false });
    return;
  }
  if (command === "browser") {
    await runBrowser();
    return;
  }

  usage();
  process.exitCode = command === undefined || command === "--help" ? 0 : 1;
}

await main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
