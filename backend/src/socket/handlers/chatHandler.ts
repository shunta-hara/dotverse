import type { Server, Socket } from "socket.io";
import { CHAT_COOLDOWN_MS, CHAT_MAX_CHARS, CHAT_RADIUS, SYNC_RADIUS } from "../../../../shared/constants";
import type {
  ClientToServerEvents,
  ServerToClientEvents,
  SocketData,
} from "../../../../shared/types/socket";
import { prisma } from "../../db/client";
import { containsNgWord } from "../../utils/ngWordFilter";
import { world } from "../../world/inMemoryWorld";

type AppSocket = Socket<ClientToServerEvents, ServerToClientEvents, Record<string, never>, SocketData>;
type AppServer = Server<ClientToServerEvents, ServerToClientEvents, Record<string, never>, SocketData>;

export function registerChatHandlers(io: AppServer, socket: AppSocket): void {
  let lastChatTime = 0;

  socket.on("chat:send", async ({ content }) => {
    const self = world.getBySocketId(socket.id);
    if (!self) return;

    if (!content || content.trim().length === 0 || content.length > CHAT_MAX_CHARS) {
      socket.emit("error", { code: "CHAT_CONTENT_INVALID", message: "メッセージが無効です" });
      return;
    }

    const now = Date.now();
    if (now - lastChatTime < CHAT_COOLDOWN_MS) {
      socket.emit("error", { code: "CHAT_RATE_LIMITED", message: "送信間隔が短すぎます" });
      return;
    }

    if (containsNgWord(content)) {
      socket.emit("error", { code: "CHAT_NG_WORD", message: "使用できない言葉が含まれています" });
      return;
    }

    lastChatTime = now;

    const bubble = {
      userId: self.userId,
      username: self.username,
      content,
      x: self.x,
      y: self.y,
      timestamp: now,
    };

    const nearby = world.getNeighborsByPos(self.x, self.y, CHAT_RADIUS, socket.id);

    socket.emit("chat:receive", bubble);
    for (const neighbor of nearby) {
      io.to(neighbor.socketId).emit("chat:receive", bubble);
    }

    const { speechCount, sizeLevel, lastActiveAt } = world.recordMessage(socket.id);

    socket.emit("player:size_updated", { speechCount, sizeLevel, lastActiveAt });

    // 近隣プレイヤーにサイズ・活動状態の変化を通知
    const updatedSelf = world.getBySocketId(socket.id);
    if (updatedSelf) {
      const syncNeighbors = world.getNeighborsByPos(updatedSelf.x, updatedSelf.y, SYNC_RADIUS, socket.id);
      for (const neighbor of syncNeighbors) {
        io.to(neighbor.socketId).emit("player:entered", {
          player: world.toActivePlayer(updatedSelf),
        });
      }
    }

    await prisma.user.update({
      where: { id: self.userId },
      data: {
        speechCount: { increment: 1 },
        lastActiveAt: new Date(),
      },
    });
  });
}
