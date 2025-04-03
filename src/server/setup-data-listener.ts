import type { TunnelServer } from "../server.ts";
import { decodeMessage, parseMessageBody } from "../shared/decode-message.ts";
import { authenticateClient } from "./authenticate-client.ts";
import { MAGIC_BYTES, MAGIC_BYTES_LENGTH } from "../shared/constants.ts";
import type { ClientTunnel } from "./ClientTunnel.ts";

export function setupDataListener(
  masterServer: TunnelServer,
  clientTunnel: ClientTunnel,
) {
  const clientSocket = clientTunnel.socket;
  function chunkCallback(chunk: Buffer) {
    if (!clientTunnel || clientSocket.destroyed)
      throw new Error("Client socket not created");

    clientTunnel.receiveBuffer = Buffer.concat([
      clientTunnel.receiveBuffer,
      chunk,
    ]);

    try {
      // The first received chunk must begin with magic bytes to confirm the protocol
      if (!clientTunnel.isProtocolConfirmed) {
        if (clientTunnel.receiveBuffer.length < MAGIC_BYTES_LENGTH) {
          // Not enough data yet
          return;
        }
        const receivedMagicBytes = clientTunnel.receiveBuffer.subarray(
          0,
          MAGIC_BYTES_LENGTH,
        );
        if (!(Buffer.compare(receivedMagicBytes, MAGIC_BYTES) === 0)) {
          throw new Error("Invalid magic bytes");
        }
        clientTunnel.isProtocolConfirmed = true;
        // remove the magic bytes from the receive buffer
        clientTunnel.receiveBuffer =
          clientTunnel.receiveBuffer.subarray(MAGIC_BYTES_LENGTH);
        masterServer.events.emit("client-protocol-confirmed", {
          clientTunnel,
        });
        // the rest of the receiveBuffer can now be safely decoded
      }

      for (const { messageBody } of decodeMessage(clientTunnel)) {
        const expectingHandshake = !clientTunnel.isHandshakeAcknowledged;
        const parsedMessage = parseMessageBody(messageBody, expectingHandshake);
        if (parsedMessage.messageType === "handshake") {
          // this function will throw an error if the handshake is invalid
          authenticateClient(masterServer, clientTunnel, parsedMessage.data);
          continue;
        }
        if (expectingHandshake) {
          throw new Error(
            "Expected a handshake message but got something else",
          );
        }
        const { streamId, messageType, messageData } = parsedMessage;
        const visitorSocket = clientTunnel.destinationSockets.get(streamId);
        switch (messageType) {
          case "data": {
            if (!visitorSocket) {
              // This is a valid case, the visitor socket may have disconnected while
              // the client was still processing their request
              masterServer.events.emit("client-error", {
                clientTunnel,
                err: new Error(
                  `Received data from a client but the corresponding visitor socket (${streamId}) is not found`,
                ),
              });
              break;
            }
            if (!visitorSocket.writable) {
              masterServer.events.emit("client-error", {
                clientTunnel,
                err: new Error(
                  `Received data from a client but the corresponding visitor socket (${streamId}) is not writable`,
                ),
              });
              clientTunnel.destinationSockets.delete(streamId);
              visitorSocket.destroy();
              break;
            }
            masterServer.events.emit("data-to-visitor", {
              clientTunnel,
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
            clientTunnel.destinationSockets.delete(streamId);
            break;
          }
          default: {
            masterServer.events.emit("client-error", {
              clientTunnel,
              err: new Error(`Unknown message type ${messageType}`),
            });
            break;
          }
        }
      }
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err));
      clientTunnel.receiveBuffer = Buffer.alloc(0);
      clientSocket.destroy(error);
    }
  }

  clientSocket.on("data", chunkCallback);
}
