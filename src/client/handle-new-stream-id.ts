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
    },
  );
  localSocket.on("data", (chunk) => {
    masterClient.events.emit("data-from-service", {
      data: chunk,
      serviceSocket: localSocket,
      tunnelSocket: tunnelSocketContext.socket,
    });
    const message = encodeMessage(streamId, "data", chunk);
    tunnelSocketContext.socket.write(message);
  });

  localSocket.on("close", () => {
    masterClient.events.emit("service-disconnected", {
      serviceSocket: localSocket,
    });
    tunnelSocketContext.destinationSockets.delete(streamId);
  });

  localSocket.on("error", (err) => {
    masterClient.events.emit("service-error", {
      serviceSocket: localSocket,
      err,
    });
    tunnelSocketContext.destinationSockets.delete(streamId);
  });
  await once(localSocket, "connect");
  return localSocket;
}
