import net from "node:net";
import type { ClientEvents, TypeSafeEventEmitter } from "./events.ts";
import EventEmitter, { once } from "node:events";

export class TunnelClient {
  serviceSocket: net.Socket | null = null;
  tunnelSocket: net.Socket | null = null;
  events: TypeSafeEventEmitter<ClientEvents> = new EventEmitter();

  #isDestroyed = false;

  private createServiceSocket(port: number) {
    if (this.#isDestroyed) return;
    if (!this.tunnelSocket) {
      this.events.emit("error", {
        err: new Error(
          "Trying to create a service socket without a tunnel socket established first, retrying in 1 second...",
        ),
      });
      setTimeout(() => this.createServiceSocket(port), 1000);
      return;
    }
    this.serviceSocket = net.createConnection(
      {
        host: "localhost",
        port,
        noDelay: true,
        keepAlive: true,
        timeout: 0,
      },
      () => {
        if (!this.serviceSocket) throw new Error("Service socket not created");
        this.events.emit("service-connected", {
          serviceSocket: this.serviceSocket,
        });
      },
    );

    const cleanup = this.connectSockets(this.tunnelSocket, this.serviceSocket);
    const restartServiceSocket = () => {
      cleanup();
      if (this.serviceSocket) {
        this.serviceSocket.removeAllListeners();
        this.serviceSocket.destroy();
        this.serviceSocket = null;
        if (this.#isDestroyed) return;
        this.createServiceSocket(port);
      }
    };

    this.serviceSocket.on("error", (err) => {
      if (!this.serviceSocket) throw new Error("Service socket not created");
      this.events.emit("service-error", {
        serviceSocket: this.serviceSocket,
        err,
      });
      restartServiceSocket();
    });

    this.serviceSocket.on("close", () => {
      if (!this.serviceSocket) throw new Error("Service socket not created");
      this.events.emit("service-disconnected", {
        serviceSocket: this.serviceSocket,
      });
      restartServiceSocket();
    });
  }

  private connectSockets(tunnelSocket: net.Socket, serviceSocket: net.Socket) {
    // Use manual data event handling instead of pipe() to prevent automatic end propagation
    const forwardFromServiceToTunnel = (data: Buffer) => {
      this.events.emit("data-from-service", {
        data,
        serviceSocket,
        tunnelSocket,
      });
      tunnelSocket.write(data);
    };

    const forwardFromTunnelToService = (data: Buffer) => {
      this.events.emit("data-to-service", {
        data,
        serviceSocket,
        tunnelSocket,
      });
      serviceSocket.write(data);
    };

    tunnelSocket.on("data", forwardFromTunnelToService);
    serviceSocket.on("data", forwardFromServiceToTunnel);

    return () => {
      tunnelSocket.off("data", forwardFromTunnelToService);
      serviceSocket.off("data", forwardFromServiceToTunnel);
    };
  }

  private createTunnel(host = "localhost", port = 9000) {
    if (this.#isDestroyed) return;
    if (this.serviceSocket) {
      this.serviceSocket.destroy();
    }

    this.tunnelSocket = net.createConnection(
      {
        host,
        port,
        noDelay: true,
        keepAlive: true,
        timeout: 0,
      },
      () => {
        if (!this.tunnelSocket) throw new Error("Tunnel socket not created");
        this.events.emit("tunnel-connected", {
          tunnelSocket: this.tunnelSocket,
        });
      },
    );

    const restartTunnelSocket = () => {
      if (this.tunnelSocket) {
        this.tunnelSocket.removeAllListeners();
        this.tunnelSocket.destroy();
        this.tunnelSocket = null;
        if (this.#isDestroyed) return;
        setTimeout(this.createTunnel.bind(this), 1000);
      }
    };

    this.tunnelSocket.on("close", () => {
      if (!this.tunnelSocket) throw new Error("Tunnel socket not created");
      this.events.emit("tunnel-disconnected", {
        tunnelSocket: this.tunnelSocket,
      });
      restartTunnelSocket();
    });

    this.tunnelSocket.on("error", (err) => {
      if (!this.tunnelSocket) throw new Error("Tunnel socket not created");
      this.events.emit("tunnel-error", {
        tunnelSocket: this.tunnelSocket,
        err,
      });
      restartTunnelSocket();
    });
  }

  start({
    localServicePort = 8081,
    tunnelServerPort = 9000,
    tunnelServerHost = "localhost",
  } = {}) {
    if (this.#isDestroyed) {
      throw new Error("Tunnel client is already destroyed, create a new one");
    }
    this.createTunnel(tunnelServerHost, tunnelServerPort);
    this.createServiceSocket(localServicePort);
  }

  stop() {
    this.#isDestroyed = true;
    if (this.tunnelSocket) {
      this.tunnelSocket.destroy();
    }
    if (this.serviceSocket) {
      this.serviceSocket.destroy();
    }
    Promise.all([
      once(this.events, "tunnel-disconnected"),
      once(this.events, "service-disconnected"),
    ]).then(() => {
      this.events.emit("client-end", undefined);
    });
  }
}
