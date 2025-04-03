import type { TunnelClient } from "../client.ts";
import { encodeHandshakeMessage } from "../shared/encode-message.ts";
import type { ClientConnection } from "./ClientConnection.ts";

export function authenticateWithServer(
  clientConnection: ClientConnection,
  masterClient: TunnelClient,
) {
  const message = encodeHandshakeMessage(
    masterClient.authenticationCredentials,
  );
  clientConnection.socket.write(message);
  masterClient.events.emit("authentication-credentials-sent", {
    clientConnection,
    authenticationCredentials: masterClient.authenticationCredentials,
  });
}
