import { Router } from "express";
import rateLimit from "express-rate-limit";
import { z } from "zod";
import { prisma } from "../db/client";
import { requireAuth } from "../middleware/auth";
import { isSupporter } from "../services/authService";
import { getIo } from "../socket";
import { world } from "../world/inMemoryWorld";
import { FREE_SIGN_LIMIT, LAND_CELL_SIZE, SUPPORTER_SIGN_LIMIT, SYNC_RADIUS } from "../../../shared/constants";

const router = Router();
const createLimit = rateLimit({ windowMs: 60 * 1000, max: 10 });

const createSchema = z.object({
  landId: z.string().uuid(),
  x: z.number().int().min(0).max(199),
  y: z.number().int().min(0).max(199),
  title: z.string().min(1).max(100),
  content: z.string().max(500).optional().default(""),
});

router.get("/", async (req, res) => {
  const xPx = Number(req.query.x ?? 5000);
  const yPx = Number(req.query.y ?? 5000);
  const radiusPx = Number(req.query.radius ?? 1000);

  const xMasu = Math.floor(xPx / LAND_CELL_SIZE);
  const yMasu = Math.floor(yPx / LAND_CELL_SIZE);
  const radiusMasu = Math.ceil(radiusPx / LAND_CELL_SIZE);

  const signs = await prisma.sign.findMany({
    where: {
      deletedAt: null,
      x: { gte: xMasu - radiusMasu, lte: xMasu + radiusMasu },
      y: { gte: yMasu - radiusMasu, lte: yMasu + radiusMasu },
    },
    include: { owner: true },
  });

  res.json({
    signs: signs.map((s) => ({
      id: s.id,
      ownerId: s.ownerId,
      ownerUsername: s.owner.username,
      x: s.x,
      y: s.y,
      xPx: s.x * LAND_CELL_SIZE,
      yPx: s.y * LAND_CELL_SIZE,
      title: s.title,
      content: s.content,
      createdAt: s.createdAt.toISOString(),
    })),
  });
});

router.post("/", requireAuth, createLimit, async (req, res) => {
  const parsed = createSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "VALIDATION_ERROR", message: parsed.error.errors[0].message });
    return;
  }

  const userId = req.user!.sub;
  const user = await prisma.user.findUnique({
    where: { id: userId },
    include: { subscription: true },
  });
  if (!user) {
    res.status(404).json({ error: "NOT_FOUND", message: "ユーザーが見つかりません" });
    return;
  }

  const supporterActive = user.subscription
    ? isSupporter(user.subscription.plan, user.subscription.expiresAt)
    : false;
  const signLimit = supporterActive ? SUPPORTER_SIGN_LIMIT : FREE_SIGN_LIMIT;

  const land = await prisma.land.findFirst({
    where: { id: parsed.data.landId, ownerId: userId, deletedAt: null },
  });
  if (!land) {
    res.status(403).json({ error: "FORBIDDEN", message: "指定された土地はあなたの所有地ではありません" });
    return;
  }

  const { x, y } = parsed.data;
  if (x < land.x || x >= land.x + land.width || y < land.y || y >= land.y + land.height) {
    res.status(400).json({ error: "VALIDATION_ERROR", message: "看板の座標が土地の範囲外です" });
    return;
  }

  const sign = await prisma.$transaction(async (tx) => {
    const count = await tx.sign.count({ where: { ownerId: userId, deletedAt: null } });
    if (count >= signLimit) {
      throw Object.assign(new Error("LIMIT_EXCEEDED"), { statusCode: 409 });
    }
    return tx.sign.create({
      data: {
        ownerId: userId,
        landId: land.id,
        x,
        y,
        title: parsed.data.title,
        content: parsed.data.content,
      },
    });
  });

  const signSummary = {
    id: sign.id,
    ownerId: sign.ownerId,
    x: sign.x,
    y: sign.y,
    xPx: sign.x * LAND_CELL_SIZE,
    yPx: sign.y * LAND_CELL_SIZE,
    title: sign.title,
    content: sign.content,
  };

  const io = getIo();
  if (io) {
    const cx = sign.x * LAND_CELL_SIZE;
    const cy = sign.y * LAND_CELL_SIZE;
    for (const neighbor of world.getNeighborsByPos(cx, cy, SYNC_RADIUS, "")) {
      io.to(neighbor.socketId).emit("sign:created", signSummary);
    }
  }

  res.status(201).json({ sign: signSummary });
});

router.delete("/:id", requireAuth, async (req, res) => {
  const sign = await prisma.sign.findFirst({
    where: { id: String(req.params.id), deletedAt: null },
  });
  if (!sign) {
    res.status(404).json({ error: "NOT_FOUND", message: "看板が見つかりません" });
    return;
  }
  if (sign.ownerId !== req.user!.sub) {
    res.status(403).json({ error: "FORBIDDEN", message: "この看板を削除する権限がありません" });
    return;
  }

  await prisma.sign.update({ where: { id: sign.id }, data: { deletedAt: new Date() } });

  const io = getIo();
  if (io) {
    const cx = sign.x * LAND_CELL_SIZE;
    const cy = sign.y * LAND_CELL_SIZE;
    for (const neighbor of world.getNeighborsByPos(cx, cy, SYNC_RADIUS, "")) {
      io.to(neighbor.socketId).emit("sign:deleted", { id: sign.id });
    }
  }

  res.status(204).send();
});

export default router;
