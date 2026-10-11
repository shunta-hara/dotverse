import type { Server as HttpServer } from "http";
import { Server } from "socket.io";
import { createAdapter } from "@socket.io/redis-adapter";
import { Redis } from "ioredis";
import { DISCONNECT_THRESHOLD_MS } from "../../../shared/constants";
import type {
  ClientToServerEvents,
  ServerToClientEvents,
  SocketData,
} from "../../../shared/types/socket";
import { authenticateHandshake } from "./authenticate";
import { world } from "../world/inMemoryWorld";
import { registerChatHandlers } from "./handlers/chatHandler";
import { registerPlayerHandlers } from "./handlers/playerHandler";

type AppServer = Server<ClientToServerEvents, ServerToClientEvents, Record<string, never>, SocketData>;
let ioInstance: AppServer | null = null;
export const getIo = (): AppServer | null => ioInstance;

export async function createSocketServer(httpServer: HttpServer): Promise<AppServer> {
  const io = new Server<ClientToServerEvents, ServerToClientEvents, Record<string, never>, SocketData>(
    httpServer,
    {
      cors: {
        origin: process.env.FRONTEND_URL,
        credentials: true,
      },
    }
  );

  // Redis adapter (複数ECSタスク間のpub/sub)
  if (process.env.REDIS_URL) {
    const pubClient = new Redis(process.env.REDIS_URL, { tls: process.env.REDIS_URL.startsWith("rediss://") ? {} : undefined });
    const subClient = pubClient.duplicate();
    await Promise.all([
      new Promise<void>((res, rej) => pubClient.once("ready", res).once("error", rej)),
      new Promise<void>((res, rej) => subClient.once("ready", res).once("error", rej)),
    ]);
    io.adapter(createAdapter(pubClient, subClient));
    console.log("Socket.IO: Redis adapter connected");
  }

  io.use((socket, next) => {
    try {
      const payload = authenticateHandshake(socket.handshake);
      socket.data.userId = payload.sub;
      socket.data.username = payload.username;
      socket.data.isSupporter = payload.isSupporter;
      next();
    } catch {
      next(new Error("UNAUTHORIZED"));
    }
  });

  ioInstance = io;

  io.on("connection", (socket) => {
    registerPlayerHandlers(io, socket);
    registerChatHandlers(io, socket);
  });

  // 30分無応答プレイヤーを強制切断
  setInterval(() => {
    const now = Date.now();
    for (const socketId of world.getAllSocketIds()) {
      const player = world.getBySocketId(socketId);
      if (!player) continue;
      if (now - player.lastActiveAt > DISCONNECT_THRESHOLD_MS) {
        io.sockets.sockets.get(socketId)?.disconnect(true);
      }
    }
  }, 60_000);

  return io;
}
