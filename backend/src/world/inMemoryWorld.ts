import {
  DEFAULT_COLOR,
  getSizeLevel,
  INACTIVE_THRESHOLD_MS,
  SIZE_WINDOW_MS,
  SPAWN_JITTER,
  SPAWN_X,
  SPAWN_Y,
} from "../../../shared/constants";
import type { ActivePlayer } from "../../../shared/types/socket";
import { SpatialGrid } from "../socket/spatialGrid";

interface InternalPlayer extends ActivePlayer {
  socketId: string;
  recentMessageTimestamps: number[];
}

class InMemoryWorld {
  private players = new Map<string, InternalPlayer>(); // key: socketId
  private socketToUser = new Map<string, string>(); // socketId → userId
  readonly grid = new SpatialGrid();

  add(
    socketId: string,
    userId: string,
    username: string,
    speechCount: number,
    isSupporter: boolean,
    savedX?: number,
    savedY?: number
  ): InternalPlayer {
    const jitter = () => (Math.random() - 0.5) * 2 * SPAWN_JITTER;
    const x = savedX ?? Math.max(0, Math.min(10000, SPAWN_X + jitter()));
    const y = savedY ?? Math.max(0, Math.min(10000, SPAWN_Y + jitter()));
    const now = Date.now();

    const player: InternalPlayer = {
      socketId,
      userId,
      username,
      x,
      y,
      color: DEFAULT_COLOR,
      speechCount,
      sizeLevel: getSizeLevel(0),
      isSupporter,
      isInactive: false,
      lastActiveAt: now,
      recentMessageTimestamps: [],
    };

    this.players.set(socketId, player);
    this.socketToUser.set(socketId, userId);
    this.grid.add(socketId, x, y);
    return player;
  }

  remove(socketId: string): InternalPlayer | undefined {
    const player = this.players.get(socketId);
    if (!player) return undefined;
    this.players.delete(socketId);
    this.socketToUser.delete(socketId);
    this.grid.remove(socketId);
    return player;
  }

  updatePosition(socketId: string, x: number, y: number): void {
    const player = this.players.get(socketId);
    if (!player) return;
    this.grid.update(socketId, player.x, player.y, x, y);
    player.x = x;
    player.y = y;

    // 移動時に古いメッセージタイムスタンプを掃除してsizeLevelを更新
    const cutoff = Date.now() - SIZE_WINDOW_MS;
    player.recentMessageTimestamps = player.recentMessageTimestamps.filter((t) => t > cutoff);
    player.sizeLevel = getSizeLevel(player.recentMessageTimestamps.length);
    player.isInactive = Date.now() - player.lastActiveAt > INACTIVE_THRESHOLD_MS;
  }

  recordMessage(socketId: string): { speechCount: number; sizeLevel: 1 | 2 | 3 | 4; lastActiveAt: number } {
    const player = this.players.get(socketId);
    if (!player) return { speechCount: 0, sizeLevel: 1, lastActiveAt: Date.now() };

    const now = Date.now();
    player.lastActiveAt = now;
    player.isInactive = false;
    player.speechCount += 1;

    const cutoff = now - SIZE_WINDOW_MS;
    player.recentMessageTimestamps = player.recentMessageTimestamps.filter((t) => t > cutoff);
    player.recentMessageTimestamps.push(now);
    player.sizeLevel = getSizeLevel(player.recentMessageTimestamps.length);

    return { speechCount: player.speechCount, sizeLevel: player.sizeLevel, lastActiveAt: player.lastActiveAt };
  }

  updateColor(socketId: string, color: string): void {
    const player = this.players.get(socketId);
    if (!player) return;
    player.color = color;
    player.lastActiveAt = Date.now();
    player.isInactive = false;
  }

  getBySocketId(socketId: string): InternalPlayer | undefined {
    return this.players.get(socketId);
  }

  getNeighbors(socketId: string, radius: number): InternalPlayer[] {
    const self = this.players.get(socketId);
    if (!self) return [];

    const nearbySockets = this.grid.getNearbySockets(self.x, self.y, radius);
    const result: InternalPlayer[] = [];
    const r2 = radius * radius;

    for (const sid of nearbySockets) {
      if (sid === socketId) continue;
      const p = this.players.get(sid);
      if (!p) continue;
      const dx = p.x - self.x;
      const dy = p.y - self.y;
      if (dx * dx + dy * dy <= r2) result.push(p);
    }
    return result;
  }

  getNeighborsByPos(x: number, y: number, radius: number, excludeSocketId: string): InternalPlayer[] {
    const nearbySockets = this.grid.getNearbySockets(x, y, radius);
    const result: InternalPlayer[] = [];
    const r2 = radius * radius;

    for (const sid of nearbySockets) {
      if (sid === excludeSocketId) continue;
      const p = this.players.get(sid);
      if (!p) continue;
      const dx = p.x - x;
      const dy = p.y - y;
      if (dx * dx + dy * dy <= r2) result.push(p);
    }
    return result;
  }

  getSocketIdByUserId(userId: string): string | undefined {
    for (const [sid, uid] of this.socketToUser) {
      if (uid === userId) return sid;
    }
    return undefined;
  }

  getAllSocketIds(): IterableIterator<string> {
    return this.players.keys();
  }

  toActivePlayer(p: InternalPlayer): ActivePlayer {
    return {
      userId: p.userId,
      username: p.username,
      x: p.x,
      y: p.y,
      color: p.color,
      speechCount: p.speechCount,
      sizeLevel: p.sizeLevel,
      isSupporter: p.isSupporter,
      isInactive: p.isInactive,
      lastActiveAt: p.lastActiveAt,
    };
  }
}

export const world = new InMemoryWorld();
