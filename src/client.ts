import type net from "node:net";
import type { ClientEvents, TypeSafeEventEmitter } from "./events.ts";
import EventEmitter from "node:events";
import type { SocketContext } from "./shared/SocketContext.ts";
import { createTunnelContext } from "./client/create-tunnel-context.ts";

export class TunnelClient {
  serviceSocket: net.Socket | null = null;
  tunnelSocketContext: SocketContext | null = null;
  events: TypeSafeEventEmitter<ClientEvents> = new EventEmitter();

  authenticationCredentials: Record<string, unknown>;

  #isDestroyed = false;

  constructor(authenticationCredentials: Record<string, unknown>) {
    this.authenticationCredentials = authenticationCredentials;
  }

  start({
    localServicePort = 8081,
    tunnelServerPort = 9000,
    tunnelServerHost = "localhost",
  } = {}) {
    if (this.#isDestroyed) {
      throw new Error("Tunnel client is already destroyed, create a new one");
    }
    this.tunnelSocketContext = createTunnelContext(
      this,
      tunnelServerHost,
      tunnelServerPort,
      localServicePort,
    );
  }

  stop() {
    if (!this.tunnelSocketContext) return;
    this.#isDestroyed = true;
    this.tunnelSocketContext.socket.end();
    for (const [_, serviceSocket] of this.tunnelSocketContext
      .destinationSockets) {
      serviceSocket.destroy();
    }
  }
}
