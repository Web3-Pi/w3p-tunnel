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

  // Whether the protocol has been confirmed by the other party (magic bytes sent from client to server or vice versa)
  isProtocolConfirmed: boolean;
  // Whether the handshake has been acknowledged by the other party (handshake message sent from client to server or vice versa)
  isHandshakeAcknowledged: boolean;

  constructor(socket: net.Socket) {
    this.socket = socket;
    this.receiveBuffer = Buffer.alloc(0);
    this.destinationSockets = new Map();
    this.isProtocolConfirmed = false;
    this.isHandshakeAcknowledged = false;
  }
}
