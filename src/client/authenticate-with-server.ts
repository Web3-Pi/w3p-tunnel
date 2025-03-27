import type net from "node:net";
import type { TunnelClient } from "../client.ts";
import { encodeMessage } from "../shared/encode-message.ts";

export function authenticateWithServer(
  tunnelSocket: net.Socket,
  masterClient: TunnelClient,
) {
  const messageAsBuffer = Buffer.from(
    JSON.stringify(masterClient.authenticationCredentials),
  );
  const message = encodeMessage(0, "handshake", messageAsBuffer);
  tunnelSocket.write(message);
  masterClient.events.emit("authentication-credentials-sent", {
    tunnelSocket,
    authenticationCredentials: masterClient.authenticationCredentials,
  });
}
