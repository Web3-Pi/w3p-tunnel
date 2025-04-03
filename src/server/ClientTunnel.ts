import { SocketContext } from "../shared/SocketContext.ts";
import type net from "node:net";

/**
 * Encapsulates a client connection to the server and its tunnel.
 */
export class ClientTunnel extends SocketContext {
  /**
   * The tunnel server that the client is connected to.
   */
  public tunnel: net.Server | null = null;
  /**
   * Credentials that were sent by the client to authenticate with the server.
   * This is `null` until the handshake is acknowledged.
   */
  public authenticationCredentials: Record<string, unknown> | null = null;

  /**
   * The public address of the tunnel.
   * Returns `null` if the tunnel is not yet established.
   */
  public get tunnelAddress(): net.AddressInfo | null {
    if (!this.tunnel) return null;
    const address = this.tunnel.address();
    // address is a string if the server is listening on a unix socket
    // which doesn't matter for our purposes
    if (typeof address === "string") return null;
    return address;
  }
}
