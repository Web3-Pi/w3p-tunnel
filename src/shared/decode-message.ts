import type { HumanReadableMessageType } from "./encode-message.ts";
import type { SocketContext } from "./SocketContext.ts";

export function binaryMessageTypeToHumanReadable(
  messageType: number,
): HumanReadableMessageType {
  switch (messageType) {
    case 0x00:
      return "handshake";
    case 0x01:
      return "data";
    case 0x02:
      return "close";
    case 0x03:
      return "error";
    default:
      throw new Error("Unknown message type");
  }
}

/**
 * Decode all messages in the socket receive buffer after the given chunk.
 * If any message is invalid, this function will throw an error.
 * It is recommended to wrap this function in a try/catch block.
 */
export function* decodeMessage(chunk: Buffer, socketContext: SocketContext) {
  socketContext.receiveBuffer = Buffer.concat([
    socketContext.receiveBuffer,
    chunk,
  ]);

  while (socketContext.receiveBuffer.length >= 4) {
    const messageLength = socketContext.receiveBuffer.readUInt32BE(0);
    if (messageLength < 5) {
      throw new Error(
        `Declared message length ${messageLength} is too short for even just the header`,
      );
    }
    // messageLength (4 bytes) + the rest of the message
    const totalExpectedLength = 4 + messageLength;
    if (socketContext.receiveBuffer.length < totalExpectedLength) {
      // Not enough data yet
      break;
    }
    // everything after the message length header
    const message = socketContext.receiveBuffer.subarray(
      4,
      totalExpectedLength,
    );

    // These operations can throw!
    const streamId = message.readUInt32BE(0);
    const messageType = binaryMessageTypeToHumanReadable(message.readUInt8(4));
    const messageData = message.subarray(5);

    // remove the message from the receive buffer, the rest will be handled in the next iteration
    socketContext.receiveBuffer =
      socketContext.receiveBuffer.subarray(totalExpectedLength);

    yield { streamId, messageType, messageData };
  }
}
