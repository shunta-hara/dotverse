// 仕様（socket-events.md / design-decisions.md）:
//  - player:move: 範囲外 → INVALID_POSITION / 速度超過 → MOVE_TOO_FAST。拒否時は位置を変えない
//  - 視界(1000px)に入った/出た → player:entered / player:left（双方向）。視界内の移動 → player:moved
//  - player:color: #RRGGBB 以外 → COLOR_INVALID。視界内に player:colored。DBに保存しない
//  - join: world:init に self と 1000px 内の players を載せる。内部エラー → JOIN_FAILED
//  - disconnect: 視界内へ player:left、最終位置(px)を DB の last_x/last_y に保存
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DEFAULT_COLOR, SYNC_RADIUS } from "../../../../../shared/constants";
import { getLandsInArea } from "../../../services/landService";
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

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-01-01T00:00:00Z"));
  resetWorld();
  prismaMock.user.update.mockReset().mockResolvedValue({});
  prismaMock.user.findUnique.mockReset();
  prismaMock.sign.findMany.mockReset().mockResolvedValue([]);
  vi.mocked(getLandsInArea).mockClear();
  io = new FakeIo();
});

afterEach(() => {
  resetWorld();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

function pos(id: string): { x: number; y: number } | undefined {
  const p = world.getBySocketId(id);
  return p ? { x: p.x, y: p.y } : undefined;
}

describe("player:move 検証", () => {
  let a: FakeSocket;
  let b: FakeSocket;

  beforeEach(() => {
    a = spawn(io, "s-a", "u-a", 5000, 5000);
    b = spawn(io, "s-b", "u-b", 5500, 5000);
    vi.advanceTimersByTime(1000); // 1秒分の移動予算
  });

  it("正常な移動は位置を更新し、視界内の他者に player:moved を送る", async () => {
    await a.trigger("player:move", { x: 5100, y: 5000 });
    expect(a.errorCodes()).toEqual([]);
    expect(pos("s-a")).toEqual({ x: 5100, y: 5000 });
    expect(b.payloadsOf("player:moved")).toEqual([{ userId: "u-a", x: 5100, y: 5000 }]);
  });

  it("ワールド範囲外は INVALID_POSITION で拒否し、位置は変わらず、誰にも通知されない", async () => {
    await a.trigger("player:move", { x: -5, y: 5000 });
    expect(a.errorCodes()).toEqual(["INVALID_POSITION"]);
    expect(pos("s-a")).toEqual({ x: 5000, y: 5000 });
    expect(b.payloadsOf("player:moved")).toHaveLength(0);
  });

  it("速度超過は MOVE_TOO_FAST で拒否し、位置は変わらない", async () => {
    await a.trigger("player:move", { x: 6000, y: 5000 });
    expect(a.errorCodes()).toEqual(["MOVE_TOO_FAST"]);
    expect(pos("s-a")).toEqual({ x: 5000, y: 5000 });
    expect(b.payloadsOf("player:moved")).toHaveLength(0);
  });

  it("NaN 座標は拒否され、位置は壊れない", async () => {
    await a.trigger("player:move", { x: NaN, y: 5000 });
    expect(a.errorCodes()).toEqual(["INVALID_POSITION"]);
    expect(pos("s-a")).toEqual({ x: 5000, y: 5000 });
  });

  it("文字列の座標は拒否され、位置が文字列に化けない", async () => {
    await a.trigger("player:move", { x: "5100", y: "5000" });
    expect(a.errorCodes()).toEqual(["INVALID_POSITION"]);
    expect(pos("s-a")).toEqual({ x: 5000, y: 5000 });
  });

  it.each([
    ["undefined", undefined],
    ["null", null],
    ["座標なし", {}],
  ])("不正なペイロード（%s）でサーバーが落ちない", async (_name, payload) => {
    await expect(a.trigger("player:move", payload)).resolves.toBeUndefined();
    expect(pos("s-a")).toEqual({ x: 5000, y: 5000 });
  });

  it("視界(1000px)の外にいる人には player:moved を送らない", async () => {
    const outsider = spawn(io, "s-c", "u-c", 5000 + SYNC_RADIUS + 200, 5000);
    await a.trigger("player:move", { x: 5100, y: 5000 });
    expect(outsider.payloadsOf("player:moved")).toHaveLength(0);
  });
});

describe("視界の出入り (1000px)", () => {
  it("近づくと双方に player:entered、離れると双方に player:left", async () => {
    const a = spawn(io, "s-a", "u-a", 5000, 5000);
    const b = spawn(io, "s-b", "u-b", 7000, 5000); // 2000px 離れている

    vi.advanceTimersByTime(4000);
    await a.trigger("player:move", { x: 6200, y: 5000 }); // b まで 800px
    expect(a.errorCodes()).toEqual([]);
    expect((b.payloadsOf("player:entered")[0] as { player: { userId: string } }).player.userId).toBe("u-a");
    expect((a.payloadsOf("player:entered")[0] as { player: { userId: string } }).player.userId).toBe("u-b");

    vi.advanceTimersByTime(4000);
    await a.trigger("player:move", { x: 5000, y: 5000 }); // 2000px に戻る
    expect(a.errorCodes()).toEqual([]);
    expect(b.payloadsOf("player:left")).toEqual([{ userId: "u-a" }]);
    expect(a.payloadsOf("player:left")).toEqual([{ userId: "u-b" }]);
  });
});

describe("player:color", () => {
  let a: FakeSocket;
  let near: FakeSocket;
  let far: FakeSocket;

  beforeEach(() => {
    a = spawn(io, "s-a", "u-a", 5000, 5000);
    near = spawn(io, "s-near", "u-near", 5900, 5000);
    far = spawn(io, "s-far", "u-far", 6100, 5000);
  });

  it.each(["#E24A4A", "#e24a4a", "#000000", "#FFFFFF"])("%s は受理され、視界内にだけ通知される", async (color) => {
    await a.trigger("player:color", { color });
    expect(a.errorCodes()).toEqual([]);
    expect(world.getBySocketId("s-a")?.color).toBe(color);
    expect(near.payloadsOf("player:colored")).toEqual([{ userId: "u-a", color }]);
    expect(far.payloadsOf("player:colored")).toHaveLength(0);
  });

  it.each([
    ["色名", "red"],
    ["3桁", "#FFF"],
    ["5桁", "#12345"],
    ["7桁", "#1234567"],
    ["16進でない文字", "#GGGGGG"],
    ["# なし", "E24A4A"],
    ["末尾に改行", "#FFFFFF\n"],
    ["空文字", ""],
    ["数値", 0xe24a4a],
    ["null", null],
  ])("不正な形式（%s）は COLOR_INVALID で、色は変わらず通知もされない", async (_name, color) => {
    await a.trigger("player:color", { color });
    expect(a.errorCodes()).toEqual(["COLOR_INVALID"]);
    expect(world.getBySocketId("s-a")?.color).toBe(DEFAULT_COLOR);
    expect(near.payloadsOf("player:colored")).toHaveLength(0);
  });

  it.each([
    ["undefined", undefined],
    ["null", null],
  ])("ペイロード自体が %s でもサーバーが落ちない", async (_name, payload) => {
    await expect(a.trigger("player:color", payload)).resolves.toBeUndefined();
    expect(world.getBySocketId("s-a")?.color).toBe(DEFAULT_COLOR);
  });

  it("色は DB に保存しない（セッション限り）", async () => {
    await a.trigger("player:color", { color: "#E24A4A" });
    expect(prismaMock.user.update).not.toHaveBeenCalled();
  });
});

describe("player:join", () => {
  const dbUser = { id: "u-me", speechCount: 3, lastX: 5000, lastY: 5000, subscription: null };

  it("world:init に self（保存位置）と視界1000px内の他者だけを載せ、近隣に player:entered を送る", async () => {
    prismaMock.user.findUnique.mockResolvedValue(dbUser);
    const nearby = spawn(io, "s-near", "u-near", 5800, 5000);
    const distant = spawn(io, "s-far", "u-far", 7000, 5000);
    const me = connect(io, "s-me", "u-me");

    await me.trigger("player:join");

    const [init] = me.payloadsOf("world:init") as {
      self: { userId: string; x: number; y: number; speechCount: number };
      players: { userId: string }[];
    }[];
    expect(init.self).toMatchObject({ userId: "u-me", x: 5000, y: 5000, speechCount: 3 });
    expect(init.players.map((p) => p.userId)).toEqual(["u-near"]);

    expect((nearby.payloadsOf("player:entered")[0] as { player: { userId: string } }).player.userId).toBe("u-me");
    expect(distant.payloadsOf("player:entered")).toHaveLength(0);
    expect(getLandsInArea).toHaveBeenCalledWith(5000, 5000, SYNC_RADIUS);
  });

  it("自分自身は world:init の players に含まれない", async () => {
    prismaMock.user.findUnique.mockResolvedValue(dbUser);
    const me = connect(io, "s-me", "u-me");
    await me.trigger("player:join");
    const [init] = me.payloadsOf("world:init") as { players: { userId: string }[] }[];
    expect(init.players.map((p) => p.userId)).not.toContain("u-me");
  });

  it("DB エラー時は JOIN_FAILED を返し、world に残らない", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    prismaMock.user.findUnique.mockRejectedValue(new Error("db down"));
    const me = connect(io, "s-me", "u-me");
    await me.trigger("player:join");
    expect(me.errorCodes()).toEqual(["JOIN_FAILED"]);
    expect(world.getBySocketId("s-me")).toBeUndefined();
  });

  it("DB に存在しないユーザーは切断され、world に残らない", async () => {
    prismaMock.user.findUnique.mockResolvedValue(null);
    const me = connect(io, "s-me", "u-ghost");
    await me.trigger("player:join");
    expect(me.disconnect).toHaveBeenCalledWith(true);
    expect(world.getBySocketId("s-me")).toBeUndefined();
  });
});

describe("disconnect", () => {
  it("視界内に player:left を送り、world から消え、最終位置(px)を四捨五入して保存する", async () => {
    const a = spawn(io, "s-a", "u-a", 5000.4, 5000.6);
    const near = spawn(io, "s-near", "u-near", 5500, 5000);
    const far = spawn(io, "s-far", "u-far", 8000, 5000);

    await a.trigger("disconnect");

    expect(near.payloadsOf("player:left")).toEqual([{ userId: "u-a" }]);
    expect(far.payloadsOf("player:left")).toHaveLength(0);
    expect(world.getBySocketId("s-a")).toBeUndefined();
    expect(prismaMock.user.update).toHaveBeenCalledWith({
      where: { id: "u-a" },
      data: { lastX: 5000, lastY: 5001 },
    });
  });

  it("DB 保存に失敗してもハンドラは例外を投げない", async () => {
    prismaMock.user.update.mockRejectedValue(new Error("db down"));
    const a = spawn(io, "s-a", "u-a", 100, 100);
    await expect(a.trigger("disconnect")).resolves.toBeUndefined();
  });

  it("join 前の接続が切れても例外にならず、DB も更新しない", async () => {
    const ghost = connect(io, "s-ghost", "u-ghost");
    await expect(ghost.trigger("disconnect")).resolves.toBeUndefined();
    expect(prismaMock.user.update).not.toHaveBeenCalled();
  });
});
