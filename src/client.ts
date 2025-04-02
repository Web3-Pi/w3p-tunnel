import type net from "node:net";
import type { ClientEvents, TypeSafeEventEmitter } from "./events.ts";
import EventEmitter from "node:events";
import type { SocketContext } from "./shared/SocketContext.ts";
import { createTunnelContext } from "./client/create-tunnel-context.ts";
import type nodeTls from "node:tls";

export class TunnelClient {
  serviceSocket: net.Socket | null = null;
  tunnelSocketContext: SocketContext | null = null;
  events: TypeSafeEventEmitter<ClientEvents> = new EventEmitter();

  authenticationCredentials: Record<string, unknown>;
  #isDestroyed = false;
  #reconnectTimeout: NodeJS.Timeout | null = null;

  #localServicePort = 8081;
  #tunnelServerPort = 9000;
  #tunnelServerHost = "localhost";
  #tls: false | nodeTls.ConnectionOptions = false;

  constructor({
    localServicePort = 8081,
    tunnelServerPort = 9000,
    tunnelServerHost = "localhost",
    authenticationCredentials,
    tls,
  }: {
    localServicePort: number;
    tunnelServerPort: number;
    tunnelServerHost: string;
    authenticationCredentials: Record<string, unknown>;
    tls?: false | nodeTls.ConnectionOptions;
  }) {
    this.#localServicePort = localServicePort;
    this.#tunnelServerPort = tunnelServerPort;
    this.#tunnelServerHost = tunnelServerHost;
    this.authenticationCredentials = authenticationCredentials;
    this.#tls = tls || false;
  }

  reconnectToServer() {
    if (this.#isDestroyed) return;
    const RECONNECT_TIMEOUT = 1000;
    if (this.#reconnectTimeout) clearTimeout(this.#reconnectTimeout);
    this.events.emit("tunnel-reconnect-queued", { timeout: RECONNECT_TIMEOUT });
    this.#reconnectTimeout = setTimeout(() => {
      if (this.#isDestroyed) return;
      this.start();
    }, RECONNECT_TIMEOUT);
  }

  start() {
    if (this.#isDestroyed) {
      throw new Error("Tunnel client is already destroyed, create a new one");
    }

    // Prevent multiple concurrent contexts if start is called again before disconnect
    if (
      this.tunnelSocketContext &&
      !this.tunnelSocketContext.socket.destroyed
    ) {
      throw new Error("Tunnel client is already connected");
    }

    this.tunnelSocketContext = createTunnelContext(
      this,
      this.#tunnelServerHost,
      this.#tunnelServerPort,
      this.#localServicePort,
      this.#tls,
    );
  }

  stop() {
    if (this.#reconnectTimeout) clearTimeout(this.#reconnectTimeout);
    this.#isDestroyed = true;
    if (!this.tunnelSocketContext) return;
    this.tunnelSocketContext.socket.end();
    for (const [_, serviceSocket] of this.tunnelSocketContext
      .destinationSockets) {
      serviceSocket.destroy();
    }
  }

  get isDestroyed() {
    return this.#isDestroyed;
  }
}
