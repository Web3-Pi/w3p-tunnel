import http from "node:http";
import { TunnelServer } from "../src/server.ts";
import { once } from "node:events";
import { TunnelClient } from "../src/client.ts";
import type net from "node:net";

export async function startSimpleServer(port = 8080) {
  const { resolve, reject, promise } = Promise.withResolvers<void>();
  const server = http.createServer((req, res) => {
    res.writeHead(200, { "Content-Type": "text/plain" });
    res.end("Hello World\n");
  });
  AbortSignal.timeout(1000).onabort = reject;
  server.listen(port, resolve);
  await promise;
  return server;
}

export async function stopSimpleServer(server: http.Server) {
  server.close();
  await once(server, "close");
}

export async function startTunnelServer(port = 9000) {
  const tunnelServer = new TunnelServer();

  // Add debug listeners for all server events
  tunnelServer.events.on("client-connected", () =>
    console.debug("Server event: client-connected"),
  );
  tunnelServer.events.on("client-disconnected", () =>
    console.debug("Server event: client-disconnected"),
  );
  tunnelServer.events.on("client-error", () =>
    console.debug("Server event: client-error"),
  );
  tunnelServer.events.on("tunnel-created", () =>
    console.debug("Server event: tunnel-created"),
  );
  tunnelServer.events.on("tunnel-destroyed", () =>
    console.debug("Server event: tunnel-destroyed"),
  );
  tunnelServer.events.on("tunnel-error", () =>
    console.debug("Server event: tunnel-error"),
  );
  tunnelServer.events.on("main-server-error", () =>
    console.debug("Server event: main-server-error"),
  );
  tunnelServer.events.on("main-server-start", (e) =>
    console.debug("Server event: main-server-start", { port: e.port }),
  );
  tunnelServer.events.on("main-server-end", () =>
    console.debug("Server event: main-server-end"),
  );
  tunnelServer.events.on("visitor-connected", () =>
    console.debug("Server event: visitor-connected"),
  );
  tunnelServer.events.on("visitor-disconnected", () =>
    console.debug("Server event: visitor-disconnected"),
  );
  tunnelServer.events.on("visitor-error", () =>
    console.debug("Server event: visitor-error"),
  );
  tunnelServer.events.on("data-from-visitor", () =>
    console.debug("Server event: data-from-visitor"),
  );
  tunnelServer.events.on("data-to-visitor", () =>
    console.debug("Server event: data-to-visitor"),
  );

  tunnelServer.start(port);
  await once(tunnelServer.events, "main-server-start", {
    signal: AbortSignal.timeout(1000),
  });
  return tunnelServer;
}

export async function stopTunnelServer(tunnelServer: TunnelServer) {
  tunnelServer.stop();
  await once(tunnelServer.events, "main-server-end");
}

export async function startTunnelClient({
  serverPort = 9000,
  clientPort = 8080,
  tunnelHost = "localhost",
} = {}) {
  const tunnelClient = new TunnelClient();

  // Add debug listeners for all client events
  tunnelClient.events.on("error", () => console.debug("Client event: error"));
  tunnelClient.events.on("service-connected", () =>
    console.debug("Client event: service-connected"),
  );
  tunnelClient.events.on("service-error", () =>
    console.debug("Client event: service-error"),
  );
  tunnelClient.events.on("service-disconnected", () =>
    console.debug("Client event: service-disconnected"),
  );
  tunnelClient.events.on("data-to-service", () =>
    console.debug("Client event: data-to-service"),
  );
  tunnelClient.events.on("data-from-service", () =>
    console.debug("Client event: data-from-service"),
  );
  tunnelClient.events.on("tunnel-connected", () =>
    console.debug("Client event: tunnel-connected"),
  );
  tunnelClient.events.on("tunnel-error", () =>
    console.debug("Client event: tunnel-error"),
  );
  tunnelClient.events.on("tunnel-disconnected", () =>
    console.debug("Client event: tunnel-disconnected"),
  );
  tunnelClient.events.on("client-end", () =>
    console.debug("Client event: client-end"),
  );

  tunnelClient.start({
    localServicePort: clientPort,
    tunnelServerPort: serverPort,
    tunnelServerHost: tunnelHost,
  });
  await once(tunnelClient.events, "service-connected", {
    signal: AbortSignal.timeout(1000),
  });
  return tunnelClient;
}

export async function stopTunnelClient(tunnelClient: TunnelClient) {
  tunnelClient.stop();
  await once(tunnelClient.events, "client-end");
}

export function getPortOrThrow(server: net.Server) {
  const address = server.address();
  if (!address) throw new Error("Server address not found");
  if (typeof address === "string")
    throw new Error(
      `Server address is a string (${address}), expected an object`,
    );
  return address.port;
}
