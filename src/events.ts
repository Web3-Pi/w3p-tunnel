import type net from "node:net";
import type { EventEmitter } from "node:events";
import type { ClientTunnel } from "./server/ClientTunnel.ts";
import type { ClientConnection } from "./client/ClientConnection.ts";

export type ServerEvents = {
  error: { err: Error };
  "client-connected": { clientTunnel: ClientTunnel };
  "client-disconnected": { clientTunnel: ClientTunnel };
  "client-error": { clientTunnel: ClientTunnel; err: Error };
  "client-authentication-failed": { clientTunnel: ClientTunnel; err: Error };
  "client-protocol-confirmed": { clientTunnel: ClientTunnel };
  "tunnel-created": {
    clientTunnel: ClientTunnel;
    clientAuthenticationCredentials: Record<string, unknown>;
    secure: boolean;
  };
  "tunnel-destroyed": {
    clientTunnel: ClientTunnel;
  };
  "tunnel-error": {
    clientTunnel: ClientTunnel;
    err: Error;
  };
  "main-server-error": { err: Error };
  "main-server-start": { port: number; secure: boolean };
  "main-server-end": undefined;
  "visitor-connected": {
    clientTunnel: ClientTunnel;
    visitorSocket: net.Socket;
  };
  "visitor-disconnected": {
    clientTunnel: ClientTunnel;
    visitorSocket: net.Socket;
  };
  "visitor-error": {
    clientTunnel: ClientTunnel;
    visitorSocket: net.Socket;
    err: Error;
  };
  "data-from-visitor": {
    data: Buffer;
    clientTunnel: ClientTunnel;
    visitorSocket: net.Socket;
  };
  "data-to-visitor": {
    data: Buffer;
    clientTunnel: ClientTunnel;
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
    clientConnection: ClientConnection;
  };
  "data-from-service": {
    data: Buffer;
    clientConnection: ClientConnection;
  };
  "tunnel-connection-established": { clientConnection: ClientConnection };
  "tunnel-protocol-confirmed": {
    clientConnection: ClientConnection;
  };
  "authentication-credentials-sent": {
    clientConnection: ClientConnection;
    authenticationCredentials: Record<string, unknown>;
  };
  "authentication-acknowledged": {
    clientConnection: ClientConnection;
    assignedPort: number;
  };
  "tunnel-error": { clientConnection: ClientConnection; err: Error };
  "tunnel-disconnected": {
    clientConnection: ClientConnection;
    hadError: boolean;
  };
  "tunnel-reconnect-queued": { timeout: number };
  "tunnel-client-end": undefined;
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
