// 仕様: architecture.md「サイズレベル設計」「座標系」、design-decisions.md
//  - サイズレベル: 直近30分の発言数 0/10/50/200
//  - 非アクティブ: 5分経過 → isInactive
//  - 感情カラー: セッション毎に #4A90E2 にリセット（永続化しない）
//  - speechCount は累計（users テーブルの値）で、サイズレベルとは別物
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  CHAT_RADIUS,
  DEFAULT_COLOR,
  INACTIVE_THRESHOLD_MS,
  SIZE_WINDOW_MS,
  SPAWN_JITTER,
  SPAWN_X,
  SPAWN_Y,
  SYNC_RADIUS,
} from "../../../../shared/constants";
import { world } from "../inMemoryWorld";

function resetWorld(): void {
  for (const id of [...world.getAllSocketIds()]) world.remove(id);
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-01-01T00:00:00Z"));
  resetWorld();
});

afterEach(() => {
  resetWorld();
  vi.useRealTimers();
});

describe("スポーン", () => {
  it("保存位置があればそこに出現する", () => {
    const p = world.add("s1", "u1", "alice", 0, false, 1234, 4321);
    expect(p.x).toBe(1234);
    expect(p.y).toBe(4321);
  });

  it("保存位置が 0 でも 0 として扱う（falsy を未保存と誤認しない）", () => {
    const p = world.add("s1", "u1", "alice", 0, false, 0, 0);
    expect(p.x).toBe(0);
    expect(p.y).toBe(0);
  });

  it("保存位置がなければ (5000,5000) ± 500 の範囲に出現する", () => {
    for (let i = 0; i < 300; i++) {
      const p = world.add(`s${i}`, `u${i}`, `n${i}`, 0, false);
      expect(p.x).toBeGreaterThanOrEqual(SPAWN_X - SPAWN_JITTER);
      expect(p.x).toBeLessThanOrEqual(SPAWN_X + SPAWN_JITTER);
      expect(p.y).toBeGreaterThanOrEqual(SPAWN_Y - SPAWN_JITTER);
      expect(p.y).toBeLessThanOrEqual(SPAWN_Y + SPAWN_JITTER);
    }
  });

  it("初期状態: 色は #4A90E2、Lv1、非アクティブでない", () => {
    const p = world.add("s1", "u1", "alice", 500, false, 100, 100);
    expect(p.color).toBe(DEFAULT_COLOR);
    expect(p.sizeLevel).toBe(1);
    expect(p.isInactive).toBe(false);
  });

  it("累計発言数が多くてもログイン直後のサイズは Lv1（サイズは直近30分の発言数で決まる）", () => {
    const p = world.add("s1", "u1", "alice", 9999, false, 100, 100);
    expect(p.speechCount).toBe(9999);
    expect(p.sizeLevel).toBe(1);
  });

  it("追加したプレイヤーが grid に載り、近傍検索で見つかる", () => {
    world.add("s1", "u1", "alice", 0, false, 1000, 1000);
    world.add("s2", "u2", "bob", 0, false, 1100, 1000);
    expect(world.getNeighbors("s1", CHAT_RADIUS).map((p) => p.userId)).toEqual(["u2"]);
  });
});

describe("recordMessage: サイズレベル（直近30分の発言数）", () => {
  function sendN(socketId: string, n: number): ReturnType<typeof world.recordMessage> {
    let last = world.recordMessage(socketId);
    for (let i = 1; i < n; i++) {
      vi.advanceTimersByTime(1000);
      last = world.recordMessage(socketId);
    }
    return last;
  }

  it.each([
    [1, 1],
    [9, 1],
    [10, 2],
    [49, 2],
    [50, 3],
    [199, 3],
    [200, 4],
  ])("30分以内に %i 発言 → Lv%i", (n, level) => {
    world.add("s1", "u1", "alice", 0, false, 100, 100);
    expect(sendN("s1", n).sizeLevel).toBe(level);
  });

  it("30分より前の発言は数えない（窓の外に出たら Lv1 に戻る）", () => {
    world.add("s1", "u1", "alice", 0, false, 100, 100);
    expect(sendN("s1", 10).sizeLevel).toBe(2);
    vi.advanceTimersByTime(SIZE_WINDOW_MS + 1000);
    expect(world.recordMessage("s1").sizeLevel).toBe(1);
  });

  it("29分59秒前の発言はまだ数える", () => {
    world.add("s1", "u1", "alice", 0, false, 100, 100);
    for (let i = 0; i < 9; i++) world.recordMessage("s1");
    vi.advanceTimersByTime(SIZE_WINDOW_MS - 1000);
    expect(world.recordMessage("s1").sizeLevel).toBe(2); // 9 + 1 = 10 発言
  });

  it("発言せず窓が過ぎた後、移動した時点でサイズが Lv1 に戻る", () => {
    world.add("s1", "u1", "alice", 0, false, 100, 100);
    sendN("s1", 10);
    vi.advanceTimersByTime(SIZE_WINDOW_MS + 1000);
    world.updatePosition("s1", 110, 100);
    expect(world.getBySocketId("s1")?.sizeLevel).toBe(1);
  });

  it("累計 speechCount は窓に関係なく増え続ける", () => {
    world.add("s1", "u1", "alice", 100, false, 100, 100);
    world.recordMessage("s1");
    vi.advanceTimersByTime(SIZE_WINDOW_MS * 2);
    const r = world.recordMessage("s1");
    expect(r.speechCount).toBe(102);
    expect(r.sizeLevel).toBe(1);
  });

  it("未登録 socket への recordMessage は例外にならない", () => {
    expect(() => world.recordMessage("ghost")).not.toThrow();
  });
});

describe("非アクティブ判定（5分）", () => {
  it("4分59秒では非アクティブでない", () => {
    world.add("s1", "u1", "alice", 0, false, 100, 100);
    vi.advanceTimersByTime(INACTIVE_THRESHOLD_MS - 1000);
    world.updatePosition("s1", 110, 100);
    expect(world.getBySocketId("s1")?.isInactive).toBe(false);
  });

  it("5分1秒経過で非アクティブになる", () => {
    world.add("s1", "u1", "alice", 0, false, 100, 100);
    vi.advanceTimersByTime(INACTIVE_THRESHOLD_MS + 1000);
    world.updatePosition("s1", 110, 100);
    expect(world.getBySocketId("s1")?.isInactive).toBe(true);
  });

  it("発言すると非アクティブが解除され、lastActiveAt が更新される", () => {
    world.add("s1", "u1", "alice", 0, false, 100, 100);
    vi.advanceTimersByTime(INACTIVE_THRESHOLD_MS + 1000);
    world.updatePosition("s1", 110, 100);
    const r = world.recordMessage("s1");
    expect(world.getBySocketId("s1")?.isInactive).toBe(false);
    expect(r.lastActiveAt).toBe(Date.now());
  });

  // 「移動も活動に含めるか」は仕様書に記載がない。現実装では移動しても lastActiveAt は
  // 更新されず、動き続けていても発言しなければ5分で ✦ 表示になる。方針決定後に昇格させる。
  it.todo("移動だけしているプレイヤーを非アクティブ扱いにするか（仕様未定義）");
});

describe("近傍検索", () => {
  it("自分自身は含まない", () => {
    world.add("s1", "u1", "alice", 0, false, 100, 100);
    expect(world.getNeighbors("s1", SYNC_RADIUS)).toEqual([]);
  });

  it("未登録 socket では空配列", () => {
    expect(world.getNeighbors("ghost", SYNC_RADIUS)).toEqual([]);
  });

  it("半径300: 299px 内は含み、301px 外は含まない", () => {
    world.add("me", "u0", "me", 0, false, 5000, 5000);
    world.add("in", "u1", "in", 0, false, 5299, 5000);
    world.add("out", "u2", "out", 0, false, 5301, 5000);
    const ids = world.getNeighbors("me", CHAT_RADIUS).map((p) => p.userId);
    expect(ids).toContain("u1");
    expect(ids).not.toContain("u2");
  });

  it("距離は円（ユークリッド）で測る: 斜め (215,215)≈304px は半径300の外", () => {
    world.add("me", "u0", "me", 0, false, 5000, 5000);
    world.add("diag-in", "u1", "a", 0, false, 5210, 5210); // ≈297
    world.add("diag-out", "u2", "b", 0, false, 5215, 5215); // ≈304
    const ids = world.getNeighbors("me", CHAT_RADIUS).map((p) => p.userId);
    expect(ids).toContain("u1");
    expect(ids).not.toContain("u2");
  });

  it("セル境界をまたぐ近距離の相手も見つかる", () => {
    world.add("me", "u0", "me", 0, false, 499, 499);
    world.add("other", "u1", "o", 0, false, 520, 520);
    expect(world.getNeighbors("me", CHAT_RADIUS).map((p) => p.userId)).toEqual(["u1"]);
  });

  it("移動後は新しい位置を基準に近傍が変わる", () => {
    world.add("me", "u0", "me", 0, false, 1000, 1000);
    world.add("far", "u1", "far", 0, false, 3000, 1000);
    expect(world.getNeighbors("me", SYNC_RADIUS)).toHaveLength(0);
    world.updatePosition("me", 2500, 1000);
    expect(world.getNeighbors("me", SYNC_RADIUS).map((p) => p.userId)).toEqual(["u1"]);
  });

  it("getNeighborsByPos は指定 socket を除外する", () => {
    world.add("me", "u0", "me", 0, false, 1000, 1000);
    world.add("o", "u1", "o", 0, false, 1100, 1000);
    const ids = world.getNeighborsByPos(1000, 1000, CHAT_RADIUS, "me").map((p) => p.userId);
    expect(ids).toEqual(["u1"]);
  });
});

describe("remove / 検索", () => {
  it("remove したプレイヤーは近傍にも ID 検索にも現れない", () => {
    world.add("me", "u0", "me", 0, false, 1000, 1000);
    world.add("o", "u1", "o", 0, false, 1100, 1000);
    const removed = world.remove("o");
    expect(removed?.userId).toBe("u1");
    expect(world.getNeighbors("me", SYNC_RADIUS)).toEqual([]);
    expect(world.getBySocketId("o")).toBeUndefined();
    expect(world.getSocketIdByUserId("u1")).toBeUndefined();
  });

  it("未登録 socket の remove は undefined", () => {
    expect(world.remove("ghost")).toBeUndefined();
  });

  it("userId から socketId を引ける", () => {
    world.add("s9", "u9", "nine", 0, false, 100, 100);
    expect(world.getSocketIdByUserId("u9")).toBe("s9");
  });
});

describe("カラー", () => {
  it("updateColor で色が変わる", () => {
    world.add("s1", "u1", "alice", 0, false, 100, 100);
    world.updateColor("s1", "#E24A4A");
    expect(world.getBySocketId("s1")?.color).toBe("#E24A4A");
  });

  it("再ログイン（再 add）で色は初期値に戻る（永続化しない）", () => {
    world.add("s1", "u1", "alice", 0, false, 100, 100);
    world.updateColor("s1", "#E24A4A");
    world.remove("s1");
    expect(world.add("s2", "u1", "alice", 0, false, 100, 100).color).toBe(DEFAULT_COLOR);
  });
});

describe("toActivePlayer", () => {
  it("内部状態（socketId・発言タイムスタンプ）をクライアントへ漏らさない", () => {
    const p = world.add("s1", "u1", "alice", 3, true, 100, 200);
    const out = world.toActivePlayer(p);
    expect(Object.keys(out).sort()).toEqual(
      [
        "color",
        "isInactive",
        "isSupporter",
        "lastActiveAt",
        "sizeLevel",
        "speechCount",
        "userId",
        "username",
        "x",
        "y",
      ].sort()
    );
  });
});
