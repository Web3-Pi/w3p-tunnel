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

const REASONABLE_MAX_MESSAGE_LENGTH = 64 * 1024 * 1024;

/**
 * Decodes length-prefixed message bodies from the socket receive buffer.
 * Assumes magic bytes have already been validated and removed by the caller.
 * Yields { messageBodyLength, messageBody } for each complete message found.
 * Throws DecodeError if invalid framing data (bad length) is detected.
 */
export function* decodeMessage(socketContext: SocketContext) {
  while (socketContext.receiveBuffer.length >= 4) {
    const messageBodyLength = socketContext.receiveBuffer.readUInt32BE(0);

    if (messageBodyLength > REASONABLE_MAX_MESSAGE_LENGTH) {
      throw new Error(
        `Declared message length ${messageBodyLength} is too long, maximum is ${REASONABLE_MAX_MESSAGE_LENGTH}`,
      );
    }
    const totalExpectedLength = 4 + messageBodyLength;
    if (socketContext.receiveBuffer.length < totalExpectedLength) {
      break; // Not enough data yet
    }

    const messageBody = socketContext.receiveBuffer.subarray(
      4,
      totalExpectedLength,
    );
    const remainingBuffer =
      socketContext.receiveBuffer.subarray(totalExpectedLength);

    // Update buffer BEFORE yield
    socketContext.receiveBuffer = remainingBuffer;

    yield { messageBodyLength, messageBody };
  }
}

/**
 * Parses the message body yielded by decodeMessage.
 * Throws and Error on parsing failures.
 */
export function parseMessageBody(
  messageBody: Buffer,
  expectingHandshake: boolean,
):
  | {
      streamId: number;
      messageType: Exclude<HumanReadableMessageType, "handshake">;
      messageData: Buffer;
    }
  | { messageType: "handshake"; data: Record<string, unknown> } {
  if (expectingHandshake) {
    // Parse as Handshake JSON payload
    try {
      const jsonData = JSON.parse(messageBody.toString("utf8"));
      if (typeof jsonData !== "object" || jsonData === null) {
        throw new Error("Handshake message must be an object");
      }
      return { messageType: "handshake", data: jsonData };
    } catch (err) {
      throw new Error(`Handshake message is not valid JSON: ${err}`);
    }
  }
  // Parse as Tunnel Message (StreamID + Type + Data)
  if (messageBody.length < 5) {
    throw new Error(
      `Declared message length ${messageBody.length} is too short for even just the header`,
    );
  }
  try {
    const streamId = messageBody.readUInt32BE(0);
    const messageTypeByte = messageBody.readUInt8(4);
    const messageType = binaryMessageTypeToHumanReadable(messageTypeByte);
    if (messageType === "handshake") {
      throw new Error("Didn't expect a handshake message but got one");
    }
    const messageData = messageBody.subarray(5);
    return { streamId, messageType, messageData };
  } catch (err) {
    throw new Error("Message is not valid");
  }
}
