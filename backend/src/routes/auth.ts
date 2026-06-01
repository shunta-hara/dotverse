import { Router } from "express";
import rateLimit from "express-rate-limit";
import { z } from "zod";
import { prisma } from "../db/client";
import {
  cookieOptions,
  hashPassword,
  isSupporter,
  signToken,
  verifyPassword,
} from "../services/authService";
import { getSizeLevel } from "../../../shared/constants";
import { requireAuth } from "../middleware/auth";
import { containsNgWord } from "../utils/ngWordFilter";

const router = Router();

const registerLimit = rateLimit({ windowMs: 60 * 60 * 1000, max: 5 });
const loginLimit = rateLimit({ windowMs: 60 * 1000, max: 10 });
const forgotLimit = rateLimit({ windowMs: 60 * 60 * 1000, max: 3 });

const registerSchema = z.object({
  username: z
    .string()
    .min(2, "2文字以上で入力してください")
    .max(20, "20文字以内で入力してください")
    .regex(/^[\w぀-鿿゠-ヿ]+$/, "使用できない文字が含まれています"),
  email: z.string().email("メールアドレスの形式が正しくありません"),
  password: z.string().min(8, "パスワードは8文字以上で入力してください"),
});

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string(),
});

router.post("/register", registerLimit, async (req, res) => {
  const parsed = registerSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({
      error: "VALIDATION_ERROR",
      message: parsed.error.errors[0].message,
    });
    return;
  }

  const { username, email, password } = parsed.data;

  if (containsNgWord(username)) {
    res.status(400).json({ error: "VALIDATION_ERROR", message: "使用できないユーザー名です" });
    return;
  }

  const existing = await prisma.user.findFirst({
    where: { OR: [{ email: email.toLowerCase() }, { username }] },
  });
  if (existing) {
    const field = existing.email === email.toLowerCase() ? "メールアドレス" : "ユーザー名";
    res.status(409).json({ error: "CONFLICT", message: `この${field}はすでに使用されています` });
    return;
  }

  const passwordHash = await hashPassword(password);
  const user = await prisma.user.create({
    data: {
      username,
      email: email.toLowerCase(),
      passwordHash,
    },
  });

  const token = signToken({ sub: user.id, username: user.username, isSupporter: false });
  res.cookie("dotverse_token", token, cookieOptions());
  res.status(201).json({
    user: {
      id: user.id,
      username: user.username,
      email: user.email,
      speechCount: 0,
      sizeLevel: 1,
      profile: "",
      isSupporter: false,
      createdAt: user.createdAt.toISOString(),
    },
  });
});

router.post("/login", loginLimit, async (req, res) => {
  const parsed = loginSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "VALIDATION_ERROR", message: "入力値が正しくありません" });
    return;
  }

  const { email, password } = parsed.data;
  const user = await prisma.user.findUnique({
    where: { email: email.toLowerCase() },
    include: { subscription: true },
  });

  if (!user || !(await verifyPassword(password, user.passwordHash))) {
    res.status(401).json({
      error: "UNAUTHORIZED",
      message: "メールアドレスまたはパスワードが正しくありません",
    });
    return;
  }

  const supporterActive = user.subscription
    ? isSupporter(user.subscription.plan, user.subscription.expiresAt)
    : false;

  const token = signToken({
    sub: user.id,
    username: user.username,
    isSupporter: supporterActive,
  });
  res.cookie("dotverse_token", token, cookieOptions());
  res.status(200).json({
    user: {
      id: user.id,
      username: user.username,
      email: user.email,
      speechCount: user.speechCount,
      sizeLevel: getSizeLevel(user.speechCount),
      profile: user.profile,
      isSupporter: supporterActive,
      createdAt: user.createdAt.toISOString(),
      lastActiveAt: user.lastActiveAt.toISOString(),
    },
  });
});

router.post("/logout", (_req, res) => {
  res.cookie("dotverse_token", "", { ...cookieOptions(), maxAge: 0 });
  res.status(204).send();
});

router.get("/me", requireAuth, async (req, res) => {
  const user = await prisma.user.findUnique({
    where: { id: req.user!.sub },
    include: { subscription: true },
  });
  if (!user) {
    res.status(404).json({ error: "NOT_FOUND", message: "ユーザーが見つかりません" });
    return;
  }

  const supporterActive = user.subscription
    ? isSupporter(user.subscription.plan, user.subscription.expiresAt)
    : false;

  res.json({
    user: {
      id: user.id,
      username: user.username,
      email: user.email,
      speechCount: user.speechCount,
      sizeLevel: getSizeLevel(user.speechCount),
      profile: user.profile,
      isSupporter: supporterActive,
      createdAt: user.createdAt.toISOString(),
    },
  });
});

router.post("/forgot-password", forgotLimit, (_req, res) => {
  // MVP: スタブ実装（メール送信は後で実装）
  res.json({ message: "パスワードリセットのメールを送信しました（登録済みの場合）" });
});

export default router;
