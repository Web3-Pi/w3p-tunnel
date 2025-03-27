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
import net from "node:net";
import { once } from "node:events";

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
    await stopSimpleServer(localService);
    await stopTunnelClient(client);
    await stopTunnelServer(server);
  });

  it("should forward a simple hello world server", async () => {
    const tunnel = server.tunnels.values().next().value;
    if (!tunnel) throw new Error("No tunnel found");
    const tunnelPort = getPortOrThrow(tunnel);
    const response = await fetch(`http://${SERVER_HOST}:${tunnelPort}/ping`);
    assert.equal(response.status, 200);
    assert.equal(await response.text(), "Hello World\n");
  });

  it("handles multiple open connections to the same tunnel", async () => {
    const tunnel = server.tunnels.values().next().value;
    if (!tunnel) throw new Error("No tunnel found");
    const tunnelPort = getPortOrThrow(tunnel);

    const createSocket = () => {
      const socket = new net.Socket();
      socket.connect(tunnelPort, "localhost");
      socket.setKeepAlive(true);
      socket.setTimeout(0);
      socket.setNoDelay(true);
      return socket;
    };

    const makeHttpRequest = async (socket: net.Socket): Promise<Buffer[]> => {
      const response: Buffer[] = [];
      socket.on("data", (data) => response.push(data));
      socket.write("GET / HTTP/1.1\r\nHost: localhost\r\n\r\n");
      return response;
    };

    const countHttpResponses = (buffers: Buffer[]): number => {
      return buffers.reduce(
        (acc, cur) => acc + (cur.toString().match(/HTTP\/1.1/g) || []).length,
        0,
      );
    };

    const socket1 = createSocket();
    const socket2 = createSocket();

    try {
      const response1 = makeHttpRequest(socket1);
      const response2 = makeHttpRequest(socket2);

      await new Promise((resolve) => setTimeout(resolve, 1000));

      assert.equal(countHttpResponses(await response1), 1);
      assert.equal(countHttpResponses(await response2), 1);
    } finally {
      const waitForSocketsEnd = Promise.all([
        once(socket1, "close"),
        once(socket2, "close"),
      ]);
      socket1.destroy();
      socket2.destroy();
      await waitForSocketsEnd;
    }
  });
});
