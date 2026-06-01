import {
  BUBBLE_CHARS_PER_LINE,
  BUBBLE_DISPLAY_MS,
  BUBBLE_FADE_MS,
  BUBBLE_MAX_LINES,
  DOT_RADIUS,
} from "@shared/constants";
import type { ActivePlayer, ChatBubble } from "@shared/types/socket";
import { type Camera, worldToScreen } from "@/hooks/useCamera";

function wrapText(text: string): string[] {
  const lines: string[] = [];
  for (let i = 0; i < text.length && lines.length < BUBBLE_MAX_LINES; i += BUBBLE_CHARS_PER_LINE) {
    lines.push(text.slice(i, i + BUBBLE_CHARS_PER_LINE));
  }
  return lines;
}

export function drawBubble(
  ctx: CanvasRenderingContext2D,
  bubble: ChatBubble,
  player: ActivePlayer | undefined,
  camera: Camera
): void {
  if (!player) return;

  const elapsed = Date.now() - bubble.timestamp;
  if (elapsed >= BUBBLE_DISPLAY_MS) return;

  const alpha =
    elapsed > BUBBLE_DISPLAY_MS - BUBBLE_FADE_MS
      ? 1 - (elapsed - (BUBBLE_DISPLAY_MS - BUBBLE_FADE_MS)) / BUBBLE_FADE_MS
      : 1;

  const { sx, sy } = worldToScreen(player.x, player.y, camera);
  const radius = DOT_RADIUS[player.sizeLevel];

  const lines = wrapText(bubble.content);
  const fontSize = 13;
  const lineH = fontSize + 4;
  const padding = { x: 10, y: 7 };
  const maxLineWidth = Math.max(...lines.map((l) => l.length)) * (fontSize * 0.6);
  const bubbleW = maxLineWidth + padding.x * 2;
  const bubbleH = lines.length * lineH + padding.y * 2;

  const bx = sx - bubbleW / 2;
  const by = sy - radius - 10 - bubbleH;
  const cornerR = 8;
  const arrowSize = 7;

  ctx.save();
  ctx.globalAlpha = alpha;

  ctx.beginPath();
  ctx.moveTo(bx + cornerR, by);
  ctx.lineTo(bx + bubbleW - cornerR, by);
  ctx.arcTo(bx + bubbleW, by, bx + bubbleW, by + cornerR, cornerR);
  ctx.lineTo(bx + bubbleW, by + bubbleH - cornerR);
  ctx.arcTo(bx + bubbleW, by + bubbleH, bx + bubbleW - cornerR, by + bubbleH, cornerR);
  ctx.lineTo(sx + arrowSize, by + bubbleH);
  ctx.lineTo(sx, by + bubbleH + arrowSize);
  ctx.lineTo(sx - arrowSize, by + bubbleH);
  ctx.lineTo(bx + cornerR, by + bubbleH);
  ctx.arcTo(bx, by + bubbleH, bx, by + bubbleH - cornerR, cornerR);
  ctx.lineTo(bx, by + cornerR);
  ctx.arcTo(bx, by, bx + cornerR, by, cornerR);
  ctx.closePath();

  ctx.fillStyle = "rgba(255,255,255,0.95)";
  ctx.fill();
  ctx.strokeStyle = player.color;
  ctx.lineWidth = 1.5;
  ctx.stroke();

  ctx.fillStyle = "#1a1a2e";
  ctx.font = `${fontSize}px sans-serif`;
  ctx.textAlign = "center";
  ctx.textBaseline = "top";

  lines.forEach((line, i) => {
    ctx.fillText(line, sx, by + padding.y + i * lineH);
  });

  ctx.restore();
}
