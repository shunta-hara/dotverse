import { DOT_RADIUS, INACTIVE_THRESHOLD_MS } from "@shared/constants";
import type { ActivePlayer } from "@shared/types/socket";
import { type Camera, worldToScreen } from "@/hooks/useCamera";

export function drawPlayer(
  ctx: CanvasRenderingContext2D,
  player: ActivePlayer,
  camera: Camera,
  isSelf = false
): void {
  const { sx, sy } = worldToScreen(player.x, player.y, camera);
  const radius = DOT_RADIUS[player.sizeLevel];
  const isInactive = Date.now() - player.lastActiveAt > INACTIVE_THRESHOLD_MS;

  ctx.save();

  if (isInactive) {
    ctx.globalAlpha = 0.5;
    ctx.fillStyle = "#888888";
    ctx.font = `${radius * 2}px serif`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText("✦", sx, sy);
  } else {
    if (isSelf) {
      ctx.shadowColor = player.color;
      ctx.shadowBlur = 8;
    }
    ctx.beginPath();
    ctx.arc(sx, sy, radius, 0, Math.PI * 2);
    ctx.fillStyle = player.color;
    ctx.fill();
    ctx.shadowBlur = 0;
  }

  const nameY = sy - radius - 6;
  const badge = player.isSupporter ? " ★" : "";
  const label = player.username + badge;

  ctx.font = "bold 12px sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "bottom";

  ctx.strokeStyle = "rgba(0,0,0,0.6)";
  ctx.lineWidth = 3;
  ctx.strokeText(label, sx, nameY);

  ctx.fillStyle = isSelf ? "#ffffff" : "#e0e0e0";
  ctx.fillText(label, sx, nameY);

  ctx.restore();
}
