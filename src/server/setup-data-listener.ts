import type { TunnelServer } from "../server.ts";
import { decodeMessage } from "../shared/decode-message.ts";
import type { SocketContext } from "../shared/SocketContext.ts";
import { authenticateClient } from "./authenticate-client.ts";

export function setupDataListener(
  masterServer: TunnelServer,
  clientSocketContext: SocketContext,
) {
  const clientSocket = clientSocketContext.socket;
  function chunkCallback(chunk: Buffer) {
    for (const { streamId, messageType, messageData } of decodeMessage(
      chunk,
      clientSocketContext,
    )) {
      if (!masterServer.authenticatedClients.has(clientSocket)) {
        if (messageType !== "handshake") {
          masterServer.events.emit("client-error", {
            clientSocket,
            err: new Error("Client sent a message before handshake"),
          });
          clientSocket.destroy();
          continue;
        }
        authenticateClient(masterServer, clientSocketContext, messageData);
        continue;
      }
      const visitorSocket =
        clientSocketContext.destinationSockets.get(streamId);
      if (!visitorSocket) {
        console.error("No visitor socket found for stream ID", streamId);
        continue;
      }
      switch (messageType) {
        case "data": {
          if (!visitorSocket.writable) {
            console.error("Visitor socket is not writable", visitorSocket);
            clientSocketContext.destinationSockets.delete(streamId);
            continue;
          }
          masterServer.events.emit("data-to-visitor", {
            clientSocket,
            visitorSocket,
            data: messageData,
          });
          visitorSocket.write(messageData);
          break;
        }
        case "close": {
          masterServer.events.emit("visitor-disconnected", {
            clientSocket,
            visitorSocket,
          });
          visitorSocket.destroy();
          break;
        }
        case "error": {
          masterServer.events.emit("visitor-error", {
            clientSocket,
            visitorSocket,
            err: new Error("Visitor error"),
          });
          visitorSocket.destroy();
          break;
        }
        default: {
          console.error("Unknown message type", messageType);
          break;
        }
      }
    }
  }
  clientSocket.on("data", chunkCallback);
}
