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
  #reconnectTimeout: NodeJS.Timeout | null = null;

  constructor(authenticationCredentials: Record<string, unknown>) {
    this.authenticationCredentials = authenticationCredentials;
  }

  reconnectToServer() {
    const RECONNECT_TIMEOUT = 1000;
    if (this.#reconnectTimeout) clearTimeout(this.#reconnectTimeout);
    this.events.emit("tunnel-reconnect-queued", { timeout: RECONNECT_TIMEOUT });
    this.#reconnectTimeout = setTimeout(() => {
      if (this.#isDestroyed) return;
      this.start();
    }, RECONNECT_TIMEOUT);
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
    if (this.#reconnectTimeout) clearTimeout(this.#reconnectTimeout);
    this.#isDestroyed = true;
    this.tunnelSocketContext.socket.end();
    for (const [_, serviceSocket] of this.tunnelSocketContext
      .destinationSockets) {
      serviceSocket.destroy();
    }
  }
}
