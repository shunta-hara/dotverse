export const WORLD_SIZE = 10000;
export const CELL_SIZE = 500;
export const GRID_SIZE = 20;

export const LAND_CELL_SIZE = 50;
export const LAND_SIZE_MASU = 20;
export const LAND_SIZE_PX = LAND_CELL_SIZE * LAND_SIZE_MASU; // 1000px

export const CHAT_RADIUS = 300;
export const SYNC_RADIUS = 1000;
export const SPAWN_X = 5000;
export const SPAWN_Y = 5000;
export const SPAWN_JITTER = 500;
export const MOVE_SPEED = 200; // px/秒
export const MOVE_SPEED_TOLERANCE = 1.5; // チート判定の余裕係数

export const CHAT_MAX_CHARS = 100;
export const CHAT_COOLDOWN_MS = 500;
export const BUBBLE_DISPLAY_MS = 10000;
export const BUBBLE_FADE_MS = 2000;
export const BUBBLE_MAX_LINES = 3;
export const BUBBLE_CHARS_PER_LINE = 16;

export const INACTIVE_THRESHOLD_MS = 5 * 60 * 1000; // 5分
export const DISCONNECT_THRESHOLD_MS = 30 * 60 * 1000; // 30分

// サイズレベル: 直近30分の発言数で判定
export const SIZE_WINDOW_MS = 30 * 60 * 1000;
export const SPEECH_LEVEL_THRESHOLDS = [0, 10, 50, 200] as const;
export const DOT_RADIUS: Record<1 | 2 | 3 | 4, number> = {
  1: 4,
  2: 7,
  3: 11,
  4: 16,
};

export const FREE_LAND_LIMIT = 1;
export const SUPPORTER_LAND_LIMIT = 10;
export const FREE_SIGN_LIMIT = 3;
export const SUPPORTER_SIGN_LIMIT = 50;
export const FREE_PROFILE_LIMIT = 100;
export const SUPPORTER_PROFILE_LIMIT = 1000;

export const DEFAULT_COLOR = "#4A90E2";
export const COLORS = {
  CALM: "#4A90E2",
  HOT: "#E24A4A",
  HAPPY: "#E2C24A",
  THINK: "#9B4AE2",
} as const;

export function getSizeLevel(recentCount: number): 1 | 2 | 3 | 4 {
  if (recentCount >= SPEECH_LEVEL_THRESHOLDS[3]) return 4;
  if (recentCount >= SPEECH_LEVEL_THRESHOLDS[2]) return 3;
  if (recentCount >= SPEECH_LEVEL_THRESHOLDS[1]) return 2;
  return 1;
}
