import type { TunnelServer } from "../server.ts";
import { createTunnel } from "./create-tunnel.ts";
import type { ClientTunnel } from "./ClientTunnel.ts";

export async function authenticateClient(
  masterServer: TunnelServer,
  clientTunnel: ClientTunnel,
  messageData: Record<string, unknown>,
) {
  const clientSocket = clientTunnel.socket;
  // parse binary message data to a json object and check if it contains the id
  try {
    if (typeof messageData !== "object" || messageData === null) {
      throw new Error("handshake message is not an object");
    }
    const isAuthenticated = await masterServer.connectionFilter(messageData);
    if (!isAuthenticated) {
      throw new Error("Client rejected by connection filter");
    }
    // client is authenticated! Create a tunnel
    clientTunnel.isHandshakeAcknowledged = true;
    createTunnel(masterServer, clientTunnel, messageData);
  } catch (err) {
    const error = err instanceof Error ? err : new Error(String(err));
    masterServer.events.emit("client-authentication-failed", {
      clientSocket,
      err: error,
    });
    clientSocket.destroy(error);
    return;
  }
}
