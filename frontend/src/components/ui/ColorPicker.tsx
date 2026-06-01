"use client";

import { useState } from "react";
import { COLORS } from "@shared/constants";
import { getSocket } from "@/hooks/useSocket";
import { useGameStore } from "@/store/gameStore";

const PRESETS = [
  { color: COLORS.CALM, label: "落ち着き" },
  { color: COLORS.HOT, label: "熱量" },
  { color: COLORS.HAPPY, label: "楽しい" },
  { color: COLORS.THINK, label: "思考中" },
] as const;

export function ColorPicker() {
  const [open, setOpen] = useState(false);
  const self = useGameStore((s) => s.self);
  const updateSelfColor = useGameStore((s) => s.updateSelfColor);

  const setColor = (color: string) => {
    getSocket().emit("player:color", { color });
    updateSelfColor(color);
    setOpen(false);
  };

  return (
    <div className="fixed left-4 bottom-16 z-10">
      <button
        onClick={() => setOpen((o) => !o)}
        className="h-10 w-10 rounded-full border-2 border-white/30 shadow-lg"
        style={{ background: self?.color ?? "#4A90E2" }}
        title="感情カラーを変更"
      />
      {open && (
        <div className="absolute bottom-12 left-0 flex flex-col gap-2 rounded-xl border border-white/20 bg-black/80 p-3 backdrop-blur">
          {PRESETS.map(({ color, label }) => (
            <button
              key={color}
              onClick={() => setColor(color)}
              className="flex items-center gap-2 text-sm text-white hover:opacity-80"
            >
              <span
                className="h-6 w-6 rounded-full border-2 border-white/20"
                style={{ background: color }}
              />
              {label}
            </button>
          ))}
          <label className="flex items-center gap-2 text-sm text-white">
            <input
              type="color"
              defaultValue={self?.color ?? "#4A90E2"}
              onChange={(e) => setColor(e.target.value)}
              className="h-6 w-6 cursor-pointer rounded border-0 bg-transparent"
            />
            カスタム
          </label>
        </div>
      )}
    </div>
  );
}
