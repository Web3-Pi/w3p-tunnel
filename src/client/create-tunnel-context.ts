import net from "node:net";
import type { TunnelClient } from "../client.ts";
import { authenticateWithServer } from "./authenticate-with-server.ts";
import { setupDataListener } from "./setup-data-listener.ts";
import nodeTls from "node:tls";
import { ClientConnection } from "./ClientConnection.ts";

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
      clientConnection,
    });
    // Confirm protocol and send authentication credentials
    authenticateWithServer(clientConnection, masterClient);
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

  const clientConnection = new ClientConnection(tunnelSocket);

  setupDataListener(masterClient, clientConnection, localServicePort);

  clientConnection.socket.on("close", (hadError) => {
    masterClient.events.emit("tunnel-disconnected", {
      clientConnection,
      hadError,
    });
    clientConnection.socket.destroy();
    for (const [_, serviceSocket] of clientConnection.destinationSockets) {
      serviceSocket.destroy();
    }
    clientConnection.destinationSockets.clear();
    clientConnection.pendingData.clear();
    masterClient.tunnelSocketContext = null;
    masterClient.reconnectToServer();
  });

  clientConnection.socket.on("error", (err) => {
    masterClient.events.emit("tunnel-error", {
      clientConnection,
      err,
    });
  });

  return clientConnection;
}
