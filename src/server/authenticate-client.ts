import type { TunnelServer } from "../server.ts";
import type net from "node:net";
import { createTunnel } from "./create-tunnel.ts";
import type { SocketContext } from "../shared/SocketContext.ts";

export function authenticateClient(
  masterServer: TunnelServer,
  clientSocketContext: SocketContext,
  messageData: Buffer,
) {
  const clientSocket = clientSocketContext.socket;
  // parse binary message data to a json object and check if it contains the id
  try {
    const handshakeMessageParsed = JSON.parse(messageData.toString());
    if (typeof handshakeMessageParsed.id !== "string") {
      throw new Error("id is not a string");
    }
    masterServer.authenticatedClients.set(clientSocket, handshakeMessageParsed);
    // client is authenticated! Create a tunnel
    createTunnel(masterServer, clientSocketContext, handshakeMessageParsed);
  } catch (err) {
    console.error("Failed to parse handshake message", err);
    masterServer.events.emit("client-error", {
      clientSocket,
      err: new Error("Failed to parse handshake message"),
    });
    clientSocket.destroy();
    return;
  }
}
