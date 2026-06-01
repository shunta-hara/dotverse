"use client";

import { useEffect, useRef } from "react";

const MOVE_KEYS = new Set(["w", "a", "s", "d", "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"]);

function isInputFocused(): boolean {
  const el = document.activeElement;
  return el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement;
}

export function useInput() {
  const keys = useRef<Set<string>>(new Set());
  const tapTarget = useRef<{ x: number; y: number } | null>(null);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (isInputFocused()) return;
      if (MOVE_KEYS.has(e.key)) {
        e.preventDefault();
        keys.current.add(e.key);
      }
    };
    const onKeyUp = (e: KeyboardEvent) => {
      keys.current.delete(e.key);
    };

    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
    };
  }, []);

  function getVelocity(dt: number, speed: number): { dx: number; dy: number } {
    const k = keys.current;
    let vx = 0;
    let vy = 0;

    if (k.has("a") || k.has("ArrowLeft")) vx -= 1;
    if (k.has("d") || k.has("ArrowRight")) vx += 1;
    if (k.has("w") || k.has("ArrowUp")) vy -= 1;
    if (k.has("s") || k.has("ArrowDown")) vy += 1;

    if (vx !== 0 && vy !== 0) {
      const norm = Math.SQRT2;
      vx /= norm;
      vy /= norm;
    }

    return { dx: vx * speed * dt, dy: vy * speed * dt };
  }

  function setTapTarget(worldX: number, worldY: number) {
    tapTarget.current = { x: worldX, y: worldY };
  }

  function clearTapTarget() {
    tapTarget.current = null;
  }

  function getTapMove(
    currentX: number,
    currentY: number,
    dt: number,
    speed: number
  ): { dx: number; dy: number } {
    const target = tapTarget.current;
    if (!target) return { dx: 0, dy: 0 };

    const dx = target.x - currentX;
    const dy = target.y - currentY;
    const dist = Math.sqrt(dx * dx + dy * dy);
    const step = speed * dt;

    if (dist <= step) {
      tapTarget.current = null;
      return { dx, dy };
    }

    return { dx: (dx / dist) * step, dy: (dy / dist) * step };
  }

  return { getVelocity, setTapTarget, clearTapTarget, getTapMove };
}
