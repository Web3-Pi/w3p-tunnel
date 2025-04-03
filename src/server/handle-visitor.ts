import type { TunnelServer } from "../server.ts";

import type net from "node:net";
import { getStreamId } from "./get-stream-id.ts";
import { encodeMessage } from "../shared/encode-message.ts";
import type { ClientTunnel } from "./ClientTunnel.ts";

/**
 * When a new visitor connects to the tunnel, handle all communication
 * between the visitor and the client.
 */
export function handleVisitor(
  masterServer: TunnelServer,
  visitorSocket: net.Socket,
  clientTunnel: ClientTunnel,
) {
  const streamId = getStreamId(clientTunnel);
  // Add the visitor socket to the client socket context
  clientTunnel.destinationSockets.set(streamId, visitorSocket);

  const clientSocket = clientTunnel.socket;

  // Manual data forwarding instead of pipe() to prevent automatic end propagation
  visitorSocket.on("data", (chunk) => {
    masterServer.events.emit("data-from-visitor", {
      data: chunk,
      clientTunnel,
      visitorSocket,
    });
    const encodedMessage = encodeMessage(streamId, "data", chunk);
    clientSocket.write(encodedMessage);
  });

  visitorSocket.on("end", () => {
    masterServer.events.emit("visitor-disconnected", {
      clientTunnel,
      visitorSocket,
    });
    const encodedMessage = encodeMessage(streamId, "close", Buffer.alloc(0));
    if (clientSocket.writable) {
      clientSocket.write(encodedMessage);
    }
    clientTunnel.destinationSockets.delete(streamId);
  });

  visitorSocket.on("error", (err) => {
    masterServer.events.emit("visitor-error", {
      clientTunnel,
      visitorSocket,
      err,
    });
    const encodedMessage = encodeMessage(streamId, "error", Buffer.alloc(0));
    if (clientSocket.writable) {
      clientSocket.write(encodedMessage);
    }
    clientTunnel.destinationSockets.delete(streamId);
    visitorSocket.destroy();
  });
}
