import { MAGIC_BYTES } from "./constants.ts";

export type HumanReadableMessageType = "handshake" | "data" | "close" | "error";

export function humanReadableMessageTypeToBinary(
  messageType: HumanReadableMessageType,
): number {
  switch (messageType) {
    case "handshake":
      return 0x00;
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
 * Encodes a handshake message as a length-prefixed JSON string.
 * Prepends the message with MAGIC_BYTES to confirm the protocol.
 * This should be the first message sent by both the client and server.
 */
export function encodeHandshakeMessage(jsonData: Record<string, unknown>) {
  if (typeof jsonData !== "object" || jsonData === null) {
    throw new Error("Handshake message must be an object");
  }
  const jsonString = JSON.stringify(jsonData);
  const dataBuffer = Buffer.from(jsonString, "utf-8");
  const lengthPrefix = Buffer.alloc(4);
  lengthPrefix.writeUInt32BE(dataBuffer.length, 0);

  // handshake message is prefixed with MAGIC_BYTES to confirm the protocol
  return Buffer.concat([MAGIC_BYTES, lengthPrefix, dataBuffer]);
}

/**
 * Prepend the message with the stream ID, message type and message length.
 * Does NOT include magic bytes.
 */
export function encodeMessage(
  streamId: number,
  messageType: HumanReadableMessageType,
  messageData: Buffer,
) {
  const messageBodyLength = messageData.length + 5; // header + data
  const lengthPrefix = Buffer.alloc(4);
  const streamIdBuffer = Buffer.alloc(4);
  const messageTypeBuffer = Buffer.alloc(1);

  lengthPrefix.writeUInt32BE(messageBodyLength, 0);
  streamIdBuffer.writeUInt32BE(streamId, 0);
  messageTypeBuffer.writeUInt8(
    humanReadableMessageTypeToBinary(messageType),
    0,
  );

  return Buffer.concat([
    lengthPrefix,
    streamIdBuffer,
    messageTypeBuffer,
    messageData,
  ]);
}
