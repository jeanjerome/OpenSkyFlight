/**
 * Entities of the simulation (aircraft, missiles, targets…), stepped together
 * and indexed by position for neighbourhood queries.
 *
 * An entity has a `position` ({x, y, z}, world metres) and may have a
 * `fixedUpdate(step, registry)` run at every simulation step and a `removed`
 * flag that takes it out of the registry at the end of the step. The grid is
 * rebuilt after every step: a query sees the positions of the last step.
 */
export default class EntityRegistry {
  /** @param {number} cellSize - side of a grid cell (m), about the usual query radius */
  constructor(cellSize) {
    this.cellSize = cellSize;
    /** @type {object[]} */
    this.entities = [];
    /** Cell key → entities in the cell; emptied cells are kept for reuse */
    this._cells = new Map();
    this._nextId = 1;
  }

  /** @returns {object} the entity, given an `id` if it had none */
  add(entity) {
    if (entity.id === undefined) entity.id = this._nextId++;
    this.entities.push(entity);
    this._insert(entity);
    return entity;
  }

  remove(entity) {
    entity.removed = true;
    this._compact();
    this._reindex();
  }

  /** Advance every entity by one step, drop the removed ones and reindex */
  fixedUpdate(step) {
    const { entities } = this;
    for (let i = 0; i < entities.length; i++) entities[i].fixedUpdate?.(step, this);
    this._compact();
    this._reindex();
  }

  /**
   * Entities within a distance of a point.
   * @param {{x: number, y: number, z: number}} point
   * @param {number} radius - m
   * @param {object[]} [out] - emptied and filled
   * @param {object} [exclude] - entity left out (the one asking)
   * @returns {object[]}
   */
  queryRadius(point, radius, out = [], exclude = null) {
    out.length = 0;
    const r2 = radius * radius;
    const x0 = this._cell(point.x - radius);
    const x1 = this._cell(point.x + radius);
    const z0 = this._cell(point.z - radius);
    const z1 = this._cell(point.z + radius);
    for (let cx = x0; cx <= x1; cx++) {
      for (let cz = z0; cz <= z1; cz++) {
        const cell = this._cells.get(key(cx, cz));
        if (!cell) continue;
        for (let i = 0; i < cell.length; i++) {
          const e = cell[i];
          if (e === exclude) continue;
          const dx = e.position.x - point.x;
          const dy = e.position.y - point.y;
          const dz = e.position.z - point.z;
          if (dx * dx + dy * dy + dz * dz <= r2) out.push(e);
        }
      }
    }
    return out;
  }

  _cell(coordinate) {
    return Math.floor(coordinate / this.cellSize);
  }

  _insert(entity) {
    const k = key(this._cell(entity.position.x), this._cell(entity.position.z));
    let cell = this._cells.get(k);
    if (!cell) this._cells.set(k, (cell = []));
    cell.push(entity);
  }

  _compact() {
    const { entities } = this;
    let n = 0;
    for (let i = 0; i < entities.length; i++) if (!entities[i].removed) entities[n++] = entities[i];
    entities.length = n;
  }

  _reindex() {
    for (const cell of this._cells.values()) cell.length = 0;
    for (let i = 0; i < this.entities.length; i++) this._insert(this.entities[i]);
  }
}

/** Numeric key of a cell, for cells within ±2^20 of the origin (±2 000 km at 2 km per cell) */
function key(cx, cz) {
  return (cx + 1048576) * 2097152 + (cz + 1048576);
}
