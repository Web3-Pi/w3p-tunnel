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

  constructor(socket: net.Socket) {
    this.socket = socket;
    this.receiveBuffer = Buffer.alloc(0);
    this.destinationSockets = new Map();
  }
}
