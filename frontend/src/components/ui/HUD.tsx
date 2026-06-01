"use client";

import Link from "next/link";
import { useGameStore } from "@/store/gameStore";

export function HUD() {
  const self = useGameStore((s) => s.self);
  const count = useGameStore((s) => s.otherPlayers.size);

  if (!self) return null;

  return (
    <div className="fixed top-3 left-1/2 -translate-x-1/2 flex items-center gap-3 rounded-full border border-white/20 bg-black/60 px-4 py-1.5 text-xs text-white/70 backdrop-blur">
      <Link
        href={`/profile/${self.username}`}
        className="flex items-center hover:text-white transition-colors"
      >
        <span
          className="inline-block h-2 w-2 rounded-full mr-1"
          style={{ background: self.color }}
        />
        {self.username}
        {self.isSupporter && <span className="ml-1 text-yellow-400">★</span>}
      </Link>
      <span className="text-white/30">|</span>
      <span>Lv{self.sizeLevel}</span>
      <span className="text-white/30">|</span>
      <span>{count + 1}人オンライン</span>
    </div>
  );
}
