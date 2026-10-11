import { MOVE_SPEED, MOVE_SPEED_TOLERANCE, WORLD_SIZE } from "../../../shared/constants";
import { isFiniteNumber } from "./payload";

export function validateMove(
  newX: number,
  newY: number,
  oldX: number,
  oldY: number,
  elapsedMs: number
): { valid: boolean; reason?: string } {
  if (!isFiniteNumber(newX) || !isFiniteNumber(newY)) {
    return { valid: false, reason: "INVALID_POSITION" };
  }

  if (newX < 0 || newX > WORLD_SIZE || newY < 0 || newY > WORLD_SIZE) {
    return { valid: false, reason: "INVALID_POSITION" };
  }

  const maxDist = (MOVE_SPEED * elapsedMs) / 1000 * MOVE_SPEED_TOLERANCE;
  const dx = newX - oldX;
  const dy = newY - oldY;
  const dist = Math.sqrt(dx * dx + dy * dy);

  if (dist > maxDist + 10) {
    return { valid: false, reason: "MOVE_TOO_FAST" };
  }

  return { valid: true };
}
