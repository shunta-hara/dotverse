// 仕様: Socket.IO は接続時に JWT を検証し、失敗したら接続を拒否する（socket-events.md）。
// 別オリジン構成（Vercel + Render）では Cookie が届かないため、handshake.auth.token でも認証できる。
// auth.token は 60 秒の短命トークン（POST /auth/socket-token が発行）。
import jwt from "jsonwebtoken";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SOCKET_TOKEN_EXPIRES_IN_SECONDS, signSocketToken, signToken } from "../../services/authService";
import { authenticateHandshake, extractToken } from "../authenticate";

const payload = { sub: "user-1", username: "alice", isSupporter: true };

beforeEach(() => {
  process.env.JWT_SECRET = "test-secret";
});

afterEach(() => {
  vi.useRealTimers();
});

describe("signSocketToken", () => {
  it("有効期限は発行から60秒", () => {
    const decoded = jwt.verify(signSocketToken(payload), "test-secret") as jwt.JwtPayload;
    expect(SOCKET_TOKEN_EXPIRES_IN_SECONDS).toBe(60);
    expect(decoded.exp! - decoded.iat!).toBe(60);
  });

  it("ユーザー情報を保持する", () => {
    expect(jwt.verify(signSocketToken(payload), "test-secret")).toMatchObject(payload);
  });

  it("61秒後には検証に失敗する", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-01-01T00:00:00Z"));
    const token = signSocketToken(payload);
    vi.advanceTimersByTime(61_000);
    expect(() => jwt.verify(token, "test-secret")).toThrow();
  });
});

describe("authenticateHandshake", () => {
  it("auth.token の有効なトークンで認証できる", () => {
    const token = signSocketToken(payload);
    expect(authenticateHandshake({ headers: {}, auth: { token } })).toMatchObject(payload);
  });

  it("auth.token が無ければ Cookie（同一オリジン・ローカル開発）で認証できる", () => {
    const token = signToken(payload);
    const result = authenticateHandshake({
      headers: { cookie: `other=1; dotverse_token=${token}; x=2` },
      auth: {},
    });
    expect(result).toMatchObject(payload);
  });

  it("auth.token と Cookie の両方があれば auth.token を使う", () => {
    const authToken = signSocketToken({ ...payload, sub: "from-auth" });
    const cookieToken = signToken({ ...payload, sub: "from-cookie" });
    const result = authenticateHandshake({
      headers: { cookie: `dotverse_token=${cookieToken}` },
      auth: { token: authToken },
    });
    expect(result.sub).toBe("from-auth");
  });

  it("どちらも無ければ UNAUTHORIZED", () => {
    expect(() => authenticateHandshake({ headers: {}, auth: {} })).toThrow("UNAUTHORIZED");
  });

  it("期限切れトークンは UNAUTHORIZED", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-01-01T00:00:00Z"));
    const token = signSocketToken(payload);
    vi.advanceTimersByTime(61_000);
    expect(() => authenticateHandshake({ headers: {}, auth: { token } })).toThrow("UNAUTHORIZED");
  });

  it("別の秘密鍵で署名されたトークンは UNAUTHORIZED", () => {
    const forged = jwt.sign(payload, "attacker-secret", { expiresIn: 60 });
    expect(() => authenticateHandshake({ headers: {}, auth: { token: forged } })).toThrow("UNAUTHORIZED");
  });

  it("署名なし (alg=none) のトークンは UNAUTHORIZED", () => {
    const none = jwt.sign(payload, "", { algorithm: "none" });
    expect(() => authenticateHandshake({ headers: {}, auth: { token: none } })).toThrow("UNAUTHORIZED");
  });

  it("不正な auth.token は Cookie が有効でも通さない（フォールバックで迂回させない）", () => {
    const cookieToken = signToken(payload);
    expect(() =>
      authenticateHandshake({
        headers: { cookie: `dotverse_token=${cookieToken}` },
        auth: { token: "garbage" },
      })
    ).toThrow("UNAUTHORIZED");
  });

  it.each([
    ["数値", 123],
    ["配列", ["a"]],
    ["object", {}],
    ["null", null],
  ])("auth.token が %s でも例外は UNAUTHORIZED に正規化される", (_name, bad) => {
    expect(() => authenticateHandshake({ headers: {}, auth: { token: bad } })).toThrow("UNAUTHORIZED");
  });

  it.each([
    ["undefined", undefined],
    ["null", null],
    ["文字列", "token"],
  ])("handshake.auth 自体が %s でも落ちず UNAUTHORIZED になる", (_name, auth) => {
    expect(() => authenticateHandshake({ headers: {}, auth })).toThrow("UNAUTHORIZED");
  });
});

describe("extractToken", () => {
  it("空文字の auth.token は無いものとして扱う", () => {
    expect(extractToken({ headers: { cookie: "dotverse_token=abc" }, auth: { token: "" } })).toBe("abc");
  });
});
