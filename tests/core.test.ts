import { afterEach, beforeEach, describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import type http from "node:http";
import type { TunnelServer } from "../src/server.ts";
import type { TunnelClient } from "../src/client.ts";
import {
  startSimpleServer,
  stopSimpleServer,
  startTunnelServer,
  stopTunnelServer,
  startTunnelClient,
  stopTunnelClient,
  getPortOrThrow,
} from "./common.ts";

const SERVER_PORT = 9001;
const LOCAL_SERVICE_PORT = 8081;
const SERVER_HOST = "localhost";

describe("Basic Functionality (No TLS)", () => {
  let localService: http.Server;
  let server: TunnelServer;
  let client: TunnelClient;

  before(async () => {
    localService = await startSimpleServer(LOCAL_SERVICE_PORT);
  });
  after(async () => {
    await stopSimpleServer(localService);
  });

  // Setup non-TLS server/client for each test
  beforeEach(async () => {
    server = await startTunnelServer(SERVER_PORT, false); // No TLS
    client = await startTunnelClient({
      serverPort: SERVER_PORT,
      clientPort: LOCAL_SERVICE_PORT,
      tunnelHost: SERVER_HOST,
      useTls: false, // No TLS
    });
  });

  afterEach(async () => {
    await stopTunnelClient(client);
    await stopTunnelServer(server);
  });

  it("should establish connection, authenticate, and create tunnel", () => {
    assert.equal(server.tunnels.size, 1, "Server should have one tunnel");
    assert.ok(
      client.tunnelSocketContext,
      "Client should have a tunnel context",
    );
    assert.ok(
      !client.tunnelSocketContext?.socket.destroyed,
      "Client tunnel socket should be active",
    );
  });

  it("should forward a simple HTTP GET request", async () => {
    const tunnel = server.tunnels.values().next().value;
    assert.ok(tunnel, "Tunnel not found");
    const tunnelPort = getPortOrThrow(tunnel);

    const response = await fetch(`http://${SERVER_HOST}:${tunnelPort}/`);
    assert.strictEqual(response.status, 200);
    assert.strictEqual(await response.text(), "Hello World\n");
  });

  it("should handle multiple concurrent connections", async () => {
    const tunnel = server.tunnels.values().next().value;
    assert.ok(tunnel, "Tunnel not found");
    const tunnelPort = getPortOrThrow(tunnel);

    const N_REQUESTS = 5;
    const promises: Promise<Response>[] = [];

    const waitForDisconnectsPromise = new Promise<void>((resolve, reject) => {
      let disconnectCount = 0;
      const timeoutMs = 5000;

      const timeout = setTimeout(() => {
        // Clean up listener before rejecting
        client.events.off("service-disconnected", listener);
        reject(
          new Error(
            `Timeout: Waited ${timeoutMs}ms for ${N_REQUESTS} service disconnects, but only received ${disconnectCount}`,
          ),
        );
      }, timeoutMs);

      const listener = () => {
        disconnectCount++;
        console.debug(
          `Service disconnected event received (${disconnectCount}/${N_REQUESTS})`,
        );
        if (disconnectCount === N_REQUESTS) {
          clearTimeout(timeout);
          client.events.off("service-disconnected", listener);
          resolve();
        }
      };
      client.events.on("service-disconnected", listener);
    });

    for (let i = 0; i < N_REQUESTS; i++) {
      promises.push(fetch(`http://${SERVER_HOST}:${tunnelPort}/`));
    }

    const responses = await Promise.all(promises);

    for (let i = 0; i < N_REQUESTS; i++) {
      const response = responses[i];
      if (!response) {
        throw new Error(`Response for request ${i} is undefined`);
      }
      assert.strictEqual(response.status, 200, `Request ${i} failed`);
      assert.strictEqual(
        await response.text(),
        "Hello World\n",
        `Request ${i} body mismatch`,
      );
    }
    await waitForDisconnectsPromise;
    assert.equal(
      client.tunnelSocketContext?.destinationSockets.size,
      0,
      "Client destination sockets should be cleaned up after fetch",
    );
  });
});
