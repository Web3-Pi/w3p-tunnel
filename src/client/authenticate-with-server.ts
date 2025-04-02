import type net from "node:net";
import type { TunnelClient } from "../client.ts";
import { encodeHandshakeMessage } from "../shared/encode-message.ts";

export function authenticateWithServer(
  tunnelSocket: net.Socket,
  masterClient: TunnelClient,
) {
  const message = encodeHandshakeMessage(
    masterClient.authenticationCredentials,
  );
  tunnelSocket.write(message);
  masterClient.events.emit("authentication-credentials-sent", {
    tunnelSocket,
    authenticationCredentials: masterClient.authenticationCredentials,
  });
}
