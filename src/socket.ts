import { io, type Socket } from "socket.io-client";
import type { ClientToServerEvents, ServerToClientEvents } from "../shared/events";

const DEV_SERVER_PORT = 3001;
const SERVER_URL = import.meta.env.DEV
  ? `${window.location.protocol}//${window.location.hostname}:${DEV_SERVER_PORT}`
  : window.location.origin;

export const socket: Socket<ServerToClientEvents, ClientToServerEvents> = io(SERVER_URL);
