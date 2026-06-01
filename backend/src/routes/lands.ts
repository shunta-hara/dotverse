import { Router } from "express";
import rateLimit from "express-rate-limit";
import { z } from "zod";
import { prisma } from "../db/client";
import { requireAuth } from "../middleware/auth";
import { isSupporter } from "../services/authService";
import { checkLandOverlapRaw, getLandsInArea } from "../services/landService";
import { getIo } from "../socket";
import { world } from "../world/inMemoryWorld";
import {
  FREE_LAND_LIMIT,
  LAND_CELL_SIZE,
  LAND_SIZE_MASU,
  SUPPORTER_LAND_LIMIT,
  SYNC_RADIUS,
} from "../../../shared/constants";

const router = Router();
const createLimit = rateLimit({ windowMs: 60 * 1000, max: 10 });

const createSchema = z.object({
  x: z.number().int().min(0).max(200 - LAND_SIZE_MASU),
  y: z.number().int().min(0).max(200 - LAND_SIZE_MASU),
  name: z.string().min(1).max(100),
  description: z.string().max(500).optional().default(""),
});

const updateSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  description: z.string().max(500).optional(),
});

router.get("/", async (req, res) => {
  const x = Number(req.query.x ?? 5000);
  const y = Number(req.query.y ?? 5000);
  const radius = Number(req.query.radius ?? 1000);
  const lands = await getLandsInArea(x, y, radius);
  res.json({ lands });
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
  const limit = supporterActive ? SUPPORTER_LAND_LIMIT : FREE_LAND_LIMIT;

  const { x, y, name, description } = parsed.data;
  const width = LAND_SIZE_MASU;
  const height = LAND_SIZE_MASU;

  const land = await prisma.$transaction(async (tx) => {
    const count = await tx.land.count({ where: { ownerId: userId, deletedAt: null } });
    if (count >= limit) {
      throw Object.assign(new Error("LIMIT_EXCEEDED"), { statusCode: 409 });
    }

    const hasOverlap = await checkLandOverlapRaw(tx, x, y, width, height);
    if (hasOverlap) {
      throw Object.assign(new Error("LAND_OVERLAP"), { statusCode: 409 });
    }

    return tx.land.create({ data: { ownerId: userId, x, y, width, height, name, description } });
  });

  const landSummary = {
    id: land.id,
    ownerId: land.ownerId,
    ownerUsername: user.username,
    name: land.name,
    description: land.description,
    x: land.x,
    y: land.y,
    width: land.width,
    height: land.height,
    xPx: land.x * LAND_CELL_SIZE,
    yPx: land.y * LAND_CELL_SIZE,
  };

  const io = getIo();
  if (io) {
    const cx = (land.x + land.width / 2) * LAND_CELL_SIZE;
    const cy = (land.y + land.height / 2) * LAND_CELL_SIZE;
    for (const neighbor of world.getNeighborsByPos(cx, cy, SYNC_RADIUS, "")) {
      io.to(neighbor.socketId).emit("land:created", landSummary);
    }
  }

  res.status(201).json({ land: landSummary });
});

router.patch("/:id", requireAuth, async (req, res) => {
  const land = await prisma.land.findFirst({
    where: { id: String(req.params.id), deletedAt: null },
  });
  if (!land) {
    res.status(404).json({ error: "NOT_FOUND", message: "土地が見つかりません" });
    return;
  }
  if (land.ownerId !== req.user!.sub) {
    res.status(403).json({ error: "FORBIDDEN", message: "この土地を編集する権限がありません" });
    return;
  }

  const parsed = updateSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "VALIDATION_ERROR", message: parsed.error.errors[0].message });
    return;
  }

  const updated = await prisma.land.update({
    where: { id: land.id },
    data: parsed.data,
  });

  res.json({ land: { id: updated.id, name: updated.name, description: updated.description } });
});

router.delete("/:id", requireAuth, async (req, res) => {
  const land = await prisma.land.findFirst({
    where: { id: String(req.params.id), deletedAt: null },
  });
  if (!land) {
    res.status(404).json({ error: "NOT_FOUND", message: "土地が見つかりません" });
    return;
  }
  if (land.ownerId !== req.user!.sub) {
    res.status(403).json({ error: "FORBIDDEN", message: "この土地を削除する権限がありません" });
    return;
  }

  await prisma.land.update({ where: { id: land.id }, data: { deletedAt: new Date() } });

  const io = getIo();
  if (io) {
    const cx = (land.x + land.width / 2) * LAND_CELL_SIZE;
    const cy = (land.y + land.height / 2) * LAND_CELL_SIZE;
    for (const neighbor of world.getNeighborsByPos(cx, cy, SYNC_RADIUS, "")) {
      io.to(neighbor.socketId).emit("land:deleted", { id: land.id });
    }
  }

  res.status(204).send();
});

export default router;
