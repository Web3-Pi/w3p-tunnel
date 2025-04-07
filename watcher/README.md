This directory contains the source code for the client that manages multiple tunnels based on a configuration file. The configuration file is expected to be in the following format:

```json
{
  "serverHost": "localhost",
  "serverPort": 9000,
  "tunnels": [
    {
      "enabled": true,
      "name": "Tunnel 1",
      "localServicePort": 8081,
      "authenticationCredentials": {
        "username": "user",
        "password": "pass"
      },
      "tls": {
        "enabled": true,
        "ca": "certificate-authority-file-contents",
        "rejectUnauthorized": false
      }
    },
    {
        ...
    }
    ...
  ]
}
```

This watcher is not included in the npm package. Instead, it can be installed from the official Web3 Pi apt repository as part of the `w3p-tunnel` package.
