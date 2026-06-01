"use client";

export interface Camera {
  x: number;
  y: number;
  width: number;
  height: number;
}

export function worldToScreen(
  worldX: number,
  worldY: number,
  camera: Camera
): { sx: number; sy: number } {
  return {
    sx: worldX - camera.x + camera.width / 2,
    sy: worldY - camera.y + camera.height / 2,
  };
}

export function screenToWorld(
  screenX: number,
  screenY: number,
  camera: Camera
): { wx: number; wy: number } {
  return {
    wx: screenX + camera.x - camera.width / 2,
    wy: screenY + camera.y - camera.height / 2,
  };
}

export function isInViewport(
  worldX: number,
  worldY: number,
  camera: Camera,
  margin = 100
): boolean {
  const { sx, sy } = worldToScreen(worldX, worldY, camera);
  return (
    sx >= -margin &&
    sx <= camera.width + margin &&
    sy >= -margin &&
    sy <= camera.height + margin
  );
}
