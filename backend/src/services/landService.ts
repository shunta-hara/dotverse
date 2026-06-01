import { Prisma } from "@prisma/client";
import { LAND_CELL_SIZE } from "../../../shared/constants";
import type { LandSummary } from "../../../shared/types/socket";
import { prisma } from "../db/client";

export async function getLandsInArea(
  xPx: number,
  yPx: number,
  radiusPx: number
): Promise<LandSummary[]> {
  const xMasu = Math.floor(xPx / LAND_CELL_SIZE);
  const yMasu = Math.floor(yPx / LAND_CELL_SIZE);
  const radiusMasu = Math.ceil(radiusPx / LAND_CELL_SIZE);

  const lands = await prisma.land.findMany({
    where: {
      deletedAt: null,
      x: { gte: xMasu - radiusMasu, lte: xMasu + radiusMasu },
      y: { gte: yMasu - radiusMasu, lte: yMasu + radiusMasu },
    },
    include: { owner: true },
  });

  return lands.map((l) => ({
    id: l.id,
    ownerId: l.ownerId,
    ownerUsername: l.owner.username,
    name: l.name,
    description: l.description,
    x: l.x,
    y: l.y,
    width: l.width,
    height: l.height,
    xPx: l.x * LAND_CELL_SIZE,
    yPx: l.y * LAND_CELL_SIZE,
  }));
}

export async function checkLandOverlapRaw(
  tx: Prisma.TransactionClient,
  x: number,
  y: number,
  width: number,
  height: number
): Promise<boolean> {
  const rows = await tx.$queryRaw<{ id: string }[]>`
    SELECT id FROM lands
    WHERE deleted_at IS NULL
      AND x < ${x + width}
      AND x + width > ${x}
      AND y < ${y + height}
      AND y + height > ${y}
    FOR UPDATE
  `;
  return rows.length > 0;
}
