import type { TunnelServer } from "../server.ts";
import net from "node:net";
import { handleVisitor } from "./handle-visitor.ts";
import type { SocketContext } from "../shared/SocketContext.ts";
import { decodeMessage } from "../shared/decode-message.ts";

/**
 * Create a tunnel that will forward traffic from the master server to the client socket
 * and vice versa.
 */
export function createTunnelForClient(
  masterServer: TunnelServer,
  clientSocketContext: SocketContext,
) {
  const clientSocket = clientSocketContext.socket;

  // Create a proxy server that will forward connections to the client
  const tunnel = net.createServer((visitorSocket) => {
    masterServer.events.emit("visitor-connected", {
      clientSocket,
      tunnelServer: tunnel,
      visitorSocket,
    });
    handleVisitor(masterServer, visitorSocket, clientSocketContext, tunnel);
  });

  // Setup data forwarding from client to visitor
  clientSocket.on("data", (chunk) => {
    for (const { streamId, messageType, messageData } of decodeMessage(
      chunk,
      clientSocketContext,
    )) {
      const visitorSocket =
        clientSocketContext.destinationSockets.get(streamId);
      if (!visitorSocket) {
        console.error("No visitor socket found for stream ID", streamId);
        continue;
      }
      switch (messageType) {
        case "data": {
          if (!visitorSocket.writable) {
            console.error("Visitor socket is not writable", visitorSocket);
            clientSocketContext.destinationSockets.delete(streamId);
            continue;
          }
          masterServer.events.emit("data-to-visitor", {
            clientSocket,
            tunnelServer: tunnel,
            visitorSocket,
            data: messageData,
          });
          visitorSocket.write(messageData);
          break;
        }
        case "close": {
          masterServer.events.emit("visitor-disconnected", {
            clientSocket,
            tunnelServer: tunnel,
            visitorSocket,
          });
          visitorSocket.destroy();
          break;
        }
        case "error": {
          masterServer.events.emit("visitor-error", {
            clientSocket,
            tunnelServer: tunnel,
            visitorSocket,
            err: new Error("Visitor error"),
          });
          visitorSocket.destroy();
          break;
        }
        default: {
          console.error("Unknown message type", messageType);
          break;
        }
      }
    }
  });
  // Start listening on a random port
  tunnel.listen(0, () => {
    masterServer.events.emit("tunnel-created", {
      clientSocket,
      tunnelServer: tunnel,
    });
    masterServer.tunnels.set(clientSocket, tunnel);
  });

  const cleanupClientSocket = () => {
    const tunnel = masterServer.tunnels.get(clientSocket);
    if (tunnel) {
      tunnel.close();
      masterServer.tunnels.delete(clientSocket);
    }
    clientSocket.removeAllListeners();
    clientSocket.destroy();
  };

  clientSocket.on("error", (err) => {
    masterServer.events.emit("client-error", {
      clientSocket,
      err,
    });
    cleanupClientSocket();
  });

  clientSocket.on("close", () => {
    masterServer.events.emit("client-disconnected", {
      clientSocket,
    });
    cleanupClientSocket();
  });

  // force recreate the proxy server on error
  tunnel.on("error", (err) => {
    masterServer.events.emit("tunnel-error", {
      clientSocket,
      tunnelServer: tunnel,
      err,
    });
    cleanupClientSocket();
  });
}
