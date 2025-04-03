import type { TunnelServer } from "../server.ts";
import type { ClientTunnel } from "./ClientTunnel.ts";
import { setupDataListener } from "./setup-data-listener.ts";

/**
 * Create a tunnel that will forward traffic from the master server to the client socket
 * and vice versa.
 */
export function setupClientSocket(
  masterServer: TunnelServer,
  clientTunnel: ClientTunnel,
) {
  const clientSocket = clientTunnel.socket;

  setupDataListener(masterServer, clientTunnel);

  const cleanupClientSocket = () => {
    if (clientTunnel.tunnel) {
      clientTunnel.tunnel.close();
    }
    masterServer.tunnels.delete(clientTunnel);
    for (const [_, visitorSocket] of clientTunnel.destinationSockets) {
      visitorSocket.destroy();
    }
    clientTunnel.destinationSockets.clear();
    clientSocket.removeAllListeners();
    clientSocket.destroy();
  };

  clientSocket.on("error", (err) => {
    masterServer.events.emit("client-error", {
      clientTunnel,
      err,
    });
    cleanupClientSocket();
  });

  clientSocket.on("close", () => {
    masterServer.events.emit("client-disconnected", {
      clientTunnel,
    });
    cleanupClientSocket();
  });
}
