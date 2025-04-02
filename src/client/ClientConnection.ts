import { SocketContext } from "../shared/SocketContext.ts";
import type net from "node:net";

/**
 * Encapsulates a client connection to the server.
 */
export class ClientConnection extends SocketContext {
  /**
   * Sockets to the local service that are in the process of connecting.
   * If data arrives before the socket is even connected, it will be stored in `pendingData`.
   */
  public pendingData: Map<net.Socket, Buffer[]> = new Map();
}
