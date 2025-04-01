import net from "node:net";
import type { ServerEvents, TypeSafeEventEmitter } from "./events.ts";
import EventEmitter from "node:events";
import { setupClientSocket } from "./server/setup-client-socket.ts";
import { SocketContext } from "./shared/SocketContext.ts";
import nodeTls from "node:tls";

export class TunnelServer {
  public tunnels = new Map<net.Socket, net.Server>();
  private server: net.Server;
  public authenticatedClients = new Map<net.Socket, Record<string, unknown>>();
  public events: TypeSafeEventEmitter<ServerEvents> = new EventEmitter();

  tls:
    | {
        mainServer?: nodeTls.TlsOptions | false;
        tunnelServer?: nodeTls.TlsOptions | false;
      }
    | false;

  connectionFilter: (
    authenticationCredentials: Record<string, unknown>,
  ) => boolean | Promise<boolean>;

  get tlsEnabled() {
    return !!this.tls && !!this.tls.mainServer;
  }

  constructor({
    connectionFilter,
    tls,
  }: {
    connectionFilter?: (
      authenticationCredentials: Record<string, unknown>,
    ) => boolean | Promise<boolean>;
    tls?:
      | {
          mainServer?: nodeTls.TlsOptions | false;
          tunnelServer?: nodeTls.TlsOptions | false;
        }
      | false;
  } = {}) {
    this.connectionFilter = connectionFilter || (() => true);
    this.tls = tls || false;

    const connectionCallback = (clientSocket: net.Socket) => {
      this.events.emit("client-connected", { clientSocket });
      clientSocket.setKeepAlive(true, 30000);
      clientSocket.setTimeout(0);
      clientSocket.setNoDelay(true);
      const socketContext = new SocketContext(clientSocket);
      setupClientSocket(this, socketContext);
    };

    // biome-ignore lint/complexity/useOptionalChain: false positive? tls can be `false`
    if (tls && tls.mainServer) {
      this.server = nodeTls.createServer(tls.mainServer, connectionCallback);
    } else {
      this.server = net.createServer(connectionCallback);
    }
  }

  start(port = 9000) {
    this.server.listen(port, () => {
      this.events.emit("main-server-start", { port, secure: this.tlsEnabled });
    });

    this.server.on("error", (err) => {
      this.events.emit("main-server-error", { err });
    });

    this.server.on("close", () => {
      this.events.emit("main-server-end", undefined);
    });
  }

  stop() {
    this.server.close();
    for (const [socket, tunnel] of this.tunnels) {
      socket.destroy();
      tunnel.close();
    }
  }
}
