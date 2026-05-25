import { createServer, type Server } from "node:http";

export interface FixtureServer {
  close: () => Promise<void>;
  url: (pathname?: string) => string;
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

  const state = {
    currentTime: 0,
    duration: 180,
    paused: true,
    playbackRate: 1,
    readyState: 4
  };
  const snapshot = () => ({ ...state });
  const emit = (name) => video.dispatchEvent(new Event(name, { bubbles: true }));
  const apply = (next) => {
    const shouldSeek = typeof next.currentTime === "number";
    const shouldEmitPauseState = typeof next.paused === "boolean";
    if (typeof next.duration === "number") {
      state.duration = next.duration;
    }
    if (typeof next.readyState === "number") {
      state.readyState = next.readyState;
    }
    if (typeof next.playbackRate === "number") {
      state.playbackRate = next.playbackRate;
    }
    if (typeof next.currentTime === "number") {
      state.currentTime = next.currentTime;
    }
    if (typeof next.paused === "boolean") {
      state.paused = next.paused;
    }
    if (shouldSeek) {
      emit("seeked");
    }
    if (shouldEmitPauseState) {
      emit(state.paused ? "pause" : "play");
    }
    return snapshot();
  };

  Object.defineProperties(video, {
    currentTime: {
      configurable: true,
      get: () => state.currentTime,
      set: (value) => {
        state.currentTime = Number(value);
        emit("seeked");
      }
    },
    duration: { configurable: true, get: () => state.duration },
    paused: { configurable: true, get: () => state.paused },
    playbackRate: {
      configurable: true,
      get: () => state.playbackRate,
      set: (value) => {
        state.playbackRate = Number(value);
      }
    },
    readyState: { configurable: true, get: () => state.readyState }
  });
  video.play = async () => {
    apply({ paused: false });
  };
  video.pause = () => {
    apply({ paused: true });
  };
  window.__videoTogetherLiteFixture = {
    emitActivity: () => emit(state.paused ? "pause" : "play"),
    getVideo: snapshot,
    setVideo: apply
  };
})();
</script>`;
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
      ${hasVideo ? "<video controls playsinline></video>" : "<p>No fixture video.</p>"}
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
