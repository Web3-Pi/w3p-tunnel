/**
 * Magic bytes that are sent from the client to the server to confirm the protocol.
 * This is useful to quickly detect if the client and server are compatible.
 * For example if the server was configured WITHOUT TLS, but the client was configured WITH TLS,
 * the server would try to parse the TLS handshake as if it was a normal message (which could lead to unexpected behavior).
 */
export const MAGIC_BYTES = Buffer.from("W3PTUNL");
export const MAGIC_BYTES_LENGTH = MAGIC_BYTES.length;
