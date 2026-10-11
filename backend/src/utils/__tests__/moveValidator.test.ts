// 仕様: 「前回位置 + 経過時間×速度（200px/秒、許容係数1.5）で最大移動量を検証」
//       範囲外 → INVALID_POSITION / 速度超過 → MOVE_TOO_FAST（socket-events.md）
import { describe, expect, it } from "vitest";
import { validateMove } from "../moveValidator";

describe("validateMove: ワールド範囲 (0〜10000)", () => {
  it("範囲の四隅は有効", () => {
    expect(validateMove(0, 0, 0, 0, 1000).valid).toBe(true);
    expect(validateMove(10000, 10000, 10000, 10000, 1000).valid).toBe(true);
  });

  it.each([
    [-1, 5000],
    [5000, -1],
    [10001, 5000],
    [5000, 10001],
  ])("(%i, %i) は INVALID_POSITION", (x, y) => {
    expect(validateMove(x, y, 5000, 5000, 60_000)).toEqual({
      valid: false,
      reason: "INVALID_POSITION",
    });
  });

  it("範囲外は速度に関係なく INVALID_POSITION（速度超過より先に判定）", () => {
    expect(validateMove(20000, 5000, 5000, 5000, 100).reason).toBe("INVALID_POSITION");
  });

  it.each([
    ["NaN", NaN, 5000],
    ["Infinity", Infinity, 5000],
    ["-Infinity", 5000, -Infinity],
    ["NaN(y)", 5000, NaN],
  ])("%s は無効（不正な座標を受理してはならない）", (_name, x, y) => {
    const r = validateMove(x, y, 5000, 5000, 1000);
    expect(r.valid).toBe(false);
  });
});

describe("validateMove: 速度チェック (200px/秒 × 1.5)", () => {
  it("1秒で 300px（上限）までは有効", () => {
    expect(validateMove(5300, 5000, 5000, 5000, 1000).valid).toBe(true);
  });

  it("1秒で 350px は MOVE_TOO_FAST", () => {
    expect(validateMove(5350, 5000, 5000, 5000, 1000)).toEqual({
      valid: false,
      reason: "MOVE_TOO_FAST",
    });
  });

  it("上限は経過時間に比例する（2秒なら 600px まで）", () => {
    expect(validateMove(5600, 5000, 5000, 5000, 2000).valid).toBe(true);
    expect(validateMove(5700, 5000, 5000, 5000, 2000).valid).toBe(false);
  });

  it("距離はユークリッド距離で測る（斜め (212,212)≈300px は有効、(300,300)≈424px は無効）", () => {
    expect(validateMove(5212, 5212, 5000, 5000, 1000).valid).toBe(true);
    expect(validateMove(5300, 5300, 5000, 5000, 1000).valid).toBe(false);
  });

  it("負方向の移動も同じ基準で判定される", () => {
    expect(validateMove(4700, 5000, 5000, 5000, 1000).valid).toBe(true);
    expect(validateMove(4600, 5000, 5000, 5000, 1000).valid).toBe(false);
  });

  it("経過時間 0ms で大きく動くのは無効（瞬間移動）", () => {
    expect(validateMove(5100, 5000, 5000, 5000, 0).valid).toBe(false);
  });

  it("動かない（同一座標）なら経過時間 0 でも有効", () => {
    expect(validateMove(5000, 5000, 5000, 5000, 0).valid).toBe(true);
  });

  it("経過時間が負（時計の巻き戻り）でも大きな移動は通さない", () => {
    expect(validateMove(5500, 5000, 5000, 5000, -10_000).valid).toBe(false);
  });
});
