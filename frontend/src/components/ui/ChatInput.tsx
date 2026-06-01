"use client";

import { forwardRef, useImperativeHandle, useRef, useState } from "react";
import { CHAT_COOLDOWN_MS, CHAT_MAX_CHARS } from "@shared/constants";
import { getSocket } from "@/hooks/useSocket";

interface Props {
  onFocusChange: (focused: boolean) => void;
}

export interface ChatInputHandle {
  focus: () => void;
}

export const ChatInput = forwardRef<ChatInputHandle, Props>(function ChatInput({ onFocusChange }, ref) {
  const [text, setText] = useState("");
  const [onCooldown, setOnCooldown] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const cooldownRef = useRef(false);

  useImperativeHandle(ref, () => ({
    focus: () => inputRef.current?.focus(),
  }));

  const send = () => {
    const content = text.trim();
    if (!content || cooldownRef.current) return;
    getSocket().emit("chat:send", { content });
    setText("");
    cooldownRef.current = true;
    setOnCooldown(true);
    setTimeout(() => {
      cooldownRef.current = false;
      setOnCooldown(false);
    }, CHAT_COOLDOWN_MS);
  };

  return (
    <div className="fixed bottom-4 left-1/2 -translate-x-1/2 flex gap-2 w-[480px] max-w-[90vw]">
      <div className="relative flex-1">
        <input
          ref={inputRef}
          value={text}
          onChange={(e) => setText(e.target.value.slice(0, CHAT_MAX_CHARS))}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              send();
            } else if (e.key === "Escape") {
              inputRef.current?.blur();
            }
          }}
          onFocus={() => onFocusChange(true)}
          onBlur={() => onFocusChange(false)}
          placeholder="メッセージを入力... (Enter で送信 / Esc で移動に戻る)"
          className="w-full rounded-xl border border-white/20 bg-black/70 px-4 py-2 pr-14 text-sm text-white placeholder-white/40 backdrop-blur focus:border-white/40 focus:outline-none"
        />
        <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-white/30">
          {text.length}/{CHAT_MAX_CHARS}
        </span>
      </div>
      <button
        onClick={send}
        disabled={onCooldown || text.trim().length === 0}
        className="rounded-xl bg-blue-500 px-4 py-2 text-sm font-bold text-white hover:bg-blue-400 disabled:opacity-40"
      >
        送信
      </button>
    </div>
  );
});
