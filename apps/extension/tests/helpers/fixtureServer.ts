import { readFileSync } from "node:fs";
import { createServer, type Server, type ServerResponse } from "node:http";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

export interface FixtureServer {
  close: () => Promise<void>;
  url: (pathname?: string) => string;
}

const fixtureVideoPathname = "/fixture-video.webm";
const fixtureVideo = readFileSync(resolve(
  dirname(fileURLToPath(import.meta.url)),
  "../../fixtures/sample-video.webm"
));

function serveFixtureVideo(request: { headers: { range?: string } }, response: ServerResponse): void {
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

  const start = match[1] === "" ? 0 : Number.parseInt(match[1]!, 10);
  const requestedEnd = match[2] === "" ? fixtureVideo.length - 1 : Number.parseInt(match[2]!, 10);
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

function titleFor(pathname: string): string {
  if (pathname === "/no-video") {
    return "VideoTogether Lite no-video fixture";
  }
  if (pathname === "/member") {
    return "VideoTogether Lite member fixture";
  }
  return "VideoTogether Lite host fixture";
}

function videoFixtureScript(): string {
  return `<script>
(() => {
  const video = document.querySelector("video");
  if (!video) {
    return;
  }

  const snapshot = () => ({
    currentTime: Number.isFinite(video.currentTime) ? video.currentTime : 0,
    duration: Number.isFinite(video.duration) ? video.duration : 0,
    paused: video.paused,
    playbackRate: Number.isFinite(video.playbackRate) ? video.playbackRate : 1,
    readyState: video.readyState
  });
  const waitForEvent = (name) => new Promise((resolve, reject) => {
    const timeout = window.setTimeout(() => {
      video.removeEventListener(name, onEvent);
      reject(new Error("Timed out waiting for " + name));
    }, 5000);
    function onEvent() {
      window.clearTimeout(timeout);
      resolve();
    }
    video.addEventListener(name, onEvent, { once: true });
  });
  const waitForMetadata = async () => {
    if (video.readyState >= 1 && Number.isFinite(video.duration)) {
      return;
    }
    await waitForEvent("loadedmetadata");
  };
  const apply = async (next) => {
    await waitForMetadata();
    if (typeof next.playbackRate === "number" && Number.isFinite(next.playbackRate)) {
      video.playbackRate = next.playbackRate;
    }
    if (typeof next.currentTime === "number" && Number.isFinite(next.currentTime)) {
      const maxTime = Number.isFinite(video.duration) && video.duration > 0 ? video.duration : next.currentTime;
      const target = Math.min(Math.max(next.currentTime, 0), maxTime);
      if (Math.abs(video.currentTime - target) > 0.05) {
        const seeked = waitForEvent("seeked");
        video.currentTime = target;
        await seeked;
      }
    }
    if (typeof next.paused === "boolean") {
      if (next.paused) {
        video.pause();
      } else if (video.paused) {
        await video.play();
      }
    }
    return snapshot();
  };
  window.__videoTogetherLiteFixture = {
    emitActivity: () => video.dispatchEvent(new Event(video.paused ? "pause" : "play", { bubbles: true })),
    getVideo: snapshot,
    setVideo: apply
  };
})();
</script>`;
}

function videoElementHtml(): string {
  return `<video aria-label="Fixture video" controls playsinline preload="metadata" title="Fixture video">
        <source src="${fixtureVideoPathname}" type="video/webm">
      </video>`;
}

function fixtureHtml(pathname: string): string {
  const hasVideo = pathname !== "/no-video";
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>${titleFor(pathname)}</title>
  </head>
  <body>
    <main>
      <h1>${titleFor(pathname)}</h1>
      ${hasVideo ? videoElementHtml() : "<p>No fixture video.</p>"}
    </main>
    ${hasVideo ? videoFixtureScript() : ""}
  </body>
</html>`;
}

export async function startFixtureServer(): Promise<FixtureServer> {
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
    response.end(fixtureHtml(pathname));
  });

  await new Promise<void>((resolveListen, rejectListen) => {
    server.once("error", rejectListen);
    server.listen(0, "127.0.0.1", resolveListen);
  });

  return {
    close: () => closeServer(server),
    url: (pathname = "/host") => {
      const address = server.address();
      if (address === null || typeof address === "string") {
        throw new Error("Fixture server address is unavailable.");
      }
      return new URL(pathname, `http://127.0.0.1:${address.port}`).toString();
    }
  };
}

function closeServer(server: Server): Promise<void> {
  return new Promise((resolveClose, rejectClose) => {
    server.closeAllConnections();
    server.close((error) => {
      if (error) {
        rejectClose(error);
        return;
      }
      resolveClose();
    });
  });
}
