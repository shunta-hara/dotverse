// 仕様の出典: Obsidian Knowledge/dotverse/{architecture,api,socket-events}.md と
// Decisions/dotverse/2026-05-30-design-decisions.md。
// 実装の値を写すのではなく、仕様書の値を直接書いている。
import { describe, expect, it } from "vitest";
import * as C from "../../../shared/constants";

describe("仕様定数", () => {
  it("ワールドは 10000×10000 px、セルは 500px の 20×20", () => {
    expect(C.WORLD_SIZE).toBe(10000);
    expect(C.CELL_SIZE).toBe(500);
    expect(C.GRID_SIZE).toBe(20);
    expect(C.CELL_SIZE * C.GRID_SIZE).toBe(C.WORLD_SIZE);
  });

  it("土地は 20×20 マス = 1000×1000 px、1マス 50px", () => {
    expect(C.LAND_CELL_SIZE).toBe(50);
    expect(C.LAND_SIZE_MASU).toBe(20);
    expect(C.LAND_SIZE_PX).toBe(1000);
  });

  it("土地を置ける最大マス座標は 180（ワールド 200 マス − 土地 20 マス）", () => {
    expect(C.WORLD_SIZE / C.LAND_CELL_SIZE - C.LAND_SIZE_MASU).toBe(180);
  });

  it("チャット半径 300px / 同期半径 1000px", () => {
    expect(C.CHAT_RADIUS).toBe(300);
    expect(C.SYNC_RADIUS).toBe(1000);
  });

  it("チャットは最大 100 文字、クールダウン 500ms、吹き出し表示 10 秒", () => {
    expect(C.CHAT_MAX_CHARS).toBe(100);
    expect(C.CHAT_COOLDOWN_MS).toBe(500);
    expect(C.BUBBLE_DISPLAY_MS).toBe(10_000);
  });

  it("非アクティブ 5 分 / 強制切断 30 分 / サイズ集計窓 30 分", () => {
    expect(C.INACTIVE_THRESHOLD_MS).toBe(5 * 60 * 1000);
    expect(C.DISCONNECT_THRESHOLD_MS).toBe(30 * 60 * 1000);
    expect(C.SIZE_WINDOW_MS).toBe(30 * 60 * 1000);
  });

  it("サイズレベル閾値は 0/10/50/200、半径は 4/7/11/16 px", () => {
    expect([...C.SPEECH_LEVEL_THRESHOLDS]).toEqual([0, 10, 50, 200]);
    expect(C.DOT_RADIUS).toEqual({ 1: 4, 2: 7, 3: 11, 4: 16 });
  });

  it("保有上限: 土地 無料1/サポーター10、看板 3/50、プロフィール 100/1000 文字", () => {
    expect(C.FREE_LAND_LIMIT).toBe(1);
    expect(C.SUPPORTER_LAND_LIMIT).toBe(10);
    expect(C.FREE_SIGN_LIMIT).toBe(3);
    expect(C.SUPPORTER_SIGN_LIMIT).toBe(50);
    expect(C.FREE_PROFILE_LIMIT).toBe(100);
    expect(C.SUPPORTER_PROFILE_LIMIT).toBe(1000);
  });

  it("感情カラーの初期値は #4A90E2", () => {
    expect(C.DEFAULT_COLOR).toBe("#4A90E2");
  });
});

describe("getSizeLevel（直近30分の発言数 0/10/50/200 で Lv1〜4）", () => {
  it.each([
    [0, 1],
    [1, 1],
    [9, 1],
    [10, 2],
    [11, 2],
    [49, 2],
    [50, 3],
    [199, 3],
    [200, 4],
    [10_000, 4],
  ])("発言数 %i → Lv%i", (count, level) => {
    expect(C.getSizeLevel(count)).toBe(level);
  });

  it("負の値でも Lv1 を下回らない", () => {
    expect(C.getSizeLevel(-1)).toBe(1);
  });

  it("発言が増えてもレベルは下がらない（単調非減少）", () => {
    let prev = 1;
    for (let n = 0; n <= 300; n++) {
      const lv = C.getSizeLevel(n);
      expect(lv).toBeGreaterThanOrEqual(prev);
      prev = lv;
    }
  });
});
