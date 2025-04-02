import { afterEach, beforeEach, describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import net from "node:net";
import { once } from "node:events";
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
  onceWithAbort,
} from "./common.ts";

const SERVER_PORT = 9002;
const LOCAL_SERVICE_PORT = 8082;
const SERVER_HOST = "localhost";

describe("Disconnections (No TLS)", () => {
  let localService: http.Server;
  let server: TunnelServer;
  let client: TunnelClient;

  before(async () => {
    localService = await startSimpleServer(LOCAL_SERVICE_PORT);
  });
  after(async () => {
    await stopSimpleServer(localService);
  });

  beforeEach(async () => {
    server = await startTunnelServer(SERVER_PORT, false);
    client = await startTunnelClient({
      serverPort: SERVER_PORT,
      clientPort: LOCAL_SERVICE_PORT,
      tunnelHost: SERVER_HOST,
      useTls: false,
    });
  });

  afterEach(async () => {
    await stopTunnelClient(client).catch((err) => {
      console.error("Error during client cleanup", err);
    });
    await stopTunnelServer(server).catch((err) => {
      console.error("Error during server cleanup", err);
    });
  });

  it("should handle visitor disconnecting", async () => {
    const tunnel = server.tunnels.values().next().value;
    if (!tunnel) throw new Error("No tunnel found");
    const tunnelPort = getPortOrThrow(tunnel);

    const visitorSocket = net.connect(tunnelPort, SERVER_HOST);
    await onceWithAbort(server, "visitor-connected", {
      timeout: 500,
      message: "Visitor connected event not received",
    });
    // send some data so the client establishes a service socket
    visitorSocket.write("hello");

    await onceWithAbort(client, "service-connected", {
      timeout: 5000,
      message: "Service connected event not received",
    });

    visitorSocket.end();

    // get acknowledgement of disconnection from both sides
    await Promise.all([
      onceWithAbort(server, "visitor-disconnected", {
        timeout: 500,
        message: "Visitor disconnected event not received",
      }),
      onceWithAbort(client, "service-disconnected", {
        timeout: 500,
        message: "Service disconnected event not received",
      }),
    ]);

    assert.equal(
      client.tunnelSocketContext?.destinationSockets.size,
      0,
      "Client destination sockets should be 0 after visitor disconnect",
    );
  });

  it("should handle client disconnecting", async () => {
    assert.equal(server.tunnels.size, 1, "Tunnel should exist initially");

    // Stop the client cleanly
    await Promise.all([
      stopTunnelClient(client),
      onceWithAbort(server, "client-disconnected", {
        timeout: 500,
        message: "Client disconnected event not received",
      }),
    ]);

    assert.equal(
      server.tunnels.size,
      0,
      "Tunnel should be removed after client disconnect",
    );
  });

  it("should allow client to reconnect after disconnection due to error", async () => {
    assert.equal(server.tunnels.size, 1, "Tunnel should exist initially");

    // Simulate abrupt disconnect
    const socket = client.tunnelSocketContext?.socket;
    if (!socket) throw new Error("Socket not found");
    socket.destroy(new Error("<example error>"));

    await Promise.all([
      onceWithAbort(server, "client-disconnected", {
        timeout: 500,
        message: "Client disconnected event not received",
      }),
      onceWithAbort(client, "tunnel-reconnect-queued", {
        timeout: 500,
        message: "Tunnel reconnect queued event not received",
      }),
    ]);
    assert.equal(server.tunnels.size, 0, "Tunnel should be removed");
    await onceWithAbort(client, "authentication-acknowledged", {
      timeout: 2000, // Wait longer for reconnect + auth
      message: "Authentication acknowledged event not received",
    });

    assert.equal(server.tunnels.size, 1, "Tunnel should be re-established");

    // Verify functionality after reconnect
    const tunnel = server.tunnels.values().next().value;
    assert.ok(tunnel, "Tunnel not found");
    const tunnelPort = getPortOrThrow(tunnel);
    const response = await fetch(`http://${SERVER_HOST}:${tunnelPort}/`);
    assert.strictEqual(response.status, 200);
    assert.strictEqual(await response.text(), "Hello World\n");
  });
});
