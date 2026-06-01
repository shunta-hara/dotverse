"use client";

import { create } from "zustand";
import type { ActivePlayer, ChatBubble, LandSummary, SignSummary } from "@shared/types/socket";

interface GameState {
  self: ActivePlayer | null;
  otherPlayers: Map<string, ActivePlayer>;
  bubbles: Map<string, ChatBubble>;
  lands: LandSummary[];
  signs: SignSummary[];

  setSelf: (player: ActivePlayer) => void;
  updateSelfPosition: (x: number, y: number) => void;
  updateSelfColor: (color: string) => void;
  updateSelfSize: (speechCount: number, sizeLevel: 1 | 2 | 3 | 4, lastActiveAt: number) => void;

  addPlayer: (player: ActivePlayer) => void;
  updatePlayerPosition: (userId: string, x: number, y: number) => void;
  updatePlayerColor: (userId: string, color: string) => void;
  removePlayer: (userId: string) => void;

  addBubble: (bubble: ChatBubble) => void;
  removeBubble: (key: string) => void;

  setLands: (lands: LandSummary[]) => void;
  addLand: (land: LandSummary) => void;
  removeLand: (id: string) => void;
  setSigns: (signs: SignSummary[]) => void;
  addSign: (sign: SignSummary) => void;
  removeSign: (id: string) => void;

  reset: () => void;
}

export const useGameStore = create<GameState>((set) => ({
  self: null,
  otherPlayers: new Map(),
  bubbles: new Map(),
  lands: [],
  signs: [],

  setSelf: (player) => set({ self: player }),

  updateSelfPosition: (x, y) =>
    set((s) => s.self ? { self: { ...s.self, x, y } } : {}),

  updateSelfColor: (color) =>
    set((s) => s.self ? { self: { ...s.self, color } } : {}),

  updateSelfSize: (speechCount, sizeLevel, lastActiveAt) =>
    set((s) => s.self ? { self: { ...s.self, speechCount, sizeLevel, lastActiveAt } } : {}),

  addPlayer: (player) =>
    set((s) => {
      const next = new Map(s.otherPlayers);
      next.set(player.userId, player);
      return { otherPlayers: next };
    }),

  updatePlayerPosition: (userId, x, y) =>
    set((s) => {
      const p = s.otherPlayers.get(userId);
      if (!p) return {};
      const next = new Map(s.otherPlayers);
      next.set(userId, { ...p, x, y });
      return { otherPlayers: next };
    }),

  updatePlayerColor: (userId, color) =>
    set((s) => {
      const p = s.otherPlayers.get(userId);
      if (!p) return {};
      const next = new Map(s.otherPlayers);
      next.set(userId, { ...p, color });
      return { otherPlayers: next };
    }),

  removePlayer: (userId) =>
    set((s) => {
      const next = new Map(s.otherPlayers);
      next.delete(userId);
      return { otherPlayers: next };
    }),

  addBubble: (bubble) =>
    set((s) => {
      const key = `${bubble.userId}-${bubble.timestamp}`;
      const next = new Map(s.bubbles);
      next.set(key, bubble);
      return { bubbles: next };
    }),

  removeBubble: (key) =>
    set((s) => {
      const next = new Map(s.bubbles);
      next.delete(key);
      return { bubbles: next };
    }),

  setLands: (lands) => set({ lands }),
  addLand: (land) => set((s) => ({ lands: [...s.lands, land] })),
  removeLand: (id) => set((s) => ({ lands: s.lands.filter((l) => l.id !== id) })),
  setSigns: (signs) => set({ signs }),
  addSign: (sign) => set((s) => ({ signs: [...s.signs, sign] })),
  removeSign: (id) => set((s) => ({ signs: s.signs.filter((sg) => sg.id !== id) })),

  reset: () =>
    set({
      self: null,
      otherPlayers: new Map(),
      bubbles: new Map(),
      lands: [],
      signs: [],
    }),
}));
