import net from "node:net";
import { encodeMessage } from "../shared/encode-message.ts";
import type { TunnelClient } from "../client.ts";
import type { ClientConnection } from "./ClientConnection.ts";

/**
 * When a new stream ID is received from the tunnel (e.g. when a new visitor connects),
 * create a new service socket and connect it to the tunnel.
 * This function will resolve when the service socket is connected.
 */
export function handleNewStreamId(
  masterClient: TunnelClient,
  streamId: number,
  clientConnection: ClientConnection,
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
      tunnelSocket: clientConnection.socket,
    });
    const message = encodeMessage(streamId, "data", chunk);
    if (clientConnection.socket.writable) {
      clientConnection.socket.write(message);
    }
  });
  clientConnection.destinationSockets.set(streamId, localSocket);

  localSocket.on("connect", () => {
    masterClient.events.emit("service-connected", {
      serviceSocket: localSocket,
    });

    // If any messages arrived during connection, send them now
    const queue = clientConnection.pendingData.get(localSocket);
    if (queue && localSocket.writable) {
      for (const data of queue) {
        localSocket.write(data);
      }
    }
    clientConnection.pendingData.delete(localSocket);
  });

  localSocket.on("close", () => {
    masterClient.events.emit("service-disconnected", {
      serviceSocket: localSocket,
    });
    clientConnection.destinationSockets.delete(streamId);
    clientConnection.pendingData.delete(localSocket);
    if (clientConnection.socket.writable) {
      const message = encodeMessage(streamId, "close", Buffer.alloc(0));
      clientConnection.socket.write(message);
    }
  });

  localSocket.on("error", (err) => {
    masterClient.events.emit("service-error", {
      serviceSocket: localSocket,
      err,
    });
    clientConnection.destinationSockets.delete(streamId);
    clientConnection.pendingData.delete(localSocket);
    localSocket.destroy();
    if (clientConnection.socket.writable) {
      const message = encodeMessage(streamId, "error", Buffer.alloc(0));
      clientConnection.socket.write(message);
    }
  });
  return localSocket;
}
