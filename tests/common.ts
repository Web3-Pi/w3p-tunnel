import http from "node:http";
import { TunnelServer } from "../src/server.ts";
import { once } from "node:events";
import { TunnelClient } from "../src/client.ts";
import type net from "node:net";
import path from "node:path";
import fs from "node:fs";
import { fileURLToPath } from "node:url";
import type { ClientEvents, ServerEvents } from "../src/events.ts";
import type { ClientTunnel } from "../src/server/ClientTunnel.ts";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export function getTestTlsOptions(type: "server" | "client") {
  const keyPath = path.join(__dirname, "./dummy-key.pem");
  const certPath = path.join(__dirname, "./dummy-cert.pem");

  if (!fs.existsSync(keyPath) || !fs.existsSync(certPath)) {
    throw new Error("TLS files not found");
  }

  if (type === "server") {
    return {
      mainServer: {
        key: fs.readFileSync(keyPath),
        cert: fs.readFileSync(certPath),
      },
      tunnelServer: {
        key: fs.readFileSync(keyPath),
        cert: fs.readFileSync(certPath),
      },
    };
  }
  return {
    ca: fs.readFileSync(certPath), // Trust the self-signed cert
  };
}

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

export async function startTunnelServer(port = 9000, useTLs = false) {
  const tlsOptions = useTLs ? getTestTlsOptions("server") : false;
  const tunnelServer = new TunnelServer({ tls: tlsOptions });

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
    ({ clientAuthenticationCredentials, secure }) =>
      console.debug("Server event: tunnel-created", {
        clientAuthenticationCredentials,
        secure,
      }),
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
  tunnelServer.events.on("client-protocol-confirmed", () =>
    console.debug("Server event: client-protocol-confirmed"),
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
  await onceWithAbort(tunnelServer, "main-server-end", {
    timeout: 5000,
    message: "Main server end event not received",
  });
}

export async function startTunnelClient({
  serverPort = 9000,
  clientPort = 8080,
  tunnelHost = "localhost",
  authenticationCredentials = {
    id: "TEST_MACHINE_ID",
  } as Record<string, unknown>,
  autoStart = true,
  useTls = false,
} = {}) {
  const tlsOptions = useTls ? getTestTlsOptions("client") : false;
  const tunnelClient = new TunnelClient({
    localServicePort: clientPort,
    tunnelServerPort: serverPort,
    tunnelServerHost: tunnelHost,
    authenticationCredentials,
    tls: tlsOptions,
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
  tunnelClient.events.on("tunnel-disconnected", ({ hadError }) =>
    console.debug("Client event: tunnel-disconnected", { hadError }),
  );
  tunnelClient.events.on("tunnel-reconnect-queued", ({ timeout }) =>
    console.debug("Client event: tunnel-reconnect-queued", { timeout }),
  );
  tunnelClient.events.on("tunnel-protocol-confirmed", () =>
    console.debug("Client event: tunnel-protocol-confirmed"),
  );

  if (autoStart) {
    tunnelClient.start();
    await once(tunnelClient.events, "authentication-acknowledged", {});
  }
  return tunnelClient;
}

export async function stopTunnelClient(tunnelClient: TunnelClient) {
  if (tunnelClient.isDestroyed) {
    console.log("Tried to stop tunnel client but it's already stopped");
    return;
  }
  console.log("Stopping tunnel client");
  tunnelClient.stop();
  await onceWithAbort(tunnelClient, "tunnel-disconnected", {
    message: "Tunnel disconnected event not received",
    timeout: 500,
  });
}

export function getPortOrThrow(tunnel: ClientTunnel) {
  if (!tunnel.tunnelAddress) throw new Error("Tunnel address not found");
  return tunnel.tunnelAddress.port;
}

export async function onceWithAbort<T extends TunnelClient | TunnelServer>(
  emitter: T,
  event: T extends TunnelClient ? keyof ClientEvents : keyof ServerEvents,
  options: {
    timeout: number;
    message: string;
  },
) {
  try {
    return await once(emitter.events, event, {
      signal: AbortSignal.timeout(options.timeout),
    });
  } catch (err) {
    throw new Error(options.message);
  }
}
