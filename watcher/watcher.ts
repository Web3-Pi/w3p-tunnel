/**
 * See the README.md file in the watcher directory for more information.
 */
import { TunnelClient } from "../src/client.ts";
import { readFileSync, unwatchFile, watchFile } from "node:fs";
import { isDeepStrictEqual } from "node:util";

type TunnelConfig = {
  enabled: boolean;
  name: string;
  localServicePort: number;
  authenticationCredentials: Record<string, string>;
  serverHost: string;
  serverPort: number;
  tls: {
    enabled: boolean;
    rejectUnauthorized?: boolean;
    ca?: string;
  };
};
const CONFIG_FILE = process.env.CONFIG_FILE || "/etc/w3p-tunnel/config.json";

const activeTunnels = new Map<
  string,
  {
    tunnel: TunnelClient;
    config: TunnelConfig;
  }
>();

function getParsedConfig() {
  const config = JSON.parse(readFileSync(CONFIG_FILE, "utf-8"));

  const isValidConfig = (config: unknown): config is TunnelConfig[] => {
    if (!Array.isArray(config)) {
      return false;
    }
    return config.every((tunnelConfig) => {
      return (
        typeof tunnelConfig === "object" &&
        tunnelConfig !== null &&
        typeof tunnelConfig.enabled === "boolean" &&
        typeof tunnelConfig.name === "string" &&
        typeof tunnelConfig.localServicePort === "number" &&
        typeof tunnelConfig.authenticationCredentials === "object" &&
        typeof tunnelConfig.serverHost === "string" &&
        typeof tunnelConfig.serverPort === "number" &&
        typeof tunnelConfig.tls === "object" &&
        typeof tunnelConfig.tls.enabled === "boolean"
      );
    });
  };
  if (!isValidConfig(config)) throw new Error("Invalid config file");
  return config;
}

function startSingleTunnel(tunnelConfig: TunnelConfig) {
  const name = `[${tunnelConfig.name}]`;
  const tls = tunnelConfig.tls.enabled
    ? {
        rejectUnauthorized: tunnelConfig.tls.rejectUnauthorized ?? true,
        ca: tunnelConfig.tls.ca ?? undefined,
      }
    : false;
  const tunnel = new TunnelClient({
    localServicePort: tunnelConfig.localServicePort,
    tunnelServerHost: tunnelConfig.serverHost,
    tunnelServerPort: tunnelConfig.serverPort,
    authenticationCredentials: tunnelConfig.authenticationCredentials,
    tls,
  });
  tunnel.events.on("tunnel-error", ({ err }) => {
    console.error(`${name} tunnel error:`, err);
  });
  tunnel.events.on("service-error", ({ err }) => {
    console.error(`${name} service error:`, err);
  });
  tunnel.events.on("service-disconnected", () => {
    console.error(`${name} service disconnected`);
  });
  tunnel.events.on("tunnel-connection-established", () => {
    console.log(`${name} tunnel connection established (secure=${!!tls})`);
  });
  tunnel.events.on(
    "authentication-credentials-sent",
    ({ authenticationCredentials }) => {
      console.log(`${name} sent authentication credentials:`, [
        ...Object.keys(authenticationCredentials),
      ]);
    },
  );
  tunnel.events.on("authentication-acknowledged", ({ assignedPort }) => {
    console.log(
      `${name} authentication acknowledged, assigned port ${assignedPort}`,
    );
    console.log(
      `${name} should be available at ${tunnelConfig.serverHost}:${assignedPort}`,
    );
  });
  tunnel.events.on("tunnel-error", ({ err }) => {
    console.error(`${name} tunnel error:`, err);
  });
  tunnel.events.on("tunnel-disconnected", ({ hadError }) => {
    console.log(`${name} tunnel disconnected, hadError=${hadError}`);
  });
  tunnel.events.on("tunnel-reconnect-queued", ({ timeout }) => {
    console.log(`${name} reconnect queued, timeout=${timeout}ms`);
  });
  tunnel.events.on("tunnel-protocol-confirmed", () => {
    console.log(`${name} protocol confirmed by the server`);
  });
  tunnel.start();
  return tunnel;
}

async function recreateTunnels() {
  let config: TunnelConfig[];
  try {
    config = getParsedConfig();
  } catch (err) {
    console.error("Error reading config file:", err);
    return;
  }

  const desiredTunnels = new Map<string, TunnelConfig>();
  for (const tunnelConfig of config) {
    if (!tunnelConfig.enabled) continue;
    if (desiredTunnels.has(tunnelConfig.name)) {
      console.warn(`Duplicate tunnel name ${tunnelConfig.name}, ignoring`);
      continue;
    }
    desiredTunnels.set(tunnelConfig.name, tunnelConfig);
  }
  const newTunnels = [...desiredTunnels.keys()].filter(
    (name) => !activeTunnels.has(name),
  );
  const removedTunnels = [...activeTunnels.keys()].filter(
    (name) => !desiredTunnels.has(name),
  );
  const updatedTunnels = [...activeTunnels.keys()].filter((name) =>
    desiredTunnels.has(name),
  );

  for (const name of newTunnels) {
    const tunnelConfig = desiredTunnels.get(name);
    if (!tunnelConfig) throw new Error(`Unknown tunnel ${name}`);
    const tunnel = startSingleTunnel(tunnelConfig);
    activeTunnels.set(name, { tunnel, config: tunnelConfig });
  }
  for (const name of removedTunnels) {
    const tunnelAndConfig = activeTunnels.get(name);
    if (!tunnelAndConfig) throw new Error(`Unknown tunnel ${name}`);
    console.log("Stopping tunnel", name);
    tunnelAndConfig.tunnel.stop();
    activeTunnels.delete(name);
  }
  for (const name of updatedTunnels) {
    const tunnelAndConfig = activeTunnels.get(name);
    if (!tunnelAndConfig) throw new Error(`Unknown tunnel ${name}`);
    const newConfig = desiredTunnels.get(name);
    if (!newConfig) throw new Error(`Unknown tunnel ${name}`);
    const isConfigChanged = !isDeepStrictEqual(
      tunnelAndConfig.config,
      newConfig,
    );
    if (!isConfigChanged) {
      console.log("Tunnel config unchanged, skipping", name);
      continue;
    }
    console.log("Tunnel config changed, recreating tunnel", name);
    tunnelAndConfig.tunnel.stop();
    const tunnel = startSingleTunnel(newConfig);
    activeTunnels.set(name, { tunnel, config: newConfig });
  }
}
watchFile(CONFIG_FILE, (curr, prev) => {
  if (curr.mtimeMs > prev.mtimeMs) {
    console.log("Config file changed, recreating tunnels");
    recreateTunnels();
  }
});

process.on("SIGINT", async () => {
  console.log("SIGINT received, stopping watcher and all tunnels");
  unwatchFile(CONFIG_FILE);
  for (const tunnelAndConfig of activeTunnels.values()) {
    tunnelAndConfig.tunnel.stop();
  }
});

recreateTunnels();
