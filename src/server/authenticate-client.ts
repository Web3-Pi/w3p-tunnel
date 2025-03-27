import type { TunnelServer } from "../server.ts";
import { createTunnel } from "./create-tunnel.ts";
import type { SocketContext } from "../shared/SocketContext.ts";

export async function authenticateClient(
  masterServer: TunnelServer,
  clientSocketContext: SocketContext,
  messageData: Buffer,
) {
  const clientSocket = clientSocketContext.socket;
  // parse binary message data to a json object and check if it contains the id
  try {
    const handshakeMessageParsed = JSON.parse(messageData.toString());
    if (typeof handshakeMessageParsed !== "object") {
      throw new Error("handshake message is not an object");
    }
    const isAuthenticated = await masterServer.connectionFilter(
      handshakeMessageParsed,
    );
    if (!isAuthenticated) {
      throw new Error("Client rejected by connection filter");
    }
    // client is authenticated! Create a tunnel
    masterServer.authenticatedClients.set(clientSocket, handshakeMessageParsed);
    createTunnel(masterServer, clientSocketContext, handshakeMessageParsed);
  } catch (err) {
    masterServer.events.emit("client-authentication-failed", {
      clientSocket,
      err: err instanceof Error ? err : new Error(String(err)),
    });
    clientSocket.destroy();
    return;
  }
}
