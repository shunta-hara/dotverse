import { verifyToken, type JwtPayload } from "../middleware/auth";
import { isRecord } from "../utils/payload";

export interface HandshakeLike {
  headers: { cookie?: string };
  auth: unknown;
}

// フロントとバックが別オリジンのとき Cookie は届かないため、handshake.auth.token を優先する。
// token が無い場合のみ Cookie（同一オリジン構成・ローカル開発）にフォールバックする。
export function extractToken(handshake: HandshakeLike): string | undefined {
  if (isRecord(handshake.auth)) {
    const { token } = handshake.auth;
    if (typeof token === "string" && token.length > 0) return token;
  }
  const match = (handshake.headers.cookie ?? "").match(/dotverse_token=([^;]+)/);
  return match?.[1];
}

export function authenticateHandshake(handshake: HandshakeLike): JwtPayload {
  const token = extractToken(handshake);
  if (!token) throw new Error("UNAUTHORIZED");
  try {
    return verifyToken(token);
  } catch {
    throw new Error("UNAUTHORIZED");
  }
}
