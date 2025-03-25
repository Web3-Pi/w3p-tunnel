import net from "node:net";
import type { ServerEvents, TypeSafeEventEmitter } from "./events.ts";
import EventEmitter from "node:events";

export class TunnelServer {
  public tunnels = new Map<net.Socket, net.Server>();
  private server: net.Server;
  public events: TypeSafeEventEmitter<ServerEvents> = new EventEmitter();

  constructor() {
    this.server = net.createServer((clientSocket) => {
      this.events.emit("client-connected", { clientSocket });

      clientSocket.setKeepAlive(true);
      clientSocket.setTimeout(0);
      clientSocket.setNoDelay(true);

      // Create a proxy server that will forward connections to the client
      const proxyServer = net.createServer((visitorSocket) => {
        this.events.emit("visitor-connected", {
          clientSocket,
          tunnelServer: this.server,
          visitorSocket,
        });

        visitorSocket.setKeepAlive(true, 30000);
        visitorSocket.setTimeout(0);
        visitorSocket.setNoDelay(true);

        // Manual data forwarding instead of pipe() to prevent automatic end propagation
        visitorSocket.on("data", (data) => {
          this.events.emit("data-from-visitor", {
            data,
            clientSocket,
            tunnelServer: this.server,
            visitorSocket,
            proxyServer,
            proxySocket: visitorSocket,
          });
          clientSocket.write(data);
        });

        const forwardDataToVisitor = (data: Buffer) => {
          if (visitorSocket.writable) {
            this.events.emit("data-to-visitor", {
              data,
              clientSocket,
              tunnelServer: this.server,
              visitorSocket,
              proxyServer,
              proxySocket: visitorSocket,
            });
            visitorSocket.write(data);
          }
        };

        clientSocket.on("data", forwardDataToVisitor);

        visitorSocket.on("end", () => {
          this.events.emit("visitor-disconnected", {
            clientSocket,
            tunnelServer: this.server,
            visitorSocket,
          });

          clientSocket.removeListener("data", forwardDataToVisitor);
          visitorSocket.destroy();
        });

        visitorSocket.on("error", (err) => {
          this.events.emit("visitor-error", {
            clientSocket,
            tunnelServer: this.server,
            visitorSocket,
            err,
          });
          visitorSocket.destroy();
        });
      });

      // Start listening on a random port
      proxyServer.listen(0, () => {
        this.events.emit("tunnel-created", {
          clientSocket,
          tunnelServer: proxyServer,
        });
        this.tunnels.set(clientSocket, proxyServer);
      });

      const cleanupClientSocket = () => {
        const tunnel = this.tunnels.get(clientSocket);
        if (tunnel) {
          tunnel.close();
          this.tunnels.delete(clientSocket);
        }
        clientSocket.removeAllListeners();
        clientSocket.destroy();
      };

      clientSocket.on("error", (err) => {
        this.events.emit("client-error", {
          clientSocket,
          err,
        });
        cleanupClientSocket();
      });

      clientSocket.on("close", () => {
        this.events.emit("client-disconnected", {
          clientSocket,
        });
        cleanupClientSocket();
      });

      // force recreate the proxy server on error
      proxyServer.on("error", (err) => {
        this.events.emit("tunnel-error", {
          clientSocket,
          tunnelServer: proxyServer,
          err,
        });
        cleanupClientSocket();
      });
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
  }
}
