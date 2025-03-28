import type { TunnelServer } from "../server.ts";
import type { SocketContext } from "../shared/SocketContext.ts";
import { setupDataListener } from "./setup-data-listener.ts";

/**
 * Create a tunnel that will forward traffic from the master server to the client socket
 * and vice versa.
 */
export function setupClientSocket(
  masterServer: TunnelServer,
  clientSocketContext: SocketContext,
) {
  const clientSocket = clientSocketContext.socket;

  setupDataListener(masterServer, clientSocketContext);

  const cleanupClientSocket = () => {
    const tunnel = masterServer.tunnels.get(clientSocket);
    if (tunnel) {
      tunnel.close();
      masterServer.tunnels.delete(clientSocket);
    }
    for (const [_, visitorSocket] of clientSocketContext.destinationSockets) {
      visitorSocket.destroy();
    }
    clientSocketContext.destinationSockets.clear();
    masterServer.authenticatedClients.delete(clientSocket);
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
}
