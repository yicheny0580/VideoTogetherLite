const backendUrl = process.argv[2] ?? process.env.BACKEND_PUBLIC_URL;
const timeoutMs = Number.parseInt(process.env.SMOKE_TIMEOUT_MS ?? "10000", 10);

if (!backendUrl) {
  console.error("Usage: node scripts/smoke-backend.mjs <backend-url>");
  process.exit(1);
}

if (typeof WebSocket !== "function") {
  console.error("This smoke test requires Node.js with global WebSocket support.");
  process.exit(1);
}

const baseUrl = new URL(backendUrl);
baseUrl.pathname = "/";
baseUrl.search = "";
baseUrl.hash = "";

function withTimeout(promise, label) {
  return Promise.race([
    promise,
    new Promise((_, reject) => {
      setTimeout(() => reject(new Error(`Timed out waiting for ${label}`)), timeoutMs);
    })
  ]);
}

async function fetchJson(path, body, method = "POST") {
  const url = new URL(path, baseUrl);
  url.searchParams.set("language", "en-us");
  const response = await fetch(url, {
    body: body === undefined ? undefined : JSON.stringify(body),
    headers: body === undefined ? undefined : { "Content-Type": "application/json" },
    method
  });
  const data = await response.json();
  if (!response.ok || data.error) {
    throw new Error(`${path} failed: ${response.status} ${JSON.stringify(data)}`);
  }
  return data;
}

function toWsUrl() {
  const url = new URL("/api/v1/ws?language=en-us", baseUrl);
  url.protocol = url.protocol === "https:" ? "wss:" : "ws:";
  return url;
}

async function openSocket() {
  const socket = new WebSocket(toWsUrl());
  await withTimeout(new Promise((resolve, reject) => {
    socket.addEventListener("open", resolve, { once: true });
    socket.addEventListener("error", () => reject(new Error("WebSocket connection failed")), { once: true });
  }), "websocket open");
  return socket;
}

async function waitForType(socket, type) {
  return withTimeout(new Promise((resolve, reject) => {
    function onMessage(event) {
      const message = JSON.parse(String(event.data));
      if (message.type === "error" || message.error) {
        cleanup();
        reject(new Error(`WebSocket error: ${JSON.stringify(message)}`));
        return;
      }
      if (message.type === type) {
        cleanup();
        resolve(message);
      }
    }
    function onClose() {
      cleanup();
      reject(new Error("WebSocket closed before expected message"));
    }
    function cleanup() {
      socket.removeEventListener("message", onMessage);
      socket.removeEventListener("close", onClose);
    }
    socket.addEventListener("message", onMessage);
    socket.addEventListener("close", onClose, { once: true });
  }), `websocket ${type}`);
}

function sendSocket(socket, type, data) {
  socket.send(JSON.stringify({
    data,
    id: `${type}:${Date.now()}`,
    type
  }));
}

function participant(room, userId) {
  return room.participants.find((entry) => entry.userId === userId);
}

const suffix = Date.now();
const alice = `smoke-alice-${suffix}`;
const bob = `smoke-bob-${suffix}`;

await fetchJson("/healthz", undefined, "GET");
await fetchJson("/api/v1/timestamp", undefined, "GET");

const created = await fetchJson("/api/v1/rooms/create", {
  nickname: "Smoke Alice",
  userId: alice
});

const aliceSocket = await openSocket();
const charlieSocket = await openSocket();
try {
  sendSocket(aliceSocket, "room.get", { sessionToken: created.sessionToken });
  await waitForType(aliceSocket, "room.get");

  const httpJoined = await fetchJson("/api/v1/rooms/join", {
    inviteCode: created.inviteCode,
    nickname: "Smoke Bob",
    userId: bob
  });
  if (httpJoined.room.participantCount !== 2) {
    throw new Error("HTTP join did not include two participants.");
  }

  const httpUpdated = await fetchJson("/api/v1/rooms/update", {
    focusedVideo: {
      currentTime: 12,
      duration: 120,
      isLoading: false,
      lastUpdateClientTime: 1,
      lastUpdateServerTime: 0,
      paused: true,
      playbackRate: 1,
      title: "Smoke Video",
      url: "https://example.test/smoke"
    },
    nickname: "Smoke Bob",
    sendLocalTimestamp: 2,
    sessionToken: httpJoined.sessionToken,
    sharing: true
  });
  const bobState = participant(httpUpdated.room, bob);
  if (!bobState?.sharing || bobState.focusedVideo?.url !== "https://example.test/smoke") {
    throw new Error("HTTP update did not include Bob's shared video.");
  }

  await fetchJson("/api/v1/rooms/leave", { sessionToken: httpJoined.sessionToken });

  const charlie = `smoke-charlie-${suffix}`;
  const joinBroadcastPromise = waitForType(aliceSocket, "room.updated");
  sendSocket(charlieSocket, "room.join", {
    inviteCode: created.inviteCode,
    nickname: "Smoke Charlie",
    userId: charlie
  });
  const wsJoined = await waitForType(charlieSocket, "room.join");
  const joinBroadcast = await joinBroadcastPromise;
  if (joinBroadcast.data.room.participantCount !== 2) {
    throw new Error("WebSocket join broadcast did not include two participants.");
  }

  const updateBroadcastPromise = waitForType(aliceSocket, "room.updated");
  sendSocket(charlieSocket, "room.update", {
    focusedVideo: {
      currentTime: 24,
      duration: 120,
      isLoading: false,
      lastUpdateClientTime: 3,
      lastUpdateServerTime: 0,
      paused: false,
      playbackRate: 1,
      title: "Smoke Video WS",
      url: "https://example.test/smoke-ws"
    },
    nickname: "Smoke Charlie",
    sendLocalTimestamp: 4,
    sessionToken: wsJoined.data.sessionToken,
    sharing: true
  });
  const updateBroadcast = await updateBroadcastPromise;
  const charlieState = participant(updateBroadcast.data.room, charlie);
  if (!charlieState?.sharing || charlieState.focusedVideo?.url !== "https://example.test/smoke-ws") {
    throw new Error("WebSocket update broadcast did not include Charlie's shared video.");
  }

  const leaveBroadcastPromise = waitForType(aliceSocket, "room.updated");
  sendSocket(charlieSocket, "room.leave", { sessionToken: wsJoined.data.sessionToken });
  const leaveBroadcast = await leaveBroadcastPromise;
  if (leaveBroadcast.data.room.participantCount !== 1) {
    throw new Error("WebSocket leave broadcast did not remove Charlie.");
  }

  await fetchJson("/api/v1/rooms/leave", { sessionToken: created.sessionToken });
} finally {
  aliceSocket.close();
  charlieSocket.close();
}

console.log(`Backend smoke passed for ${baseUrl.origin}`);
