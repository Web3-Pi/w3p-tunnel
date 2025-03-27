import net from "node:net";
import type { ServerEvents, TypeSafeEventEmitter } from "./events.ts";
import EventEmitter from "node:events";
import { setupClientSocket } from "./server/setup-client-socket.ts";
import { SocketContext } from "./shared/SocketContext.ts";

export class TunnelServer {
  public tunnels = new Map<net.Socket, net.Server>();
  private server: net.Server;
  public authenticatedClients = new Map<
    net.Socket,
    {
      id: string;
    }
  >();
  public events: TypeSafeEventEmitter<ServerEvents> = new EventEmitter();

  constructor() {
    this.server = net.createServer((clientSocket) => {
      this.events.emit("client-connected", { clientSocket });
      clientSocket.setKeepAlive(true, 30000);
      clientSocket.setTimeout(0);
      clientSocket.setNoDelay(true);
      const socketContext = new SocketContext(clientSocket);
      setupClientSocket(this, socketContext);
    });
  }

  start(port = 9000) {
    this.server.listen(port, () => {
      this.events.emit("main-server-start", { port });
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
