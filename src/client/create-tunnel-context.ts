import net from "node:net";
import { SocketContext } from "../shared/SocketContext.ts";
import type { TunnelClient } from "../client.ts";
import { authenticateWithServer } from "./authenticate-with-server.ts";
import { setupDataListener } from "./setup-data-listener.ts";

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
      masterClient.events.emit("tunnel-connection-established", {
        tunnelSocket,
      });
      authenticateWithServer(tunnelSocket, masterClient);
    },
  );

  const tunnelSocketContext = new SocketContext(tunnelSocket);

  setupDataListener(masterClient, tunnelSocketContext, localServicePort);

  tunnelSocketContext.socket.on("end", () => {
    masterClient.events.emit("tunnel-disconnected", {
      tunnelSocket: tunnelSocketContext.socket,
    });
    tunnelSocketContext.socket.destroy();
    for (const [_, serviceSocket] of tunnelSocketContext.destinationSockets) {
      serviceSocket.destroy();
    }
    tunnelSocketContext.destinationSockets.clear();
    tunnelSocketContext.pendingData.clear();
    masterClient.tunnelSocketContext = null;
    masterClient.reconnectToServer();
  });

  tunnelSocketContext.socket.on("error", (err) => {
    masterClient.events.emit("tunnel-error", {
      tunnelSocket: tunnelSocketContext.socket,
      err,
    });
  });

  return tunnelSocketContext;
}
