"use client";

import { useEffect } from "react";
import { io, type Socket } from "socket.io-client";
import type { ClientToServerEvents, ServerToClientEvents } from "@shared/types/socket";
import { BUBBLE_DISPLAY_MS } from "@shared/constants";
import { useGameStore } from "@/store/gameStore";

type AppSocket = Socket<ServerToClientEvents, ClientToServerEvents>;

// globalThis prevents HMR module re-evaluation from creating a second socket instance
const g = globalThis as typeof globalThis & { __dotverseSocket?: AppSocket };

export function getSocket(): AppSocket {
  if (!g.__dotverseSocket) {
    g.__dotverseSocket = io(process.env.NEXT_PUBLIC_WS_URL ?? "http://localhost:4000", {
      withCredentials: true,
      transports: ["websocket"],
    });
  }
  return g.__dotverseSocket;
}

export function disconnectSocket(): void {
  g.__dotverseSocket?.disconnect();
  g.__dotverseSocket = undefined;
}

export function useSocket() {
  useEffect(() => {
    const s = getSocket();
    const gs = useGameStore.getState;

    const handleConnect = () => {
      gs().reset();
      s.emit("player:join");
    };

    s.on("world:init", ({ self, players, lands, signs }) => {
      gs().setSelf(self);
      players.forEach((p) => gs().addPlayer(p));
      gs().setLands(lands);
      gs().setSigns(signs);
    });

    s.on("player:entered", ({ player }) => gs().addPlayer(player));
    s.on("player:moved", ({ userId, x, y }) => gs().updatePlayerPosition(userId, x, y));
    s.on("player:left", ({ userId }) => gs().removePlayer(userId));

    s.on("chat:receive", (bubble) => {
      gs().addBubble(bubble);
      const key = `${bubble.userId}-${bubble.timestamp}`;
      setTimeout(() => gs().removeBubble(key), BUBBLE_DISPLAY_MS);
    });

    s.on("player:colored", ({ userId, color }) => gs().updatePlayerColor(userId, color));

    s.on("player:size_updated", ({ speechCount, sizeLevel, lastActiveAt }) =>
      gs().updateSelfSize(speechCount, sizeLevel, lastActiveAt)
    );

    s.on("land:created", (land) => gs().addLand(land));
    s.on("land:deleted", ({ id }) => gs().removeLand(id));
    s.on("sign:created", (sign) => gs().addSign(sign));
    s.on("sign:deleted", ({ id }) => gs().removeSign(id));

    // Emit player:join on connect (handles initial connect AND reconnects)
    s.on("connect", handleConnect);
    // If socket is already connected (e.g., StrictMode second mount), join immediately
    if (s.connected) handleConnect();

    return () => {
      s.off("connect", handleConnect);
      s.off("world:init");
      s.off("player:entered");
      s.off("player:moved");
      s.off("player:left");
      s.off("chat:receive");
      s.off("player:colored");
      s.off("player:size_updated");
      s.off("land:created");
      s.off("land:deleted");
      s.off("sign:created");
      s.off("sign:deleted");
    };
  }, []);

  return getSocket();
}
