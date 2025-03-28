import type net from "node:net";

/**
 * A helper class to store socket-related data.
 */
export class SocketContext {
  public socket: net.Socket;
  /**
   * Socket may receive multiple messages at once, or a single message may be split into multiple chunks.
   * This buffer stores all received chunks that are waiting to be decoded.
   */
  public receiveBuffer: Buffer;
  // streamId -> destination socket (visitor on the server and service on the client)
  public destinationSockets: Map<number, net.Socket>;

  /**
   * Sockets to the local service that are in the process of connecting.
   * If data arrives before the socket is even connected, it will be stored in `pendingData`.
   * This is currently only being used by the client.
   */
  public pendingData: Map<net.Socket, Buffer[]>;

  constructor(socket: net.Socket) {
    this.socket = socket;
    this.receiveBuffer = Buffer.alloc(0);
    this.destinationSockets = new Map();
    this.pendingData = new Map();
  }
}
