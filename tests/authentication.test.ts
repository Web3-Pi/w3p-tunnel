import { afterEach, beforeEach, describe, it } from "node:test";
import assert from "node:assert/strict";
import type { TunnelServer } from "../src/server.ts";
import {
  startTunnelServer,
  stopTunnelServer,
  startTunnelClient,
  stopTunnelClient,
  onceWithAbort,
} from "./common.ts";

const SERVER_PORT = 9003;
const LOCAL_SERVICE_PORT = 8083;
const SERVER_HOST = "localhost";

describe("Authentication (No TLS)", () => {
  let server: TunnelServer;

  beforeEach(async () => {
    server = await startTunnelServer(SERVER_PORT, false);
    server.connectionFilter = async (creds) => {
      // Simple filter for testing
      return creds?.id === "VALID_ID";
    };
  });

  afterEach(async () => {
    await stopTunnelServer(server);
  });

  it("should reject client with invalid credentials", async () => {
    const clientInvalid = await startTunnelClient({
      serverPort: SERVER_PORT,
      clientPort: LOCAL_SERVICE_PORT,
      tunnelHost: SERVER_HOST,
      useTls: false,
      authenticationCredentials: { id: "INVALID_ID" },
      autoStart: false, // Start manually
    });

    try {
      clientInvalid.start(); // Attempt connection

      // Expect server to reject and client to disconnect
      const [[authFailedEvent]] = await Promise.all([
        await onceWithAbort(server, "client-authentication-failed", {
          timeout: 500,
          message: "Client authentication failed event not received",
        }),

        await onceWithAbort(clientInvalid, "tunnel-disconnected", {
          timeout: 500,
          message: "Tunnel disconnected event not received",
        }),
      ]);

      assert.strictEqual(
        authFailedEvent.err.message,
        "Client rejected by connection filter",
      );
      assert.equal(
        server.tunnels.size,
        0,
        "No tunnel should be created for invalid client",
      );
    } finally {
      clientInvalid.stop();
    }
  });

  it("should accept client with valid credentials", async () => {
    const clientValid = await startTunnelClient({
      serverPort: SERVER_PORT,
      clientPort: LOCAL_SERVICE_PORT,
      tunnelHost: SERVER_HOST,
      useTls: false,
      authenticationCredentials: { id: "VALID_ID" },
      autoStart: true, // Starts and waits for ack
    });

    try {
      assert.equal(
        server.tunnels.size,
        1,
        "Tunnel should be created for valid client",
      );
    } finally {
      await stopTunnelClient(clientValid);
    }
  });
});
