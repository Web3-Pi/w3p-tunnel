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
  onceWithAbort,
  getPortOrThrow,
} from "./common.ts";

const SERVER_PORT_TLS = 9004;
const SERVER_PORT_NON_TLS = 9005;
const LOCAL_SERVICE_PORT = 8084;
const SERVER_HOST = "localhost";
process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";

describe("TLS Functionality", () => {
  let localService: http.Server;

  before(async () => {
    localService = await startSimpleServer(LOCAL_SERVICE_PORT);
  });
  after(async () => {
    await stopSimpleServer(localService);
  });

  describe("TLS Server and Client", () => {
    let server: TunnelServer;

    beforeEach(async () => {
      // Start server WITH TLS
      server = await startTunnelServer(SERVER_PORT_TLS, true);
    });

    afterEach(async () => {
      await stopTunnelServer(server).catch((err) => {
        console.error("Error during server cleanup", err);
      });
    });

    it("should connect, authenticate, and forward with TLS", async () => {
      const client = await startTunnelClient({
        serverPort: SERVER_PORT_TLS,
        clientPort: LOCAL_SERVICE_PORT,
        tunnelHost: SERVER_HOST,
        useTls: true, // Client uses TLS
      });
      try {
        assert.equal(server.tunnels.size, 1, "Server should have one tunnel");

        const tunnel = server.tunnels.values().next().value;
        assert.ok(tunnel, "Tunnel not found");
        const tunnelPort = getPortOrThrow(tunnel);
        const response = await fetch(`https://${SERVER_HOST}:${tunnelPort}/`); // https here!
        assert.strictEqual(response.status, 200);
        assert.strictEqual(await response.text(), "Hello World\n");
      } finally {
        await stopTunnelClient(client).catch((err) => {
          console.error("Error during client cleanup", err);
        });
      }
    });

    it("should reject non-TLS client connecting to TLS server", async () => {
      const client = await startTunnelClient({
        serverPort: SERVER_PORT_TLS,
        clientPort: LOCAL_SERVICE_PORT,
        tunnelHost: SERVER_HOST,
        useTls: false, // Client uses NO TLS
        autoStart: false, // Start manually
      });
      try {
        client.start();

        // Expect client to connect, then disconnect
        // and queue a reconnect because handshake wasn't acked.
        // Expect server to disconnect the client without creating a tunnel.
        await Promise.all([
          onceWithAbort(client, "tunnel-disconnected", {
            timeout: 1500,
            message:
              "Client should disconnect after server TLS rejects connection",
          }),
          onceWithAbort(client, "tunnel-reconnect-queued", {
            timeout: 1500,
            message:
              "Client should queue reconnect after disconnect (even without ack)",
          }),
        ]);

        // Verify server state
        assert.equal(
          server.tunnels.size,
          0,
          "Non-TLS client connection should not result in a tunnel",
        );
      } finally {
        // Stop the client to prevent actual reconnect during cleanup
        client.stop();
      }
    });
  });

  describe("TLS Client to Non-TLS Server", () => {
    let server: TunnelServer;
    let client: TunnelClient;

    beforeEach(async () => {
      // Start server WITHOUT TLS
      server = await startTunnelServer(SERVER_PORT_NON_TLS, false);
    });

    afterEach(async () => {
      await stopTunnelClient(client).catch(() => {});
      await stopTunnelServer(server).catch(() => {});
    });

    it("should reject TLS client connecting to non-TLS server", async () => {
      client = await startTunnelClient({
        serverPort: SERVER_PORT_NON_TLS, // Connect to non-TLS port
        clientPort: LOCAL_SERVICE_PORT,
        tunnelHost: SERVER_HOST,
        useTls: true, // Client uses TLS
        autoStart: false, // Start manually
      });

      try {
        client.start();

        const [_, [disconnectEvent], [errorEvent]] = await Promise.all([
          onceWithAbort(client, "tunnel-error", {
            timeout: 1000,
            message:
              "Client should emit tunnel-error due to magic byte mismatch",
          }),
          onceWithAbort(client, "tunnel-disconnected", {
            timeout: 1000,
            message: "Client should disconnect after error",
          }),
          onceWithAbort(server, "client-error", {
            timeout: 1000,
            message: "Server should disconnect client after receiving bad data",
          }),
        ]);

        assert.ok(errorEvent.err, "Error object should exist");
        assert.match(
          errorEvent.err.message,
          /Invalid magic bytes/i,
          "Error message should mention magic bytes",
        );
        assert.strictEqual(
          disconnectEvent.hadError,
          true,
          "Disconnect should be marked as error",
        );

        assert.equal(
          server.tunnels.size,
          0,
          "TLS client connection should not result in a tunnel on non-TLS server",
        );
      } finally {
        client.stop();
      }
    });
  });
});
