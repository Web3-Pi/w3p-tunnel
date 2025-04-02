import type { TunnelClient } from "../client.ts";
import type { ClientConnection } from "./ClientConnection.ts";

export function handleHandshakeResponse(
  masterClient: TunnelClient,
  clientConnection: ClientConnection,
  messageData: Record<string, unknown>,
) {
  const assignedPort = messageData.port;
  if (Number.isNaN(assignedPort) || typeof assignedPort !== "number") {
    throw new Error(`Got assigned a non-number port: ${assignedPort}`);
  }
  clientConnection.isHandshakeAcknowledged = true;
  masterClient.events.emit("authentication-acknowledged", {
    tunnelSocket: clientConnection.socket,
    assignedPort,
  });
}
