import net from "node:net";
import { encodeMessage } from "../shared/encode-message.ts";
import type { SocketContext } from "../shared/SocketContext.ts";
import type { TunnelClient } from "../client.ts";

/**
 * When a new stream ID is received from the tunnel (e.g. when a new visitor connects),
 * create a new service socket and connect it to the tunnel.
 * This function will resolve when the service socket is connected.
 */
export function handleNewStreamId(
  masterClient: TunnelClient,
  streamId: number,
  tunnelSocketContext: SocketContext,
  localServicePort: number,
) {
  const localSocket = net.createConnection({
    host: "localhost",
    port: localServicePort,
  });
  localSocket.on("data", (chunk) => {
    masterClient.events.emit("data-from-service", {
      data: chunk,
      serviceSocket: localSocket,
      tunnelSocket: tunnelSocketContext.socket,
    });
    const message = encodeMessage(streamId, "data", chunk);
    if (tunnelSocketContext.socket.writable) {
      tunnelSocketContext.socket.write(message);
    }
  });
  tunnelSocketContext.destinationSockets.set(streamId, localSocket);

  localSocket.on("connect", () => {
    masterClient.events.emit("service-connected", {
      serviceSocket: localSocket,
    });

    // If any messages arrived during connection, send them now
    const queue = tunnelSocketContext.pendingData.get(localSocket);
    if (queue && localSocket.writable) {
      for (const data of queue) {
        localSocket.write(data);
      }
    }
    tunnelSocketContext.pendingData.delete(localSocket);
  });

  localSocket.on("close", () => {
    masterClient.events.emit("service-disconnected", {
      serviceSocket: localSocket,
    });
    tunnelSocketContext.destinationSockets.delete(streamId);
    tunnelSocketContext.pendingData.delete(localSocket);
    if (tunnelSocketContext.socket.writable) {
      const message = encodeMessage(streamId, "close", Buffer.alloc(0));
      tunnelSocketContext.socket.write(message);
    }
  });

  localSocket.on("error", (err) => {
    masterClient.events.emit("service-error", {
      serviceSocket: localSocket,
      err,
    });
    tunnelSocketContext.destinationSockets.delete(streamId);
    tunnelSocketContext.pendingData.delete(localSocket);
    localSocket.destroy();
    if (tunnelSocketContext.socket.writable) {
      const message = encodeMessage(streamId, "error", Buffer.alloc(0));
      tunnelSocketContext.socket.write(message);
    }
  });
  return localSocket;
}
