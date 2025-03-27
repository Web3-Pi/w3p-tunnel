# w3p-tunnel

A set of tools to tunnel TCP traffic from a local port to a remote port.

## Implementation details

The tunnel client and server share a single TCP connection, to avoid the overhead of opening and closing a new TCP connection for each request.

The message format is a simple binary protocol, with the following structure:

- Message length (4 bytes)
- Stream ID (4 bytes)
- Message type (1 byte)
- Message data (variable length)

### Message types

- 0x00: Handshake
- 0x01: Data
- 0x02: Close
- 0x03: Error
