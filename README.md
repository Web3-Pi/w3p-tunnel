# W3P Tunnel

A set of tools to tunnel TCP traffic from a local port to a remote port. Supports TLS and authentication. No dependencies other than node.js.

## Usage

### Server

**Basic example (no TLS, no authentication):**

```ts
import { TunnelServer } from "w3p-tunnel";

const tunnelServer = new TunnelServer(); // No auth, no TLS

tunnelServer.events.on("main-server-start", ({ port, secure }) => {
  console.log(`Tunnel control server started on port ${port} (TLS: ${secure})`);
});

tunnelServer.events.on(
  "tunnel-created",
  ({ clientAuthenticationCredentials, secure, clientTunnel }) => {
    const tunnelAddr = clientTunnel.tunnelAddress;
    console.log(
      `Tunnel created for client ${JSON.stringify(
        clientAuthenticationCredentials
      )} at public port ${tunnelAddr?.port} (TLS: ${secure})`
    );
  }
);

tunnelServer.events.on("client-disconnected", ({ clientTunnel }) => {
  console.log(
    `Client with credentials ${JSON.stringify(
      clientTunnel.authenticationCredentials
    )} disconnected`
  );
});

tunnelServer.events.on("error", ({ err }) => {
  console.error("Generic Server Error:", err);
});

tunnelServer.start(9000); // Start control server on port 9000
```

**Server with authentication:**

```ts
import { TunnelServer } from "w3p-tunnel";

const tunnelServer = new TunnelServer({
  // Only allow clients whose credentials have id === 'allowed-client'
  connectionFilter: (credentials) => {
    console.log("Authenticating client with credentials:", credentials);
    return credentials?.id === "allowed-client";
  },
  // connectionFilter can also be async
  // connectionFilter: async (credentials) => {
  //   console.log("Authenticating client with credentials:", credentials);
  //   const isAuthenticated = await someAsyncOperation(credentials);
  //   return isAuthenticated;
  // },
});

// ... add event listeners ...

tunnelServer.start(9000);
```

**Server with Hop-by-Hop TLS:**

_Requires a TLS certificate and key. For testing purposes, you can generate a self-signed certificate with `openssl`:_

```sh
# Generate a private key
openssl genpkey -algorithm RSA -out server-key.pem -pkeyopt rsa_keygen_bits:2048

# Generate a Certificate Signing Request (CSR)
openssl req -new -key server-key.pem -out server-csr.pem -subj "/CN=localhost"

# Generate a self-signed certificate valid for 365 days
openssl x509 -req -days 365 -in server-csr.pem -signkey server-key.pem -out server-cert.pem

# Clean up CSR (optional)
rm server-csr.pem
```

```ts
import { TunnelServer } from "w3p-tunnel";
import fs from "node:fs";
import path from "node:path";

const tlsOptions = {
  // Secure the main control channel
  mainServer: {
    key: fs.readFileSync(path.join(__dirname, "server-key.pem")),
    cert: fs.readFileSync(path.join(__dirname, "server-cert.pem")),
  },
  // Also secure the visitor-facing tunnel ports
  // It can be the same as the main server, or a different one
  tunnelServer: {
    key: fs.readFileSync(path.join(__dirname, "server-key.pem")),
    cert: fs.readFileSync(path.join(__dirname, "server-cert.pem")),
  },
};

const tunnelServer = new TunnelServer({
  tls: tlsOptions,
});

// ... add event listeners ...

tunnelServer.start(9000);
```

### Client

**Basic example (no TLS):**

```ts
import { TunnelClient } from "w3p-tunnel";

const client = new TunnelClient({
  tunnelServerHost: "your-server-hostname.com", // Server hostname or IP
  tunnelServerPort: 9000, // Server control port
  localServicePort: 3000, // Local service port (e.g., web server)
  authenticationCredentials: {
    id: "allowed-client", // Credentials to send to server
    // Add other credentials as needed
  },
});

client.events.on("tunnel-connection-established", () => {
  console.log("Established connection to the tunnel server");
});

client.events.on("authentication-credentials-sent", () => {
  console.log("Sent authentication credentials to the tunnel server");
});

client.events.on("authentication-acknowledged", ({ assignedPort }) => {
  console.log(`Authentication successful! Tunnel public port: ${assignedPort}`);
});

client.events.on("tunnel-disconnected", ({ hadError }) => {
  console.log(
    `Disconnected from tunnel server. Error: ${hadError}. Attempting reconnect...`
  );
  // Reconnect logic is handled internally by default
});

client.events.on("tunnel-error", ({ err }) => {
  console.error("Tunnel connection error:", err);
});

client.events.on("service-error", ({ err }) => {
  console.error(
    "Error connecting to or communicating with local service:",
    err
  );
});

client.start();
```

**Client connecting to TLS server:**

```ts
import { TunnelClient } from "w3p-tunnel";
import fs from "node:fs";
import path from "node:path";

const client = new TunnelClient({
  tunnelServerHost: "your-server-hostname.com",
  tunnelServerPort: 9001, // Connect to the server's TLS port
  localServicePort: 3000,
  authenticationCredentials: { id: "allowed-client" },
  tls: {
    // CA certificate needed to verify the server (if server uses self-signed cert)
    ca: fs.readFileSync(path.join(__dirname, "server-cert.pem")),
    // For production with valid certs, 'ca' might not be needed.
    // rejectUnauthorized defaults to true (recommended). Set to false ONLY for testing.
    // rejectUnauthorized: false, // DANGEROUS for production
  },
});

// ... add event listeners ...

client.start();
```

## Protocol Specification

The communication between the Tunnel Client and Tunnel Server uses a custom TCP-based protocol designed for multiplexing multiple streams over a single connection.

### 1. Magic Bytes

- **Value**: `W3PTUNL` (7 bytes)
- **Purpose**: To quickly identify the protocol and detect mismatches (e.g., a TLS client connecting to a non-TLS server or vice-versa). The server/client expects these exact bytes at the very beginning of the _first_ data chunk received after the TCP connection is established. If the bytes don't match, the connection is dropped immediately.
- **Transmission**: The magic bytes are prepended _only_ to the very first message sent in each direction (Client Authentication Handshake and Server Authentication Acknowledgement Handshake). They are not included in subsequent messages.

### 2. Message Framing

- **Structure**: All messages after the initial magic bytes (including the body of the handshake messages themselves) are prefixed with a 4-byte unsigned Big Endian integer representing the length of the message body that follows.
  ```text
   +-------------------+------------------------------------+
   | Length (4 bytes)  | Message Body (Length bytes)        |
   +-------------------+------------------------------------+
  ```
- **Purpose**: Allows the receiver to determine how many bytes to read for a complete message, enabling reliable parsing even when multiple messages arrive in a single TCP chunk or a single message is split across chunks.
- **Maximum Length**: A check (`REASONABLE_MAX_MESSAGE_LENGTH`) is in place to prevent excessively large declared lengths, potentially caused by corrupted data or malicious clients.

### 3. Message Types

The `Message Body` contains the actual payload and control information. Its internal structure depends on the message type.

**a) Handshake Message (`0x00`)**

- **Purpose**: Used for initial authentication (Client -> Server) and acknowledgement/port assignment (Server -> Client).
- **Encoding**: The first message sent by the client and the first reply sent by the server.
  ```text
  +-------------+-------------------+------------------------------------+
  | MAGIC_BYTES | Length (4 bytes) | Message Body (JSON String) |
  +-------------+-------------------+------------------------------------+
  ```
- **Message Body Structure**: A UTF-8 encoded JSON string.
  - **Client -> Server**: Contains authentication credentials (e.g., `{"id":"secret"}`). The specific structure depends on the server's `connectionFilter`.
  - **Server -> Client**: Contains information about the successful tunnel creation, primarily the publicly accessible port assigned to the tunnel (e.g., `{"port": 34567}`).

**b) Tunnel Messages (`0x01`, `0x02`, `0x03`)**
These messages are used after the initial handshake to manage and relay data for the individual TCP streams being tunneled.

- **Purpose**: Multiplexing data, close events, and error events for different visitor connections over the single client-server tunnel.
- **Encoding**:
  ```text
  +-------------------+------------------------------------+
  | Length (4 bytes) | Message Body |
  +-------------------+------------------------------------+
  ```
- **Message Body Structure**:
  ```text
  +-------------------+--------------------+---------------------+
  | StreamID (4 bytes)| Msg Type (1 byte) | Payload (variable) |
  +-------------------+--------------------+---------------------+
  ```
  - **StreamID (UInt32BE)**: A unique identifier assigned by the server when a new visitor connects to the public tunnel endpoint. This ID links the visitor's socket on the server to the corresponding local service socket created by the client. It allows both ends to know which stream the message belongs to.
  - **Msg Type (UInt8)**: Defines the purpose of the message:
    - `0x01` (`data`): The `Payload` contains raw TCP data to be forwarded.
    - `0x02` (`close`): Indicates the stream associated with `StreamID` has been closed cleanly by the sender. The `Payload` is empty.
    - `0x03` (`error`): Indicates an error occurred on the stream associated with `StreamID`, forcing its closure. The `Payload` is empty.
  - **Payload**: Present only for `data` messages. Contains the raw bytes received from either the visitor (Server -> Client) or the local service (Client -> Server).

### 4. Connection Flow & Multiplexing

1. **TCP Connect**: Client establishes a TCP (or TLS) connection to the Server.
1. **Client Auth**: Client sends `MAGIC_BYTES + Length + Handshake(Credentials)` message.
1. **Server Verify & Tunnel**: Server receives data.
   - Verifies `MAGIC_BYTES`.
   - Reads `Length`, then reads the `Handshake` body.
   - Parses JSON, validates credentials via `connectionFilter`.
   - If valid, creates a new public TCP (or TLS) server (`tunnel`) listening on a random available port.
1. **Server Ack**: Once the `tunnel` server is listening, Server sends `MAGIC_BYTES + Length + Handshak({"port": assigned_port})` message back to the Client.
1. **Client Verify**: Client receives data.
   - Verifies `MAGIC_BYTES`.
   - Reads `Length`, then reads the `Handshake` body.
   - Parses JSON, extracts the `assigned_port`. Tunnel is now established.
1. **Visitor Connect**: A visitor connects to the `tunnel` server on the `assigned_port`.
1. **Stream Start (Server)**: The Server accepts the `visitorSocket`.
   - Generates a unique `StreamID` (a random uint32).
   - Stores the mapping: `StreamID` -> `visitorSocket`.
1. **Data Forward (Visitor -> Local Service)**:
   - `visitorSocket` receives data (`chunk`).
   - Server encodes `Length + DataMsg(StreamID, 0x01, chunk)`.
   - Server sends the encoded message to the Client via the main tunnel socket.
1. **Stream Start (Client)**: Client receives the `DataMsg`.
   - Decodes `Length`, `StreamID`, `MsgType`, `Payload`.
   - Sees it's a `data` message for a new `StreamID`.
   - Creates a new TCP connection (`localSocket`) to `localhost:localServicePort`.
   - Stores the mapping: `StreamID` -> `localSocket`.
   - Writes the received `Payload` to the `localSocket`.
1. **Data Forward (Local Service -> Visitor)**:
   - `localSocket` receives data (`chunk`).
   - Client encodes `Length + DataMsg(StreamID, 0x01, chunk)`.
   - Client sends the encoded message to the Server via the main tunnel socket.
1. **Data Relay (Server)**: Server receives the `DataMsg`.
   - Decodes `Length`, `StreamID`, `MsgType`, `Payload`.
   - Looks up `visitorSocket` using `StreamID`.
   - Writes the `Payload` to the `visitorSocket`.
1. **Stream Close/Error**:
   - If `visitorSocket` closes/errors, Server sends `Length + CloseMsg(StreamID, 0x02/0x03)` to Client.Client finds `localSocket` via `StreamID` and destroys it.
   - If `localSocket` closes/errors, Client sends `Length + CloseMsg(StreamID, 0x02/0x03)` to Server. Server finds `visitorSocket` via `StreamID` and destroys it.
   - Mappings are cleaned up on both sides.

This multiplexing allows many visitors to connect concurrently, each getting their own `StreamID` and corresponding connection to the local service, all tunneled over the single persistent connection between the Client and Server.

## Development

This project requires node 23.x or higher. If you have nvm installed, you can set the version defined in `.nvmrc` with:

```sh
nvm use
```

To install development dependencies:

```sh
npm install
```

To run tests use the integrated node test runner:

```sh
node --test tests/*.test.ts
```

To format your code using biome:

```sh
npm run format
```
