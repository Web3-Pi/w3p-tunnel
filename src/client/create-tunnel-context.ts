import net from "node:net";
import { SocketContext } from "../shared/SocketContext.ts";
import type { TunnelClient } from "../client.ts";
import { authenticateWithServer } from "./authenticate-with-server.ts";
import { setupDataListener } from "./setup-data-listener.ts";
import nodeTls from "node:tls";

export function createTunnelContext(
  masterClient: TunnelClient,
  host: string,
  port: number,
  localServicePort: number,
  tls: false | nodeTls.ConnectionOptions,
) {
  let tunnelSocket: net.Socket;

  const connectionListener = () => {
    masterClient.events.emit("tunnel-connection-established", {
      tunnelSocket,
    });
    authenticateWithServer(tunnelSocket, masterClient);
  };

  if (tls) {
    tunnelSocket = nodeTls.connect(port, host, tls, connectionListener);
  } else {
    tunnelSocket = net.createConnection(
      {
        host,
        port,
      },
      connectionListener,
    );
  }
  tunnelSocket.setKeepAlive(true, 30000);
  tunnelSocket.setTimeout(0);
  tunnelSocket.setNoDelay(true);

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
