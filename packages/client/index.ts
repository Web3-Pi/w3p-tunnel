import net from "node:net";
import { argv } from "node:process";

const LOCAL_SERVICE_PORT = argv[2] ? Number.parseInt(argv[2]) : 8081;
const TUNNEL_SERVER_PORT = argv[3] ? Number.parseInt(argv[3]) : 9000;
const TUNNEL_SERVER_HOST = argv[4] ? argv[4] : "localhost";

let serviceSocket: net.Socket | null = null;
let tunnelSocket: net.Socket | null = null;

function createServiceSocket() {
  if (!tunnelSocket) {
    console.error(
      "Trying to create a service socket without a tunnel socket established first, retrying in 1 second...",
    );
    setTimeout(createServiceSocket, 1000);
    return;
  }
  serviceSocket = net.createConnection(
    {
      host: "localhost",
      port: LOCAL_SERVICE_PORT,
      noDelay: true,
      keepAlive: true,
      timeout: 0,
    },
    () => {
      console.log(
        `Connected to local service at localhost:${LOCAL_SERVICE_PORT}`,
      );
    },
  );

  const cleanup = connectSockets(tunnelSocket, serviceSocket);
  function restartServiceSocket() {
    cleanup();
    if (serviceSocket) {
      serviceSocket.removeAllListeners();
      serviceSocket.destroy();
      serviceSocket = null;
      createServiceSocket();
    }
  }

  serviceSocket.on("error", (err) => {
    console.log("Local service connection error:", err.message);
    console.log("Restarting service socket immediately...");
    restartServiceSocket();
  });

  serviceSocket.on("close", () => {
    console.log("Local service connection closed, reconnecting immediately...");
    restartServiceSocket();
  });
}

function connectSockets(tunnelSocket: net.Socket, serviceSocket: net.Socket) {
  // Use manual data event handling instead of pipe() to prevent automatic end propagation
  function forwardFromServiceToTunnel(data: Buffer) {
    console.debug("Service socket received data, length:", data.length);
    tunnelSocket.write(data);
  }

  function forwardFromTunnelToService(data: Buffer) {
    console.debug("Tunnel socket received data, length:", data.length);
    serviceSocket.write(data);
  }

  tunnelSocket.on("data", forwardFromTunnelToService);
  serviceSocket.on("data", forwardFromServiceToTunnel);

  return () => {
    tunnelSocket.off("data", forwardFromTunnelToService);
    serviceSocket.off("data", forwardFromServiceToTunnel);
    console.log("Removed data listeners from tunnel and service sockets");
  };
}

function createTunnel() {
  console.log("Creating tunnel connection...");

  if (serviceSocket) {
    serviceSocket.destroy();
  }

  tunnelSocket = net.createConnection(
    {
      host: TUNNEL_SERVER_HOST,
      port: TUNNEL_SERVER_PORT,
      noDelay: true,
      keepAlive: true,
      timeout: 0,
    },
    () => {
      console.log(
        `Connected to tunnel server at ${TUNNEL_SERVER_HOST}:${TUNNEL_SERVER_PORT}`,
      );
    },
  );

  function restartTunnelSocket() {
    if (tunnelSocket) {
      console.log("Reconnecting to tunnel server in 1 second...");
      tunnelSocket.removeAllListeners();
      tunnelSocket.destroy();
      tunnelSocket = null;
      setTimeout(createTunnel, 1000);
    }
  }

  tunnelSocket.on("close", () => {
    console.log("Tunnel connection closed");
    restartTunnelSocket();
  });

  tunnelSocket.on("error", (err) => {
    console.log("Tunnel connection error:", err.message);
    restartTunnelSocket();
  });
}

createTunnel();
createServiceSocket();

console.log("Tunnel client started");
