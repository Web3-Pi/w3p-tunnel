import type { SocketContext } from "../shared/SocketContext.ts";
import crypto from "node:crypto";
export function getStreamId(socketContext: SocketContext) {
  let streamId: number;
  const MAX_UINT32 = 0xffffffff;
  // _very_ unlikely to hit a collision, but just in case
  do {
    streamId = crypto.randomInt(1, MAX_UINT32);
  } while (socketContext.destinationSockets.has(streamId));
  return streamId;
}
