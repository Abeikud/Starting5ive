import { io, type Socket } from "socket.io-client";
import type { ClientToServerEvents, ServerToClientEvents } from "../shared/events";

const SERVER_PORT = 3001;
const SERVER_URL = `${window.location.protocol}//${window.location.hostname}:${SERVER_PORT}`;

export const socket: Socket<ServerToClientEvents, ClientToServerEvents> = io(SERVER_URL);
