import type net from "node:net";
import type { EventEmitter } from "node:events";

export type ServerEvents = {
  error: { err: Error };
  "client-connected": { clientSocket: net.Socket };
  "client-disconnected": { clientSocket: net.Socket };
  "client-error": { clientSocket: net.Socket; err: Error };
  "client-authentication-failed": { clientSocket: net.Socket; err: Error };
  "client-protocol-confirmed": { clientSocket: net.Socket };
  "tunnel-created": {
    clientSocket: net.Socket;
    tunnelServer: net.Server;
    clientAuthenticationCredentials: Record<string, unknown>;
    secure: boolean;
  };
  "tunnel-destroyed": {
    clientSocket: net.Socket;
    tunnelServer: net.Server;
  };
  "tunnel-error": {
    clientSocket: net.Socket;
    tunnelServer: net.Server;
    err: Error;
  };
  "main-server-error": { err: Error };
  "main-server-start": { port: number; secure: boolean };
  "main-server-end": undefined;
  "visitor-connected": {
    clientSocket: net.Socket;
    tunnelServer: net.Server;
    visitorSocket: net.Socket;
  };
  "visitor-disconnected": {
    clientSocket: net.Socket;
    visitorSocket: net.Socket;
  };
  "visitor-error": {
    clientSocket: net.Socket;
    visitorSocket: net.Socket;
    err: Error;
  };
  "data-from-visitor": {
    data: Buffer;
    clientSocket: net.Socket;
    visitorSocket: net.Socket;
  };
  "data-to-visitor": {
    data: Buffer;
    clientSocket: net.Socket;
    visitorSocket: net.Socket;
  };
};

export type ClientEvents = {
  error: { err: Error };
  "service-connected": { serviceSocket: net.Socket };
  "service-error": { serviceSocket: net.Socket; err: Error };
  "service-disconnected": { serviceSocket: net.Socket };
  "data-to-service": {
    data: Buffer;
    serviceSocket: net.Socket;
    tunnelSocket: net.Socket;
  };
  "data-from-service": {
    data: Buffer;
    serviceSocket: net.Socket;
    tunnelSocket: net.Socket;
  };
  "tunnel-connection-established": { tunnelSocket: net.Socket };
  "tunnel-protocol-confirmed": {
    tunnelSocket: net.Socket;
  };
  "authentication-credentials-sent": {
    tunnelSocket: net.Socket;
    authenticationCredentials: Record<string, unknown>;
  };
  "authentication-acknowledged": {
    tunnelSocket: net.Socket;
    assignedPort: number;
  };
  "tunnel-error": { tunnelSocket: net.Socket; err: Error };
  "tunnel-disconnected": { tunnelSocket: net.Socket; hadError: boolean };
  "tunnel-reconnect-queued": { timeout: number };
};

export interface TypeSafeEventEmitter<Events extends Record<string, unknown>>
  extends EventEmitter {
  addListener<K extends Extract<keyof Events, string>>(
    eventName: K,
    listener: (arg: Events[K]) => void,
  ): this;
  on<K extends Extract<keyof Events, string>>(
    eventName: K,
    listener: (arg: Events[K]) => void,
  ): this;
  once<K extends Extract<keyof Events, string>>(
    eventName: K,
    listener: (arg: Events[K]) => void,
  ): this;
  removeListener<K extends Extract<keyof Events, string>>(
    eventName: K,
    listener: (arg: Events[K]) => void,
  ): this;
  off<K extends Extract<keyof Events, string>>(
    eventName: K,
    listener: (arg: Events[K]) => void,
  ): this;
  removeAllListeners<K extends Extract<keyof Events, string>>(
    eventName?: K,
  ): this;
  setMaxListeners(n: number): this;
  getMaxListeners(): number;
  listeners<K extends Extract<keyof Events, string>>(eventName: K): Function[];
  rawListeners<K extends Extract<keyof Events, string>>(
    eventName: K,
  ): Function[];
  emit<K extends Extract<keyof Events, string>>(
    eventName: K,
    arg: Events[K],
  ): boolean;
  listenerCount<K extends Extract<keyof Events, string>>(eventName: K): number;
  prependListener<K extends Extract<keyof Events, string>>(
    eventName: K,
    listener: (arg: Events[K]) => void,
  ): this;
  prependOnceListener<K extends Extract<keyof Events, string>>(
    eventName: K,
    listener: (arg: Events[K]) => void,
  ): this;
}
