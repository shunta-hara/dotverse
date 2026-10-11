// 仕様（socket-events.md / design-decisions.md）:
//  - chat:send は最大100文字。空・超過 → CHAT_CONTENT_INVALID
//  - 500ms 以内の再送 → CHAT_RATE_LIMITED
//  - NGワード → CHAT_NG_WORD（配信も発言数加算もしない）
//  - chat:receive は半径300px 内（本人含む）。{userId, username, content, x, y, timestamp}
//  - player:size_updated は発言した本人にのみ送る
//  - speech_count は users テーブルに永続化（+1）
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CHAT_COOLDOWN_MS, CHAT_MAX_CHARS } from "../../../../../shared/constants";
import { world } from "../../../world/inMemoryWorld";
import { connect, FakeIo, resetWorld, spawn, type FakeSocket } from "./helpers";

const prismaMock = vi.hoisted(() => ({
  user: { update: vi.fn(), findUnique: vi.fn() },
  sign: { findMany: vi.fn() },
}));
vi.mock("../../../db/client", () => ({ prisma: prismaMock }));
vi.mock("../../../services/authService", () => ({ isSupporter: vi.fn(() => false) }));
vi.mock("../../../services/landService", () => ({ getLandsInArea: vi.fn(async () => []) }));

let io: FakeIo;
let sender: FakeSocket;
let near: FakeSocket;
let far: FakeSocket;

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-01-01T00:00:00Z"));
  resetWorld();
  prismaMock.user.update.mockReset().mockResolvedValue({});
  io = new FakeIo();
  sender = spawn(io, "s-sender", "u-sender", 5000, 5000);
  near = spawn(io, "s-near", "u-near", 5299, 5000);
  far = spawn(io, "s-far", "u-far", 5301, 5000);
});

afterEach(() => {
  resetWorld();
  vi.useRealTimers();
});

describe("chat:send 入力検証", () => {
  it.each([
    ["空文字", ""],
    ["空白のみ", "   "],
    ["改行のみ", "\n\n"],
    [`${CHAT_MAX_CHARS + 1}文字`, "a".repeat(CHAT_MAX_CHARS + 1)],
  ])("%s は CHAT_CONTENT_INVALID で配信されない", async (_name, content) => {
    await sender.trigger("chat:send", { content });
    expect(sender.errorCodes()).toEqual(["CHAT_CONTENT_INVALID"]);
    expect(sender.payloadsOf("chat:receive")).toHaveLength(0);
    expect(near.payloadsOf("chat:receive")).toHaveLength(0);
    expect(prismaMock.user.update).not.toHaveBeenCalled();
  });

  it("ちょうど100文字は受理される", async () => {
    await sender.trigger("chat:send", { content: "あ".repeat(CHAT_MAX_CHARS) });
    expect(sender.errorCodes()).toEqual([]);
    expect(near.payloadsOf("chat:receive")).toHaveLength(1);
  });

  it("1文字は受理される", async () => {
    await sender.trigger("chat:send", { content: "a" });
    expect(near.payloadsOf("chat:receive")).toHaveLength(1);
  });

  it.each([
    ["content が数値", { content: 123 }],
    ["content が null", { content: null }],
    ["content が配列", { content: ["a"] }],
    ["content が object", { content: {} }],
    ["content が無い", {}],
  ])("不正なペイロード（%s）はエラーで拒否され、ハンドラは例外を投げない", async (_name, payload) => {
    await expect(sender.trigger("chat:send", payload)).resolves.toBeUndefined();
    expect(sender.errorCodes()).toEqual(["CHAT_CONTENT_INVALID"]);
    expect(near.payloadsOf("chat:receive")).toHaveLength(0);
  });

  it.each([
    ["undefined", undefined],
    ["null", null],
    ["文字列", "hello"],
  ])("ペイロード自体が %s でもサーバーが落ちない（ハンドラが例外を投げない）", async (_name, payload) => {
    await expect(sender.trigger("chat:send", payload)).resolves.toBeUndefined();
    expect(near.payloadsOf("chat:receive")).toHaveLength(0);
  });

  it("join していない接続の発言は無視される", async () => {
    const ghost = connect(io, "s-ghost", "u-ghost"); // world.add していない
    await ghost.trigger("chat:send", { content: "hello" });
    expect(near.payloadsOf("chat:receive")).toHaveLength(0);
    expect(prismaMock.user.update).not.toHaveBeenCalled();
  });

  // 「最大100文字」を UTF-16 コード単位で数えているため、絵文字100個（200単位）が弾かれる。
  // 「文字」の数え方を仕様として決めたら昇格させる。
  it.todo("絵文字だけの100文字を受理するか（文字数の数え方が未定義）");
});

describe("chat:send クールダウン (500ms)", () => {
  it("499ms 後の再送は CHAT_RATE_LIMITED で配信されない", async () => {
    await sender.trigger("chat:send", { content: "one" });
    vi.advanceTimersByTime(CHAT_COOLDOWN_MS - 1);
    await sender.trigger("chat:send", { content: "two" });
    expect(sender.errorCodes()).toEqual(["CHAT_RATE_LIMITED"]);
    expect(near.payloadsOf("chat:receive")).toHaveLength(1);
  });

  it("501ms 後なら再び送れる", async () => {
    await sender.trigger("chat:send", { content: "one" });
    vi.advanceTimersByTime(CHAT_COOLDOWN_MS + 1);
    await sender.trigger("chat:send", { content: "two" });
    expect(sender.errorCodes()).toEqual([]);
    expect(near.payloadsOf("chat:receive")).toHaveLength(2);
  });

  it("クールダウンは接続ごと: 別の人の発言は妨げない", async () => {
    await sender.trigger("chat:send", { content: "one" });
    await near.trigger("chat:send", { content: "hi" });
    expect(near.errorCodes()).toEqual([]);
  });

  it("制限で弾かれた発言は発言数に加算されない", async () => {
    await sender.trigger("chat:send", { content: "one" });
    await sender.trigger("chat:send", { content: "two" });
    expect(world.getBySocketId("s-sender")?.speechCount).toBe(1);
    expect(prismaMock.user.update).toHaveBeenCalledTimes(1);
  });
});

describe("chat:send NGワード", () => {
  it("CHAT_NG_WORD を返し、誰にも配信されず、発言数も増えない", async () => {
    await sender.trigger("chat:send", { content: "fuck you" });
    expect(sender.errorCodes()).toEqual(["CHAT_NG_WORD"]);
    expect(sender.payloadsOf("chat:receive")).toHaveLength(0);
    expect(near.payloadsOf("chat:receive")).toHaveLength(0);
    expect(world.getBySocketId("s-sender")?.speechCount).toBe(0);
    expect(prismaMock.user.update).not.toHaveBeenCalled();
  });
});

describe("chat:send 配信範囲 (半径300px)", () => {
  it("本人・299px 内には届き、301px 先には届かない", async () => {
    await sender.trigger("chat:send", { content: "hello" });
    expect(sender.payloadsOf("chat:receive")).toHaveLength(1);
    expect(near.payloadsOf("chat:receive")).toHaveLength(1);
    expect(far.payloadsOf("chat:receive")).toHaveLength(0);
  });

  it("ペイロードは {userId, username, content, x, y, timestamp}（発言時の位置）", async () => {
    await sender.trigger("chat:send", { content: "hello" });
    expect(near.payloadsOf("chat:receive")[0]).toEqual({
      userId: "u-sender",
      username: "u-sender",
      content: "hello",
      x: 5000,
      y: 5000,
      timestamp: Date.now(),
    });
  });

  it("内容は加工されずそのまま届く", async () => {
    await sender.trigger("chat:send", { content: " 前後に空白 あり " });
    expect((near.payloadsOf("chat:receive")[0] as { content: string }).content).toBe(" 前後に空白 あり ");
  });

  it("斜め 304px（円の外）には届かない", async () => {
    const diagOut = spawn(io, "s-diag", "u-diag", 5215, 5215);
    await sender.trigger("chat:send", { content: "hello" });
    expect(diagOut.payloadsOf("chat:receive")).toHaveLength(0);
  });
});

describe("chat:send 発言数・サイズ更新", () => {
  it("player:size_updated は本人にのみ届き、累計発言数が +1 される", async () => {
    const me = spawn(io, "s-me", "u-me", 100, 100, 7);
    const other = spawn(io, "s-other", "u-other", 150, 100);
    await me.trigger("chat:send", { content: "hi" });
    expect(me.payloadsOf("player:size_updated")).toEqual([
      { speechCount: 8, sizeLevel: 1, lastActiveAt: Date.now() },
    ]);
    expect(other.payloadsOf("player:size_updated")).toHaveLength(0);
  });

  it("10発言目でサイズが Lv2 になる（9発言目までは Lv1）", async () => {
    const levels: unknown[] = [];
    for (let i = 0; i < 10; i++) {
      sender.clear();
      await sender.trigger("chat:send", { content: `m${i}` });
      levels.push((sender.payloadsOf("player:size_updated")[0] as { sizeLevel: number }).sizeLevel);
      vi.advanceTimersByTime(CHAT_COOLDOWN_MS + 1);
    }
    expect(levels.slice(0, 9)).toEqual(Array(9).fill(1));
    expect(levels[9]).toBe(2);
  });

  it("DB の speechCount を +1 で更新する", async () => {
    await sender.trigger("chat:send", { content: "hi" });
    expect(prismaMock.user.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "u-sender" },
        data: expect.objectContaining({ speechCount: { increment: 1 } }),
      })
    );
  });

  it("DB 書き込みが失敗してもハンドラは例外を投げない（未処理 reject でプロセスが落ちない）", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    prismaMock.user.update.mockRejectedValue(new Error("db down"));
    await expect(sender.trigger("chat:send", { content: "hi" })).resolves.toBeUndefined();
  });
});
