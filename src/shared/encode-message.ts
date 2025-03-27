export type HumanReadableMessageType = "data" | "close" | "error";

export function humanReadableMessageTypeToBinary(
  messageType: HumanReadableMessageType,
): number {
  switch (messageType) {
    case "data":
      return 0x01;
    case "close":
      return 0x02;
    case "error":
      return 0x03;
    default:
      throw new Error("Unknown message type");
  }
}

/**
 * Prepend the message with the stream ID, message type and message length.
 */
export function encodeMessage(
  streamId: number,
  messageType: HumanReadableMessageType,
  messageData: Buffer,
) {
  // streamId (4 bytes) + messageType (1 byte) + messageData (variable length)
  const messageLength = messageData.length + 5;
  // messageLength (4 bytes) + the rest of the message
  const buffer = Buffer.alloc(4 + messageLength);
  buffer.writeUInt32BE(messageLength, 0);
  buffer.writeUInt32BE(streamId, 4);
  buffer.writeUInt8(humanReadableMessageTypeToBinary(messageType), 8);
  messageData.copy(buffer, 9);
  return buffer;
}
