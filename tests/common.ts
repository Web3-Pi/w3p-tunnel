import http from "node:http";
import { TunnelServer } from "../src/server.ts";
import { once } from "node:events";
import { TunnelClient } from "../src/client.ts";
import type net from "node:net";
import type nodeTls from "node:tls";

export async function startSimpleServer(port = 8080) {
  const { resolve, reject, promise } = Promise.withResolvers<void>();
  const server = http.createServer((req, res) => {
    res.writeHead(200, { "Content-Type": "text/plain" });
    res.end("Hello World\n");
  });
  setTimeout(reject, 1000);
  server.listen(port, resolve);
  await promise;
  return server;
}

export async function stopSimpleServer(server: http.Server) {
  console.log("Stopping simple server");
  server.close();
  await once(server, "close");
}

export async function startTunnelServer(
  port = 9000,
  tls: false | nodeTls.TlsOptions = false,
) {
  const tunnelServer = new TunnelServer({ tls });

  // Add debug listeners for all server events
  tunnelServer.events.on("client-connected", () =>
    console.debug("Server event: client-connected"),
  );
  tunnelServer.events.on("client-disconnected", () =>
    console.debug("Server event: client-disconnected"),
  );
  tunnelServer.events.on("client-error", ({ err }) =>
    console.debug("Server event: client-error", err),
  );
  tunnelServer.events.on(
    "tunnel-created",
    ({ clientAuthenticationCredentials }) =>
      console.debug(
        "Server event: tunnel-created",
        clientAuthenticationCredentials,
      ),
  );
  tunnelServer.events.on("tunnel-destroyed", () =>
    console.debug("Server event: tunnel-destroyed"),
  );
  tunnelServer.events.on("tunnel-error", ({ err }) =>
    console.debug("Server event: tunnel-error", err),
  );
  tunnelServer.events.on("main-server-error", ({ err }) =>
    console.debug("Server event: main-server-error", err),
  );
  tunnelServer.events.on("main-server-start", (e) =>
    console.debug("Server event: main-server-start", {
      port: e.port,
      secure: e.secure,
    }),
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
  tunnelServer.events.on("visitor-error", ({ err }) =>
    console.debug("Server event: visitor-error", err),
  );
  tunnelServer.events.on("data-from-visitor", ({ data }) =>
    console.debug("Server event: data-from-visitor", data.length),
  );
  tunnelServer.events.on("data-to-visitor", ({ data }) =>
    console.debug("Server event: data-to-visitor", data.length),
  );
  tunnelServer.events.on("client-authentication-failed", ({ err }) =>
    console.debug("Server event: client-authentication-failed", err),
  );

  tunnelServer.start(port);
  await once(tunnelServer.events, "main-server-start", {
    signal: AbortSignal.timeout(1000),
  });
  return tunnelServer;
}

export async function stopTunnelServer(tunnelServer: TunnelServer) {
  console.log("Stopping tunnel server");
  tunnelServer.stop();
  await once(tunnelServer.events, "main-server-end");
}

export async function startTunnelClient({
  serverPort = 9000,
  clientPort = 8080,
  tunnelHost = "localhost",
  authenticationCredentials = {
    id: "TEST_MACHINE_ID",
  } as Record<string, unknown>,
  autoStart = true,
  tls = false as false | nodeTls.ConnectionOptions,
} = {}) {
  const tunnelClient = new TunnelClient({
    localServicePort: clientPort,
    tunnelServerPort: serverPort,
    tunnelServerHost: tunnelHost,
    authenticationCredentials,
    tls,
  });

  // Add debug listeners for all client events
  tunnelClient.events.on("error", () => console.debug("Client event: error"));
  tunnelClient.events.on("service-connected", () =>
    console.debug("Client event: service-connected"),
  );
  tunnelClient.events.on("service-error", ({ err }) =>
    console.debug("Client event: service-error", err),
  );
  tunnelClient.events.on("service-disconnected", () =>
    console.debug("Client event: service-disconnected"),
  );
  tunnelClient.events.on("data-to-service", ({ data }) =>
    console.debug("Client event: data-to-service", data.length),
  );
  tunnelClient.events.on("data-from-service", ({ data }) =>
    console.debug("Client event: data-from-service", data.length),
  );
  tunnelClient.events.on("tunnel-connection-established", () =>
    console.debug("Client event: tunnel-connection-established"),
  );
  tunnelClient.events.on(
    "authentication-credentials-sent",
    ({ authenticationCredentials }) =>
      console.debug(
        "Client event: authentication-credentials-sent",
        authenticationCredentials,
      ),
  );
  tunnelClient.events.on("authentication-acknowledged", ({ assignedPort }) =>
    console.debug("Client event: authentication-acknowledged", {
      port: assignedPort,
    }),
  );
  tunnelClient.events.on("tunnel-error", ({ err }) =>
    console.debug("Client event: tunnel-error", err),
  );
  tunnelClient.events.on("tunnel-disconnected", () =>
    console.debug("Client event: tunnel-disconnected"),
  );
  tunnelClient.events.on("tunnel-reconnect-queued", ({ timeout }) =>
    console.debug("Client event: tunnel-reconnect-queued", { timeout }),
  );

  if (autoStart) {
    tunnelClient.start();
    await once(tunnelClient.events, "authentication-acknowledged", {});
  }
  return tunnelClient;
}

export async function stopTunnelClient(tunnelClient: TunnelClient) {
  console.log("Stopping tunnel client");
  tunnelClient.stop();
  await once(tunnelClient.events, "tunnel-disconnected");
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
