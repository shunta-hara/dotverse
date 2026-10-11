// 仕様: 500px セル × 20×20。近傍検索で「半径内のプレイヤーを取りこぼさない」ことが核心
// （architecture.md「SpatialGrid の設計」）。セル単位の粗い絞り込みなので、
// 返却は半径内の上位集合でよいが、半径内の取りこぼし（偽陰性）は仕様違反。
import { describe, expect, it } from "vitest";
import { CHAT_RADIUS, SYNC_RADIUS, WORLD_SIZE } from "../../../../shared/constants";
import { SpatialGrid } from "../spatialGrid";

function seededRandom(seed: number): () => number {
  let s = seed;
  return () => {
    s = (s * 1664525 + 1013904223) % 4294967296;
    return s / 4294967296;
  };
}

describe("SpatialGrid 基本操作", () => {
  it("追加したプレイヤーは自分の位置の近傍検索で見つかる", () => {
    const grid = new SpatialGrid();
    grid.add("a", 5000, 5000);
    expect(grid.getNearbySockets(5000, 5000, CHAT_RADIUS).has("a")).toBe(true);
  });

  it("遠く離れたプレイヤーは返らない", () => {
    const grid = new SpatialGrid();
    grid.add("a", 100, 100);
    grid.add("b", 9000, 9000);
    const near = grid.getNearbySockets(100, 100, SYNC_RADIUS);
    expect(near.has("a")).toBe(true);
    expect(near.has("b")).toBe(false);
  });

  it("remove したプレイヤーは以後返らない", () => {
    const grid = new SpatialGrid();
    grid.add("a", 5000, 5000);
    grid.remove("a");
    expect(grid.getNearbySockets(5000, 5000, SYNC_RADIUS).has("a")).toBe(false);
  });

  it("未登録 ID の remove は例外にならない", () => {
    const grid = new SpatialGrid();
    expect(() => grid.remove("ghost")).not.toThrow();
  });

  it("update でセルをまたぐと旧位置では見つからず、新位置で見つかる", () => {
    const grid = new SpatialGrid();
    grid.add("a", 100, 100);
    grid.update("a", 100, 100, 9000, 9000);
    expect(grid.getNearbySockets(100, 100, CHAT_RADIUS).has("a")).toBe(false);
    expect(grid.getNearbySockets(9000, 9000, CHAT_RADIUS).has("a")).toBe(true);
  });

  it("同一セル内の update でも見つかり続ける", () => {
    const grid = new SpatialGrid();
    grid.add("a", 10, 10);
    grid.update("a", 10, 10, 20, 20);
    expect(grid.getNearbySockets(20, 20, CHAT_RADIUS).has("a")).toBe(true);
  });

  it("update 後に remove すると完全に消える（ゴーストが残らない）", () => {
    const grid = new SpatialGrid();
    grid.add("a", 100, 100);
    grid.update("a", 100, 100, 4000, 4000);
    grid.remove("a");
    expect(grid.getNearbySockets(4000, 4000, WORLD_SIZE).size).toBe(0);
    expect(grid.getNearbySockets(100, 100, WORLD_SIZE).size).toBe(0);
  });
});

describe("SpatialGrid ワールド端", () => {
  it("(0,0) と (10000,10000) のプレイヤーも登録・検索できる", () => {
    const grid = new SpatialGrid();
    grid.add("min", 0, 0);
    grid.add("max", WORLD_SIZE, WORLD_SIZE);
    expect(grid.getNearbySockets(0, 0, CHAT_RADIUS).has("min")).toBe(true);
    expect(grid.getNearbySockets(WORLD_SIZE, WORLD_SIZE, CHAT_RADIUS).has("max")).toBe(true);
  });

  it("東端 (10000) のプレイヤーが、手前 (9800) からの検索で見つかる", () => {
    const grid = new SpatialGrid();
    grid.add("edge", WORLD_SIZE, 5000);
    expect(grid.getNearbySockets(9800, 5000, CHAT_RADIUS).has("edge")).toBe(true);
  });

  it("セル境界をまたぐ 2 人（499 と 501）は互いに見つかる", () => {
    const grid = new SpatialGrid();
    grid.add("left", 499, 499);
    grid.add("right", 501, 501);
    expect(grid.getNearbySockets(499, 499, CHAT_RADIUS).has("right")).toBe(true);
    expect(grid.getNearbySockets(501, 501, CHAT_RADIUS).has("left")).toBe(true);
  });
});

describe("SpatialGrid 性質: 半径内の取りこぼしがない（全探索との照合）", () => {
  const rand = seededRandom(12345);
  const coord = (): number => {
    // 端・セル境界を多めに含める
    const r = rand();
    if (r < 0.1) return 0;
    if (r < 0.2) return WORLD_SIZE;
    if (r < 0.4) return Math.floor(rand() * 20) * 500 + (rand() < 0.5 ? -1 : 0);
    return rand() * WORLD_SIZE;
  };
  const clamp = (v: number): number => Math.max(0, Math.min(WORLD_SIZE, v));

  const players = Array.from({ length: 300 }, (_, i) => ({
    id: `p${i}`,
    x: clamp(coord()),
    y: clamp(coord()),
  }));

  const grid = new SpatialGrid();
  for (const p of players) grid.add(p.id, p.x, p.y);

  it.each([CHAT_RADIUS, SYNC_RADIUS])("半径 %ipx: 距離 ≤ 半径の全員が返る", (radius) => {
    for (const center of players.slice(0, 60)) {
      const found = grid.getNearbySockets(center.x, center.y, radius);
      for (const p of players) {
        const d = Math.hypot(p.x - center.x, p.y - center.y);
        if (d <= radius) {
          expect(found.has(p.id), `${center.id}→${p.id} d=${d.toFixed(1)}`).toBe(true);
        }
      }
    }
  });

  it("ランダムに移動させ続けた後も取りこぼしがない", () => {
    const moved = players.map((p) => ({ ...p }));
    const g = new SpatialGrid();
    for (const p of moved) g.add(p.id, p.x, p.y);

    for (let step = 0; step < 2000; step++) {
      const p = moved[Math.floor(rand() * moved.length)];
      const nx = clamp(coord());
      const ny = clamp(coord());
      g.update(p.id, p.x, p.y, nx, ny);
      p.x = nx;
      p.y = ny;
    }

    for (const center of moved.slice(0, 40)) {
      const found = g.getNearbySockets(center.x, center.y, SYNC_RADIUS);
      for (const p of moved) {
        if (Math.hypot(p.x - center.x, p.y - center.y) <= SYNC_RADIUS) {
          expect(found.has(p.id), `${center.id}→${p.id}`).toBe(true);
        }
      }
    }
    // ゴースト（二重登録・消し忘れ）が無い: 全域検索で人数が一致
    expect(g.getNearbySockets(WORLD_SIZE / 2, WORLD_SIZE / 2, WORLD_SIZE).size).toBe(moved.length);
  });
});
