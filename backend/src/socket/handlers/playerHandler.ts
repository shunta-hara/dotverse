import type { Server, Socket } from "socket.io";
import { SYNC_RADIUS } from "../../../../shared/constants";
import type {
  ClientToServerEvents,
  ServerToClientEvents,
  SocketData,
} from "../../../../shared/types/socket";
import { prisma } from "../../db/client";
import { isSupporter } from "../../services/authService";
import { getLandsInArea } from "../../services/landService";
import { validateMove } from "../../utils/moveValidator";
import { world } from "../../world/inMemoryWorld";

type AppSocket = Socket<ClientToServerEvents, ServerToClientEvents, Record<string, never>, SocketData>;
type AppServer = Server<ClientToServerEvents, ServerToClientEvents, Record<string, never>, SocketData>;

export function registerPlayerHandlers(io: AppServer, socket: AppSocket): void {
  socket.on("player:join", async () => {
    try {
      const { userId, username } = socket.data;

      // 同一ユーザーの既存セッションを切断（複数タブ対策）
      const existingSocketId = world.getSocketIdByUserId(userId);
      if (existingSocketId && existingSocketId !== socket.id) {
        const existingNeighbors = world.getNeighbors(existingSocketId, SYNC_RADIUS);
        world.remove(existingSocketId);
        for (const neighbor of existingNeighbors) {
          io.to(neighbor.socketId).emit("player:left", { userId });
        }
        io.sockets.sockets.get(existingSocketId)?.disconnect(true);
      }

      const user = await prisma.user.findUnique({
        where: { id: userId },
        include: { subscription: true },
      });
      if (!user) {
        socket.disconnect(true);
        return;
      }

      const supporterActive = user.subscription
        ? isSupporter(user.subscription.plan, user.subscription.expiresAt)
        : false;

      const self = world.add(socket.id, userId, username, user.speechCount, supporterActive, user.lastX, user.lastY);

      const neighbors = world.getNeighbors(socket.id, SYNC_RADIUS);
      const [lands, signs] = await Promise.all([
        getLandsInArea(self.x, self.y, SYNC_RADIUS),
        prisma.sign.findMany({
          where: {
            deletedAt: null,
            x: { gte: Math.floor((self.x - SYNC_RADIUS) / 50), lte: Math.ceil((self.x + SYNC_RADIUS) / 50) },
            y: { gte: Math.floor((self.y - SYNC_RADIUS) / 50), lte: Math.ceil((self.y + SYNC_RADIUS) / 50) },
          },
          include: { owner: true },
        }),
      ]);

      socket.emit("world:init", {
        self: world.toActivePlayer(self),
        players: neighbors.map((p) => world.toActivePlayer(p)),
        lands,
        signs: signs.map((s) => ({
          id: s.id,
          ownerId: s.ownerId,
          x: s.x,
          y: s.y,
          xPx: s.x * 50,
          yPx: s.y * 50,
          title: s.title,
          content: s.content,
        })),
      });

      for (const neighbor of neighbors) {
        io.to(neighbor.socketId).emit("player:entered", {
          player: world.toActivePlayer(self),
        });
      }
    } catch (err) {
      console.error("player:join error:", err);
      socket.emit("error", { code: "JOIN_FAILED", message: "接続エラーが発生しました" });
    }
  });

  let lastMoveTime = Date.now();

  socket.on("player:move", ({ x, y }) => {
    const self = world.getBySocketId(socket.id);
    if (!self) return;

    const now = Date.now();
    const elapsed = now - lastMoveTime;
    lastMoveTime = now;

    const result = validateMove(x, y, self.x, self.y, elapsed);
    if (!result.valid) {
      socket.emit("error", { code: result.reason!, message: "不正な移動です" });
      return;
    }

    const prevNeighbors = new Set(
      world.getNeighbors(socket.id, SYNC_RADIUS).map((p) => p.socketId)
    );

    world.updatePosition(socket.id, x, y);

    const newNeighbors = world.getNeighbors(socket.id, SYNC_RADIUS);
    const newNeighborSet = new Set(newNeighbors.map((p) => p.socketId));

    for (const neighbor of newNeighbors) {
      if (!prevNeighbors.has(neighbor.socketId)) {
        io.to(neighbor.socketId).emit("player:entered", {
          player: world.toActivePlayer(world.getBySocketId(socket.id)!),
        });
        socket.emit("player:entered", { player: world.toActivePlayer(neighbor) });
      }
    }

    for (const prevSid of prevNeighbors) {
      if (!newNeighborSet.has(prevSid)) {
        io.to(prevSid).emit("player:left", { userId: self.userId });
        socket.emit("player:left", { userId: world.getBySocketId(prevSid)!.userId });
      }
    }

    for (const neighbor of newNeighbors) {
      io.to(neighbor.socketId).emit("player:moved", {
        userId: self.userId,
        x,
        y,
      });
    }
  });

  socket.on("player:color", ({ color }) => {
    if (!/^#[0-9A-Fa-f]{6}$/.test(color)) {
      socket.emit("error", { code: "COLOR_INVALID", message: "カラーコードの形式が正しくありません" });
      return;
    }
    world.updateColor(socket.id, color);

    const self = world.getBySocketId(socket.id);
    if (!self) return;

    const neighbors = world.getNeighbors(socket.id, SYNC_RADIUS);
    for (const neighbor of neighbors) {
      io.to(neighbor.socketId).emit("player:colored", {
        userId: self.userId,
        color,
      });
    }
  });

  socket.on("disconnect", () => {
    const neighbors = world.getNeighbors(socket.id, SYNC_RADIUS);
    const self = world.remove(socket.id);
    if (!self) return;

    for (const neighbor of neighbors) {
      io.to(neighbor.socketId).emit("player:left", { userId: self.userId });
    }

    // 最後の位置を DB に保存
    prisma.user.update({
      where: { id: self.userId },
      data: { lastX: Math.round(self.x), lastY: Math.round(self.y) },
    }).catch(() => {});
  });
}
