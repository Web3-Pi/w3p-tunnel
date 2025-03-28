import type { TunnelClient } from "../client.ts";
import { decodeMessage } from "../shared/decode-message.ts";
import type { SocketContext } from "../shared/SocketContext.ts";
import { handleHandshakeResponse } from "./handle-handshake-response.ts";
import { handleNewStreamId } from "./handle-new-stream-id.ts";

export function setupDataListener(
  masterClient: TunnelClient,
  tunnelSocketContext: SocketContext,
  localServicePort: number,
) {
  const tunnelSocket = tunnelSocketContext.socket;
  tunnelSocketContext.socket.on("data", (chunk) => {
    if (!tunnelSocketContext) throw new Error("Tunnel socket not created");

    try {
      for (const { streamId, messageType, messageData } of decodeMessage(
        chunk,
        tunnelSocketContext,
      )) {
        if (messageType === "handshake") {
          // this function will throw an error if the handshake is invalid
          handleHandshakeResponse(masterClient, tunnelSocket, messageData);
          continue;
        }

        let serviceSocket =
          tunnelSocketContext.destinationSockets.get(streamId);
        // If this message comes from a new stream ID, create a new service socket
        if (!serviceSocket) {
          handleNewStreamId(
            masterClient,
            streamId,
            tunnelSocketContext,
            localServicePort,
          );
          serviceSocket = tunnelSocketContext.destinationSockets.get(streamId);
          if (!serviceSocket) {
            masterClient.events.emit("error", {
              err: new Error(
                `Tried to create a service socket for stream ID ${streamId} but it was not found`,
              ),
            });
            continue;
          }
        }
        switch (messageType) {
          case "data": {
            if (serviceSocket.writable) {
              masterClient.events.emit("data-to-service", {
                data: messageData,
                serviceSocket,
                tunnelSocket: tunnelSocketContext.socket,
              });
              serviceSocket.write(messageData);
              break;
            }
            // If the service socket is in the process of connecting, queue the data
            if (!serviceSocket.destroyed) {
              let queue = tunnelSocketContext.pendingData.get(serviceSocket);
              if (!queue) {
                queue = [];
                tunnelSocketContext.pendingData.set(serviceSocket, queue);
              }
              queue.push(messageData);
              break;
            }
            // Socket is not writable and not connecting, it was probably closed
            masterClient.events.emit("service-error", {
              serviceSocket,
              err: new Error("Tried to write to a closed socket"),
            });
            tunnelSocketContext.pendingData.delete(serviceSocket);
            break;
          }
          case "error":
          case "close":
            serviceSocket.destroy();
            tunnelSocketContext.destinationSockets.delete(streamId);
            tunnelSocketContext.pendingData.delete(serviceSocket);
            break;
          default:
            masterClient.events.emit("error", {
              err: new Error(`Unknown message type ${messageType}`),
            });
            break;
        }
      }
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err));
      masterClient.events.emit("tunnel-error", {
        tunnelSocket: tunnelSocketContext.socket,
        err: error,
      });
      tunnelSocketContext.receiveBuffer = Buffer.alloc(0);
      tunnelSocketContext.socket.destroy(error);
    }
  });
}
