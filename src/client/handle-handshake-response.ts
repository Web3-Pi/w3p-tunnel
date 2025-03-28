import type { TunnelClient } from "../client.ts";
import type net from "node:net";

export function handleHandshakeResponse(
  masterClient: TunnelClient,
  tunnelSocket: net.Socket,
  messageData: Buffer,
) {
  const assignedPort = JSON.parse(messageData.toString()).port;
  if (Number.isNaN(assignedPort)) {
    throw new Error(`Got assigned a non-number port: ${assignedPort}`);
  }
  masterClient.events.emit("authentication-acknowledged", {
    tunnelSocket,
    assignedPort,
  });
}
