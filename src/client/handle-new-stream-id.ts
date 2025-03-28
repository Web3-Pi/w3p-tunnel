import net from "node:net";
import { encodeMessage } from "../shared/encode-message.ts";
import type { SocketContext } from "../shared/SocketContext.ts";
import { once } from "node:events";
import type { TunnelClient } from "../client.ts";

/**
 * When a new stream ID is received from the tunnel (e.g. when a new visitor connects),
 * create a new service socket and connect it to the tunnel.
 * This function will resolve when the service socket is connected.
 */
export async function handleNewStreamId(
  masterClient: TunnelClient,
  streamId: number,
  tunnelSocketContext: SocketContext,
  localServicePort: number,
) {
  const localSocket = net.createConnection(
    { host: "localhost", port: localServicePort },
    () => {
      // each streamId gets its own service socket
      tunnelSocketContext.destinationSockets.set(streamId, localSocket);
      masterClient.events.emit("service-connected", {
        serviceSocket: localSocket,
      });
    },
  );
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

  localSocket.on("close", () => {
    masterClient.events.emit("service-disconnected", {
      serviceSocket: localSocket,
    });
    tunnelSocketContext.destinationSockets.delete(streamId);
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
    if (tunnelSocketContext.socket.writable) {
      const message = encodeMessage(streamId, "error", Buffer.alloc(0));
      tunnelSocketContext.socket.write(message);
    }
    localSocket.destroy();
  });
  try {
    await once(localSocket, "connect");
  } catch (err) {
    masterClient.events.emit("service-error", {
      serviceSocket: localSocket,
      err: err instanceof Error ? err : new Error(String(err)),
    });
    tunnelSocketContext.destinationSockets.delete(streamId);
    if (tunnelSocketContext.socket.writable) {
      const message = encodeMessage(streamId, "error", Buffer.alloc(0));
      tunnelSocketContext.socket.write(message);
    }
    localSocket.destroy();
  }
  return localSocket;
}
