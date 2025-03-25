import { afterEach, beforeEach, describe, it } from "node:test";
import type { TunnelServer } from "../src/server.ts";
import {
  getPortOrThrow,
  startSimpleServer,
  startTunnelClient,
  startTunnelServer,
  stopSimpleServer,
  stopTunnelClient,
  stopTunnelServer,
} from "./common.ts";
import type http from "node:http";
import type { TunnelClient } from "../src/client.ts";
import assert from "node:assert";

const SERVER_PORT = 9000;
const LOCAL_SERVICE_PORT = 8080;
const SERVER_HOST = "localhost";

describe("tunnel", () => {
  let localService: http.Server;
  let server: TunnelServer;
  let client: TunnelClient;

  beforeEach(async () => {
    localService = await startSimpleServer(LOCAL_SERVICE_PORT);
    server = await startTunnelServer(SERVER_PORT);
    client = await startTunnelClient({
      tunnelHost: SERVER_HOST,
      clientPort: LOCAL_SERVICE_PORT,
      serverPort: SERVER_PORT,
    });
  });
  afterEach(async () => {
    stopSimpleServer(localService);
    stopTunnelClient(client);
    stopTunnelServer(server);
  });

  it("should forward a simple hello world server", async () => {
    const tunnel = server.tunnels.values().next().value;
    if (!tunnel) throw new Error("No tunnel found");
    const tunnelPort = getPortOrThrow(tunnel);
    const response = await fetch(`http://${SERVER_HOST}:${tunnelPort}/ping`);
    assert.equal(response.status, 200);
    assert.equal(await response.text(), "Hello World\n");
  });
});
