"use client";

import { useEffect, useRef, useState } from "react";
import { LAND_CELL_SIZE, MOVE_SPEED, WORLD_SIZE } from "@shared/constants";
import type { LandSummary } from "@shared/types/socket";
import { useGameStore } from "@/store/gameStore";
import { useInput } from "@/hooks/useInput";
import { type Camera, isInViewport, screenToWorld, worldToScreen } from "@/hooks/useCamera";
import { getSocket } from "@/hooks/useSocket";
import { drawPlayer } from "./PlayerRenderer";
import { drawBubble } from "./BubbleRenderer";

const THROTTLE_MS = 50;

export function GameCanvas() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const { getVelocity, setTapTarget, getTapMove } = useInput();
  const store = useGameStore();
  const cameraRef = useRef<Camera>({ x: 5000, y: 5000, width: 0, height: 0 });
  const lastSentRef = useRef(0);
  const lastFrameRef = useRef(performance.now());
  const [, setTick] = useState(0);
  const [landToast, setLandToast] = useState<LandSummary | null>(null);
  const currentLandIdRef = useRef<string | null>(null);
  const toastTimerRef = useRef<ReturnType<typeof setTimeout>>();

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const resize = () => {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
      cameraRef.current.width = window.innerWidth;
      cameraRef.current.height = window.innerHeight;
    };
    resize();
    window.addEventListener("resize", resize);
    return () => window.removeEventListener("resize", resize);
  }, []);

  // タップ移動
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const onTouch = (e: TouchEvent) => {
      const t = e.touches[0];
      const rect = canvas.getBoundingClientRect();
      const sx = t.clientX - rect.left;
      const sy = t.clientY - rect.top;
      const { wx, wy } = screenToWorld(sx, sy, cameraRef.current);
      setTapTarget(wx, wy);
    };

    canvas.addEventListener("touchstart", onTouch, { passive: true });
    return () => canvas.removeEventListener("touchstart", onTouch);
  }, [setTapTarget]);

  useEffect(() => {
    let rafId: number;

    function loop(now: number) {
      const dt = Math.min((now - lastFrameRef.current) / 1000, 0.1);
      lastFrameRef.current = now;

      const canvas = canvasRef.current;
      const ctx = canvas?.getContext("2d");
      const self = store.self;
      if (!canvas || !ctx || !self) {
        rafId = requestAnimationFrame(loop);
        return;
      }

      // 移動計算
      const { dx: kdx, dy: kdy } = getVelocity(dt, MOVE_SPEED);
      const tap = getTapMove(self.x, self.y, dt, MOVE_SPEED);
      const dx = kdx + tap.dx;
      const dy = kdy + tap.dy;

      if (dx !== 0 || dy !== 0) {
        const nx = Math.max(0, Math.min(WORLD_SIZE, self.x + dx));
        const ny = Math.max(0, Math.min(WORLD_SIZE, self.y + dy));
        store.updateSelfPosition(nx, ny);

        const nowMs = Date.now();
        if (nowMs - lastSentRef.current >= THROTTLE_MS) {
          lastSentRef.current = nowMs;
          getSocket().emit("player:move", { x: nx, y: ny });
        }
      }

      // カメラ追従
      const camera = cameraRef.current;
      camera.x = self.x;
      camera.y = self.y;

      // 描画
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.fillStyle = "#1a1a2e";
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      // 土地の描画 & 入場検出
      let enteredLand: LandSummary | null = null;
      for (const land of store.lands) {
        const lw = land.width * LAND_CELL_SIZE;
        const lh = land.height * LAND_CELL_SIZE;
        const cx = land.xPx + lw / 2;
        const cy = land.yPx + lh / 2;
        if (!isInViewport(cx, cy, camera, Math.max(lw, lh))) continue;
        const { sx, sy } = worldToScreen(land.xPx, land.yPx, camera);

        ctx.fillStyle = "rgba(255,255,255,0.05)";
        ctx.fillRect(sx, sy, lw, lh);
        ctx.strokeStyle = "rgba(255,255,255,0.15)";
        ctx.lineWidth = 1;
        ctx.strokeRect(sx, sy, lw, lh);
        ctx.fillStyle = "rgba(255,255,255,0.5)";
        ctx.font = "11px sans-serif";
        ctx.textAlign = "left";
        ctx.fillText(land.name, sx + 4, sy + 14);

        // 入場判定
        if (
          self.x >= land.xPx && self.x < land.xPx + lw &&
          self.y >= land.yPx && self.y < land.yPx + lh
        ) {
          enteredLand = land;
        }
      }

      // 土地入場トースト
      const inLandId = enteredLand?.id ?? null;
      if (inLandId !== currentLandIdRef.current) {
        currentLandIdRef.current = inLandId;
        clearTimeout(toastTimerRef.current);
        if (enteredLand) {
          setLandToast(enteredLand);
          toastTimerRef.current = setTimeout(() => setLandToast(null), 3000);
        } else {
          setLandToast(null);
        }
      }

      // 看板の描画
      for (const sign of store.signs) {
        if (!isInViewport(sign.xPx, sign.yPx, camera, 80)) continue;
        const { sx, sy } = worldToScreen(sign.xPx, sign.yPx, camera);
        ctx.font = "16px serif";
        ctx.textAlign = "center";
        ctx.textBaseline = "bottom";
        ctx.fillText("📋", sx, sy);
        ctx.font = "bold 9px sans-serif";
        ctx.fillStyle = "rgba(255,255,200,0.9)";
        ctx.textBaseline = "top";
        ctx.fillText(sign.title.slice(0, 12), sx, sy + 2);
      }

      // 他プレイヤーの描画
      for (const [, player] of store.otherPlayers) {
        if (!isInViewport(player.x, player.y, camera)) continue;
        drawPlayer(ctx, player, camera);
      }

      // 吹き出しの描画
      for (const [, bubble] of store.bubbles) {
        const player =
          bubble.userId === self.userId
            ? self
            : store.otherPlayers.get(bubble.userId);
        if (!player) continue;
        if (!isInViewport(player.x, player.y, camera, 300)) continue;
        drawBubble(ctx, bubble, player, camera);
      }

      // 自プレイヤーの描画（最前面）
      drawPlayer(ctx, self, camera, true);

      rafId = requestAnimationFrame(loop);
    }

    rafId = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(rafId);
  }, [store, getVelocity, getTapMove]);

  // Reactの再レンダリングなしにゲームループを動かすため、rafのみで描画
  // storeの変化を検知するためのトリガー（lookupは毎フレームgameStoreから直接取得）
  void setTick;

  return (
    <>
      <canvas
        ref={canvasRef}
        className="block"
        style={{ background: "#1a1a2e", touchAction: "none" }}
      />
      {landToast && (
        <div className="fixed left-1/2 top-16 -translate-x-1/2 rounded-xl border border-white/20 bg-black/80 px-5 py-3 text-sm text-white backdrop-blur pointer-events-none">
          <div className="text-center font-bold text-white">{landToast.name}</div>
          <div className="text-center text-white/50 text-xs">オーナー: {landToast.ownerUsername}</div>
          {landToast.description && (
            <div className="mt-1 text-center text-white/70 text-xs max-w-[200px]">{landToast.description}</div>
          )}
        </div>
      )}
    </>
  );
}
