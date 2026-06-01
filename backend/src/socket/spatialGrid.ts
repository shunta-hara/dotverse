import { CELL_SIZE, GRID_SIZE } from "../../../shared/constants";

export class SpatialGrid {
  private cells = new Map<number, Set<string>>();
  private playerCell = new Map<string, number>();

  private cellId(cellX: number, cellY: number): number {
    return cellY * GRID_SIZE + cellX;
  }

  private toCellCoord(px: number): number {
    return Math.min(Math.floor(px / CELL_SIZE), GRID_SIZE - 1);
  }

  add(socketId: string, x: number, y: number): void {
    const cellX = this.toCellCoord(x);
    const cellY = this.toCellCoord(y);
    const id = this.cellId(cellX, cellY);

    if (!this.cells.has(id)) this.cells.set(id, new Set());
    this.cells.get(id)!.add(socketId);
    this.playerCell.set(socketId, id);
  }

  remove(socketId: string): void {
    const id = this.playerCell.get(socketId);
    if (id === undefined) return;
    this.cells.get(id)?.delete(socketId);
    this.playerCell.delete(socketId);
  }

  update(socketId: string, oldX: number, oldY: number, newX: number, newY: number): void {
    const oldCellX = this.toCellCoord(oldX);
    const oldCellY = this.toCellCoord(oldY);
    const newCellX = this.toCellCoord(newX);
    const newCellY = this.toCellCoord(newY);

    if (oldCellX === newCellX && oldCellY === newCellY) return;

    const oldId = this.cellId(oldCellX, oldCellY);
    const newId = this.cellId(newCellX, newCellY);

    this.cells.get(oldId)?.delete(socketId);
    if (!this.cells.has(newId)) this.cells.set(newId, new Set());
    this.cells.get(newId)!.add(socketId);
    this.playerCell.set(socketId, newId);
  }

  getNearbySockets(x: number, y: number, radius: number): Set<string> {
    const result = new Set<string>();
    const cellRadius = Math.ceil(radius / CELL_SIZE);
    const centerCellX = this.toCellCoord(x);
    const centerCellY = this.toCellCoord(y);

    for (let dy = -cellRadius; dy <= cellRadius; dy++) {
      for (let dx = -cellRadius; dx <= cellRadius; dx++) {
        const cx = Math.max(0, Math.min(GRID_SIZE - 1, centerCellX + dx));
        const cy = Math.max(0, Math.min(GRID_SIZE - 1, centerCellY + dy));
        const id = this.cellId(cx, cy);
        this.cells.get(id)?.forEach((sid) => result.add(sid));
      }
    }

    return result;
  }
}
