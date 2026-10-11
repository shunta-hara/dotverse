import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import type { JwtPayload } from "../middleware/auth";

const BCRYPT_ROUNDS = 12;
const JWT_EXPIRES_IN = "7d";

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, BCRYPT_ROUNDS);
}

export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

export function signToken(payload: JwtPayload): string {
  return jwt.sign(payload, process.env.JWT_SECRET!, { expiresIn: JWT_EXPIRES_IN });
}

export const SOCKET_TOKEN_EXPIRES_IN_SECONDS = 60;

// WebSocket 接続専用の短命トークン。HttpOnly Cookie を JS から読めないまま、別オリジンの Socket.IO に認証を渡す
export function signSocketToken(payload: JwtPayload): string {
  return jwt.sign(payload, process.env.JWT_SECRET!, { expiresIn: SOCKET_TOKEN_EXPIRES_IN_SECONDS });
}

export function cookieOptions() {
  const isProd = process.env.NODE_ENV === "production";
  return {
    httpOnly: true,
    secure: isProd,
    sameSite: "strict" as const,
    maxAge: 7 * 24 * 60 * 60 * 1000,
    path: "/",
  };
}

export function isSupporter(plan: string, expiresAt: Date | null): boolean {
  if (plan !== "supporter") return false;
  if (!expiresAt) return false;
  return expiresAt > new Date();
}
