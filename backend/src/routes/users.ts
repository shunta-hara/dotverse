import { Router } from "express";
import { z } from "zod";
import { prisma } from "../db/client";
import { requireAuth } from "../middleware/auth";
import { isSupporter } from "../services/authService";
import { getSizeLevel, FREE_PROFILE_LIMIT, SUPPORTER_PROFILE_LIMIT } from "../../../shared/constants";

const router = Router();

router.get("/:username", async (req, res) => {
  const user = await prisma.user.findUnique({
    where: { username: req.params.username },
    include: {
      subscription: true,
      lands: {
        where: { deletedAt: null },
        select: { id: true, name: true },
      },
    },
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
      username: user.username,
      speechCount: user.speechCount,
      sizeLevel: getSizeLevel(user.speechCount),
      profile: user.profile,
      isSupporter: supporterActive,
      createdAt: user.createdAt.toISOString(),
      lastActiveAt: user.lastActiveAt.toISOString(),
      lands: user.lands,
    },
  });
});

router.patch("/me", requireAuth, async (req, res) => {
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
  const maxProfile = supporterActive ? SUPPORTER_PROFILE_LIMIT : FREE_PROFILE_LIMIT;

  const schema = z.object({
    profile: z.string().max(maxProfile, `プロフィールは${maxProfile}文字以内で入力してください`).optional(),
  });

  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "VALIDATION_ERROR", message: parsed.error.errors[0].message });
    return;
  }

  const updated = await prisma.user.update({
    where: { id: req.user!.sub },
    data: { profile: parsed.data.profile },
  });

  res.json({ user: { username: updated.username, profile: updated.profile, isSupporter: supporterActive } });
});

export default router;
