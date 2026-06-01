"use client";

import { useEffect, useRef, useState } from "react";
import { GameCanvas } from "@/components/canvas/GameCanvas";
import { ChatInput, type ChatInputHandle } from "@/components/ui/ChatInput";
import { ColorPicker } from "@/components/ui/ColorPicker";
import { HUD } from "@/components/ui/HUD";
import { PlaceMenu } from "@/components/ui/PlaceMenu";
import { useSocket } from "@/hooks/useSocket";

export default function WorldPage() {
  const [chatFocused, setChatFocused] = useState(false);
  const chatRef = useRef<ChatInputHandle>(null);
  useSocket();

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Enter" && !chatFocused) {
        e.preventDefault();
        chatRef.current?.focus();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [chatFocused]);

  return (
    <main className="relative h-screen w-screen overflow-hidden bg-[#1a1a2e]">
      <GameCanvas />
      <HUD />
      <ColorPicker />
      <PlaceMenu />
      <ChatInput ref={chatRef} onFocusChange={setChatFocused} />
    </main>
  );
}
