import { vi } from "vitest";
import { world } from "../../../world/inMemoryWorld";
import { registerChatHandlers } from "../chatHandler";
import { registerPlayerHandlers } from "../playerHandler";

type Handler = (payload?: unknown) => unknown;

export interface Received {
  event: string;
  payload: unknown;
}

export class FakeSocket {
  readonly received: Received[] = [];
  readonly disconnect = vi.fn();
  readonly data: { userId: string; username: string; isSupporter: boolean };
  private readonly handlers = new Map<string, Handler>();

  constructor(
    readonly id: string,
    userId: string
  ) {
    this.data = { userId, username: userId, isSupporter: false };
  }

  on(event: string, handler: Handler): this {
    this.handlers.set(event, handler);
    return this;
  }

  emit(event: string, payload?: unknown): boolean {
    this.received.push({ event, payload });
    return true;
  }

  /** クライアントがイベントを送ったことをシミュレートする。ハンドラの同期例外・reject はそのまま伝わる。 */
  async trigger(event: string, payload?: unknown): Promise<void> {
    const handler = this.handlers.get(event);
    if (!handler) throw new Error(`no handler registered for ${event}`);
    await handler(payload);
  }

  payloadsOf(event: string): unknown[] {
    return this.received.filter((r) => r.event === event).map((r) => r.payload);
  }

  errorCodes(): unknown[] {
    return this.payloadsOf("error").map((p) => (p as { code?: unknown }).code);
  }

  clear(): void {
    this.received.length = 0;
  }
}

export class FakeIo {
  private readonly byId = new Map<string, FakeSocket>();
  readonly sockets = { sockets: this.byId };

  add(socket: FakeSocket): void {
    this.byId.set(socket.id, socket);
  }

  to(id: string): { emit: (event: string, payload?: unknown) => void } {
    return {
      emit: (event, payload) => {
        this.byId.get(id)?.emit(event, payload);
      },
    };
  }
}

type PlayerHandlerArgs = Parameters<typeof registerPlayerHandlers>;
type ChatHandlerArgs = Parameters<typeof registerChatHandlers>;

/** ハンドラを登録した接続を作る。world への登録はしない（join を試すテスト用）。 */
export function connect(io: FakeIo, id: string, userId: string): FakeSocket {
  const socket = new FakeSocket(id, userId);
  io.add(socket);
  // 型付き Socket.IO オブジェクトの代わりにテスト用フェイクを渡す
  registerPlayerHandlers(io as unknown as PlayerHandlerArgs[0], socket as unknown as PlayerHandlerArgs[1]);
  registerChatHandlers(io as unknown as ChatHandlerArgs[0], socket as unknown as ChatHandlerArgs[1]);
  return socket;
}

/** join 済みの状態で指定座標に配置した接続を作る。 */
export function spawn(io: FakeIo, id: string, userId: string, x: number, y: number, speechCount = 0): FakeSocket {
  const socket = connect(io, id, userId);
  world.add(id, userId, userId, speechCount, false, x, y);
  return socket;
}

export function resetWorld(): void {
  for (const id of [...world.getAllSocketIds()]) world.remove(id);
}
