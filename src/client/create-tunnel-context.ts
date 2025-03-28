import net from "node:net";
import { SocketContext } from "../shared/SocketContext.ts";
import { decodeMessage } from "../shared/decode-message.ts";
import type { TunnelClient } from "../client.ts";
import { handleNewStreamId } from "./handle-new-stream-id.ts";
import { authenticateWithServer } from "./authenticate-with-server.ts";

export function createTunnelContext(
  masterClient: TunnelClient,
  host: string,
  port: number,
  localServicePort: number,
) {
  const tunnelSocket = net.createConnection(
    {
      host,
      port,
      noDelay: true,
      keepAlive: true,
      timeout: 0,
    },
    () => {
      masterClient.events.emit("tunnel-connection-established", {
        tunnelSocket,
      });
      authenticateWithServer(tunnelSocket, masterClient);
    },
  );

  const tunnelSocketContext = new SocketContext(tunnelSocket);

  tunnelSocketContext.socket.on("data", async (chunk) => {
    if (!tunnelSocketContext) throw new Error("Tunnel socket not created");
    for (const { streamId, messageType, messageData } of decodeMessage(
      chunk,
      tunnelSocketContext,
    )) {
      if (messageType === "handshake") {
        try {
          const assignedPort = JSON.parse(messageData.toString()).port;
          if (Number.isNaN(assignedPort)) {
            throw new Error(`Got assigned a non-number port: ${assignedPort}`);
          }
          masterClient.events.emit("authentication-acknowledged", {
            tunnelSocket,
            assignedPort,
          });
        } catch (err) {
          masterClient.events.emit("tunnel-error", {
            tunnelSocket,
            err: err instanceof Error ? err : new Error(String(err)),
          });
          tunnelSocket.destroy();
        }
        continue;
      }

      // If this message comes from a new stream ID, create a new service socket
      if (!tunnelSocketContext.destinationSockets.has(streamId)) {
        handleNewStreamId(
          masterClient,
          streamId,
          tunnelSocketContext,
          localServicePort,
        );
      }
      const serviceSocket =
        tunnelSocketContext.destinationSockets.get(streamId);
      if (!serviceSocket) {
        console.error("No service socket found for stream ID", streamId);
        continue;
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
          console.error("Unknown message type", messageType);
          break;
      }
    }
  });

  tunnelSocketContext.socket.on("end", () => {
    masterClient.events.emit("tunnel-disconnected", {
      tunnelSocket: tunnelSocketContext.socket,
    });
    tunnelSocketContext.socket.destroy();
    for (const [_, serviceSocket] of tunnelSocketContext.destinationSockets) {
      serviceSocket.destroy();
    }
    tunnelSocketContext.destinationSockets.clear();
    tunnelSocketContext.pendingData.clear();
    masterClient.reconnectToServer();
  });

  tunnelSocketContext.socket.on("error", (err) => {
    masterClient.events.emit("tunnel-error", {
      tunnelSocket: tunnelSocketContext.socket,
      err,
    });
  });

  return tunnelSocketContext;
}
