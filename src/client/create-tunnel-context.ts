import net from "node:net";
import { SocketContext } from "../shared/SocketContext.ts";
import { decodeMessage } from "../shared/decode-message.ts";
import type { TunnelClient } from "../client.ts";
import { handleNewStreamId } from "./handle-new-stream-id.ts";

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
      masterClient.events.emit("tunnel-connected", {
        tunnelSocket,
      });
    },
  );

  const tunnelSocketContext = new SocketContext(tunnelSocket);

  tunnelSocketContext.socket.on("data", async (chunk) => {
    if (!tunnelSocketContext) throw new Error("Tunnel socket not created");
    for (const { streamId, messageType, messageData } of decodeMessage(
      chunk,
      tunnelSocketContext,
    )) {
      // If this message comes from a new stream ID, create a new service socket
      if (!tunnelSocketContext.destinationSockets.has(streamId)) {
        await handleNewStreamId(
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
      masterClient.events.emit("data-to-service", {
        data: messageData,
        serviceSocket,
        tunnelSocket: tunnelSocketContext.socket,
      });
      switch (messageType) {
        case "data": {
          if (!serviceSocket.writable) {
            console.error("[ERROR] Service socket is not writable");
            tunnelSocketContext.destinationSockets.delete(streamId);
            continue;
          }
          serviceSocket.write(messageData);
          break;
        }
        case "error":
        case "close": {
          serviceSocket.destroy();
          break;
        }
        default: {
          console.error("Unknown message type", messageType);
          break;
        }
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
    // TODO: handle restarting the tunnel
  });

  tunnelSocketContext.socket.on("error", (err) => {
    masterClient.events.emit("tunnel-error", {
      tunnelSocket: tunnelSocketContext.socket,
      err,
    });
  });

  return tunnelSocketContext;
}
