import type { TunnelServer } from "../server.ts";

import type net from "node:net";
import type { SocketContext } from "../shared/SocketContext.ts";
import { getStreamId } from "./get-stream-id.ts";
import { encodeMessage } from "../shared/encode-message.ts";

/**
 * When a new visitor connects to the tunnel, handle all communication
 * between the visitor and the client.
 */
export function handleVisitor(
  masterServer: TunnelServer,
  visitorSocket: net.Socket,
  clientSocketContext: SocketContext,
  tunnel: net.Server,
) {
  const streamId = getStreamId(clientSocketContext);
  // Add the visitor socket to the client socket context
  clientSocketContext.destinationSockets.set(streamId, visitorSocket);

  const clientSocket = clientSocketContext.socket;

  // Manual data forwarding instead of pipe() to prevent automatic end propagation
  visitorSocket.on("data", (chunk) => {
    masterServer.events.emit("data-from-visitor", {
      data: chunk,
      clientSocket,
      visitorSocket,
    });
    const encodedMessage = encodeMessage(streamId, "data", chunk);
    clientSocket.write(encodedMessage);
  });

  visitorSocket.on("end", () => {
    masterServer.events.emit("visitor-disconnected", {
      clientSocket,
      visitorSocket,
    });
    const encodedMessage = encodeMessage(streamId, "close", Buffer.alloc(0));
    clientSocket.write(encodedMessage);

    clientSocketContext.destinationSockets.delete(streamId);
    visitorSocket.destroy();
  });

  visitorSocket.on("error", (err) => {
    masterServer.events.emit("visitor-error", {
      clientSocket,
      visitorSocket,
      err,
    });
  });
}
