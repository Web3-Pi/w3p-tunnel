import type { TunnelServer } from "../server.ts";
import type { SocketContext } from "../shared/SocketContext.ts";
import net from "node:net";
import { handleVisitor } from "./handle-visitor.ts";
import { encodeMessage } from "../shared/encode-message.ts";
/**
 * Create a tunnel that will forward traffic to and from the client socket. This should be called AFTER the client has authenticated.
 */
export function createTunnel(
  masterServer: TunnelServer,
  clientSocketContext: SocketContext,
  clientAuthenticationCredentials: Record<string, unknown>,
) {
  const clientSocket = clientSocketContext.socket;
  // Create a proxy server that will forward connections to the client
  const tunnel = net.createServer((visitorSocket) => {
    masterServer.events.emit("visitor-connected", {
      clientSocket,
      tunnelServer: tunnel,
      visitorSocket,
    });
    handleVisitor(masterServer, visitorSocket, clientSocketContext, tunnel);
  });

  // Start listening on a random port
  tunnel.listen(0, () => {
    masterServer.events.emit("tunnel-created", {
      clientSocket,
      tunnelServer: tunnel,
      clientAuthenticationCredentials,
    });
    masterServer.tunnels.set(clientSocket, tunnel);
    // send authentication ack to client
    try {
      const address = tunnel.address();
      if (!address) throw new Error("Tunnel address not found");
      if (typeof address === "string")
        throw new Error(
          `Server address is a string (${address}), expected an object`,
        );
      const assignedPort = address.port;
      const message = encodeMessage(
        0,
        "handshake",
        Buffer.from(JSON.stringify({ port: assignedPort })),
      );
      clientSocket.write(message);
    } catch (err) {
      clientSocket.destroy(err instanceof Error ? err : new Error(String(err)));
    }
  });

  tunnel.on("error", (err) => {
    masterServer.events.emit("tunnel-error", {
      clientSocket,
      tunnelServer: tunnel,
      err,
    });
  });
}
