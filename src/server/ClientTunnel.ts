import { SocketContext } from "../shared/SocketContext.ts";
import type net from "node:net";

/**
 * Encapsulates a client connection to the server and its tunnel.
 */
export class ClientTunnel extends SocketContext {
  public tunnel: net.Server | null = null;

  public get tunnelAddress(): net.AddressInfo | null {
    if (!this.tunnel) return null;
    const address = this.tunnel.address();
    // address is a string if the server is listening on a unix socket
    // which doesn't matter for our purposes
    if (typeof address === "string") return null;
    return address;
  }
}
