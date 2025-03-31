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
    try {
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
        switch (messageType) {
          case "data": {
            if (!visitorSocket) {
              masterServer.events.emit("error", {
                err: new Error(
                  `No visitor socket found for stream ID ${streamId} (message type: ${messageType})`,
                ),
              });
              break;
            }
            if (!visitorSocket.writable) {
              masterServer.events.emit("error", {
                err: new Error(
                  `Received data from a client but the corresponding visitor socket (${streamId}) is not writable`,
                ),
              });
              clientSocketContext.destinationSockets.delete(streamId);
              visitorSocket.destroy();
              break;
            }
            masterServer.events.emit("data-to-visitor", {
              clientSocket,
              visitorSocket,
              data: messageData,
            });
            visitorSocket.write(messageData);
            break;
          }
          // if the client decides to close the connection (error or not)
          // just close the visitor socket (if it's still open)
          case "close":
          case "error": {
            if (!visitorSocket) {
              break;
            }
            visitorSocket.destroy();
            clientSocketContext.destinationSockets.delete(streamId);
            break;
          }
          default: {
            masterServer.events.emit("error", {
              err: new Error(`Unknown message type ${messageType}`),
            });
            break;
          }
        }
      }
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err));
      masterServer.events.emit("client-error", {
        err: error,
        clientSocket,
      });
      clientSocketContext.receiveBuffer = Buffer.alloc(0);
      clientSocket.destroy(error);
    }
  }

  clientSocket.on("data", chunkCallback);
}
