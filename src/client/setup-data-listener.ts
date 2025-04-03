import type { TunnelClient } from "../client.ts";
import { MAGIC_BYTES, MAGIC_BYTES_LENGTH } from "../shared/constants.ts";
import { decodeMessage, parseMessageBody } from "../shared/decode-message.ts";
import type { ClientConnection } from "./ClientConnection.ts";
import { handleHandshakeResponse } from "./handle-handshake-response.ts";
import { handleNewStreamId } from "./handle-new-stream-id.ts";

export function setupDataListener(
  masterClient: TunnelClient,
  clientConnection: ClientConnection,
  localServicePort: number,
) {
  const tunnelSocket = clientConnection.socket;
  clientConnection.socket.on("data", (chunk) => {
    if (!clientConnection || tunnelSocket.destroyed)
      throw new Error("Tunnel socket not created");

    clientConnection.receiveBuffer = Buffer.concat([
      clientConnection.receiveBuffer,
      chunk,
    ]);

    try {
      // The first received chunk must begin with magic bytes to confirm the protocol
      if (!clientConnection.isProtocolConfirmed) {
        if (clientConnection.receiveBuffer.length < MAGIC_BYTES_LENGTH) {
          // Not enough data yet
          return;
        }
        const receivedMagicBytes = clientConnection.receiveBuffer.subarray(
          0,
          MAGIC_BYTES_LENGTH,
        );
        if (!(Buffer.compare(receivedMagicBytes, MAGIC_BYTES) === 0)) {
          throw new Error("Invalid magic bytes");
        }
        clientConnection.isProtocolConfirmed = true;
        // remove the magic bytes from the receive buffer
        clientConnection.receiveBuffer =
          clientConnection.receiveBuffer.subarray(MAGIC_BYTES_LENGTH);
        masterClient.events.emit("tunnel-protocol-confirmed", {
          clientConnection,
        });
        // the rest of the receiveBuffer can now be safely decoded
      }

      for (const { messageBody } of decodeMessage(clientConnection)) {
        const expectingHandshake = !clientConnection.isHandshakeAcknowledged;
        const parsedMessage = parseMessageBody(messageBody, expectingHandshake);
        if (parsedMessage.messageType === "handshake") {
          // this function will throw an error if the handshake is invalid
          handleHandshakeResponse(
            masterClient,
            clientConnection,
            parsedMessage.data,
          );
          continue;
        }
        if (expectingHandshake) {
          throw new Error(
            "Expected a handshake message but got something else",
          );
        }
        const { streamId, messageType, messageData } = parsedMessage;

        let serviceSocket = clientConnection.destinationSockets.get(streamId);
        // If this message comes from a new stream ID, create a new service socket
        if (!serviceSocket) {
          handleNewStreamId(
            masterClient,
            streamId,
            clientConnection,
            localServicePort,
          );
          serviceSocket = clientConnection.destinationSockets.get(streamId);
          if (!serviceSocket) {
            masterClient.events.emit("tunnel-error", {
              clientConnection,
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
                clientConnection,
              });
              serviceSocket.write(messageData);
              break;
            }
            // If the service socket is in the process of connecting, queue the data
            if (!serviceSocket.destroyed) {
              let queue = clientConnection.pendingData.get(serviceSocket);
              if (!queue) {
                queue = [];
                clientConnection.pendingData.set(serviceSocket, queue);
              }
              queue.push(messageData);
              break;
            }
            // Socket is not writable and not connecting, it was probably closed
            masterClient.events.emit("service-error", {
              serviceSocket,
              err: new Error("Tried to write to a closed socket"),
            });
            clientConnection.pendingData.delete(serviceSocket);
            break;
          }
          case "error":
          case "close":
            serviceSocket.destroy();
            clientConnection.destinationSockets.delete(streamId);
            clientConnection.pendingData.delete(serviceSocket);
            break;
          default:
            masterClient.events.emit("tunnel-error", {
              clientConnection,
              err: new Error(`Unknown message type ${messageType}`),
            });
            break;
        }
      }
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err));
      masterClient.events.emit("tunnel-error", {
        clientConnection,
        err: error,
      });
      clientConnection.receiveBuffer = Buffer.alloc(0);
      clientConnection.socket.destroy(error);
    }
  });
}
