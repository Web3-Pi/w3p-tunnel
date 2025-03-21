import net from "node:net";
import { argv } from "node:process";

const MAIN_PORT = argv[2] ? Number.parseInt(argv[2]) : 9000;
const tunnels = new Map<net.Socket, net.Server>();

const server = net.createServer((clientSocket) => {
  console.log("New client connected to establish tunnel");

  clientSocket.setKeepAlive(true);
  clientSocket.setTimeout(0);
  clientSocket.setNoDelay(true);

  // Create a proxy server that will forward connections to the client
  const proxyServer = net.createServer((visitorSocket) => {
    console.log("New visitor connected to proxy port");

    visitorSocket.setKeepAlive(true, 30000);
    visitorSocket.setTimeout(0);
    visitorSocket.setNoDelay(true);

    // Manual data forwarding instead of pipe() to prevent automatic end propagation
    visitorSocket.on("data", (data) => {
      console.log(
        "Piping some data from visitor to client, length:",
        data.length,
      );
      clientSocket.write(data);
    });

    function forwardData(data: Buffer) {
      if (visitorSocket.writable) {
        console.log(
          "Piping some data from client to visitor, length:",
          data.length,
        );
        visitorSocket.write(data);
      }
    }

    clientSocket.on("data", forwardData);

    visitorSocket.on("end", () => {
      console.log("Visitor ended connection");

      clientSocket.removeListener("data", forwardData);
      visitorSocket.destroy();
    });

    visitorSocket.on("error", (err) => {
      console.log("Visitor socket error:", err.message);
      visitorSocket.destroy();
    });
  });

  // Start listening on a random port
  proxyServer.listen(0, () => {
    const address = proxyServer.address();
    const port = typeof address === "object" ? address?.port : "<UNKNOWN>";
    console.log(`Proxy server listening on port ${port}`);
    tunnels.set(clientSocket, proxyServer);
  });

  function cleanupClientSocket() {
    const tunnel = tunnels.get(clientSocket);
    if (tunnel) {
      tunnel.close();
      tunnels.delete(clientSocket);
    }
    clientSocket.removeAllListeners();
    clientSocket.destroy();
  }

  clientSocket.on("error", (err) => {
    console.log("Client tunnel error:", err.message);
    cleanupClientSocket();
  });

  clientSocket.on("close", () => {
    console.log("Client tunnel disconnected");
    cleanupClientSocket();
  });
});

server.listen(MAIN_PORT, () => {
  console.log(`Main server listening on port ${MAIN_PORT}`);
});

console.log("Tunnel server started");
