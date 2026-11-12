/**
 * StockSim.js — Simulation d'enlèvement de matière par grille de hauteurs.
 *
 * Le brut est une grille régulière (pas `cell` mm). Chaque case garde deux hauteurs : le
 * dessus de la matière (`heights`, abaissé par les usinages de la face 1) et le dessous
 * (`floors`, relevé par ceux de la face 2, pièce retournée). La case est vide quand
 * floors ≥ heights. La fraise (droite, rayon r) agit sur les cases sous son disque à
 * chaque point de son trajet. La simulation avance dans le temps du programme : avancer est
 * incrémental ; revenir en arrière recalcule depuis le début.
 */

import { pointOnMove, toStockFrame } from './GCodeProgram.js';

export class StockSim {
  /**
   * @param {object} o
   * @param {number} o.x0, o.y0, o.x1, o.y1  emprise du brut (coordonnées machine, mm)
   * @param {number} o.top, o.bottom         Z du dessus et du dessous du brut
   * @param {number} o.cell                  pas de la grille (mm)
   * @param {number} o.toolRadius            rayon de la fraise (mm)
   * @param {object[]} o.moves               mouvements datés (GCodeProgram.parseProgram)
   * @param {object}   [o.flip]              retournement face 2 (parseProgram().flip)
   */
  constructor({ x0, y0, x1, y1, top, bottom, cell, toolRadius, moves, flip = null }) {
    this.flip = flip;
    this.cell = cell;
    this.nx = Math.max(2, Math.round((x1 - x0) / cell) + 1);
    this.ny = Math.max(2, Math.round((y1 - y0) / cell) + 1);
    this.x0 = x0; this.y0 = y0;
    this.x1 = x0 + (this.nx - 1) * cell;
    this.y1 = y0 + (this.ny - 1) * cell;
    this.top = top; this.bottom = bottom;
    this.moves = moves;
    this.heights = new Float32Array(this.nx * this.ny);
    this.floors  = new Float32Array(this.nx * this.ny);

    this.rc = toolRadius / cell;   // rayon de la fraise en cases
    this.step = cell * 0.7;        // pas d'échantillonnage du trajet
    this.reset();
  }

  reset() {
    this.heights.fill(this.top);
    this.floors.fill(this.bottom);
    this.idx = 0;           // mouvement en cours
    this.u = 0;             // fraction déjà simulée de ce mouvement
    this.time = 0;
    this.version = (this.version ?? 0) + 1;
  }

  /**
   * Abaisse la matière sous le disque de la fraise centré en (x, y), bout à z.
   * Chaque case est testée par la distance exacte de son centre au centre réel de la
   * fraise (pas d'arrondi du centre à la case la plus proche).
   */
  _stamp(x, y, z) {
    if (z >= this.top) return;
    this._disk(x, y, this.heights, z, true);
  }

  /** Face 2 (pièce retournée) : relève le dessous de la matière jusqu'à hb (repère du brut). */
  _stampUnder(x, y, hb) {
    if (hb <= this.bottom) return;
    this._disk(x, y, this.floors, hb, false);
  }

  /**
   * Cases de arr sous le disque de la fraise centré en (x, y) : abaissées à v (lower) ou
   * relevées à v (sinon).
   */
  _disk(x, y, arr, v, lower) {
    const fx = (x - this.x0) / this.cell, fy = (y - this.y0) / this.cell;
    const { nx, ny, rc } = this;
    const j0 = Math.max(0, Math.ceil(fy - rc)), j1 = Math.min(ny - 1, Math.floor(fy + rc));
    for (let j = j0; j <= j1; j++) {
      const dy = j - fy;
      const span = Math.sqrt(Math.max(0, rc * rc - dy * dy));
      const i0 = Math.max(0, Math.ceil(fx - span)), i1 = Math.min(nx - 1, Math.floor(fx + span));
      const row = j * nx;
      if (lower) { for (let i = i0; i <= i1; i++) if (arr[row + i] > v) arr[row + i] = v; }
      else       { for (let i = i0; i <= i1; i++) if (arr[row + i] < v) arr[row + i] = v; }
    }
  }

  /** Simule la portion [ua, ub] du mouvement mv. */
  _cut(mv, ua, ub) {
    if (Math.min(mv.z0, mv.z) >= this.top || mv.type === 'dwell') return;
    const len = mv.len * (ub - ua);
    const n = Math.max(1, Math.ceil(len / this.step));
    const under = mv.face === 2 && this.flip;
    for (let k = 0; k <= n; k++) {
      const p = pointOnMove(mv, ua + (ub - ua) * k / n);
      if (!under) { this._stamp(p.x, p.y, p.z); continue; }
      if (p.z >= this.top) continue;
      const q = toStockFrame(p, 2, this.flip, this.top, this.bottom);
      this._stampUnder(q.x, q.y, q.z);
    }
  }

  /** Avance (ou recule) la simulation jusqu'au temps t ; renvoie la position de l'outil. */
  seek(t) {
    if (t < this.time - 1e-9) this.reset();
    const moves = this.moves;
    while (this.idx < moves.length) {
      const mv = moves[this.idx];
      if (mv.t0 > t) break;
      const dur = mv.t1 - mv.t0;
      const uEnd = dur > 0 ? Math.min(1, (t - mv.t0) / dur) : 1;
      if (uEnd > this.u || dur === 0) this._cut(mv, this.u, uEnd);
      if (uEnd < 1) { this.u = uEnd; break; }
      this.idx++; this.u = 0;
    }
    this.time = t;
    this.version++;
    return this.toolPosition();
  }

  toolPosition() {
    const moves = this.moves;
    if (!moves.length) return null;
    if (this.idx >= moves.length) { const m = moves[moves.length - 1]; return { x: m.x, y: m.y, z: m.z }; }
    return pointOnMove(moves[this.idx], this.u);
  }

}

/** Pas de grille pour une emprise donnée et une résolution ('fast' | 'standard' | 'fine'). */
export function cellFor(width, height, resolution = 'standard') {
  const target = { fast: 150000, standard: 450000, fine: 1200000 }[resolution] ?? 450000;
  const minCell = { fast: 0.5, standard: 0.25, fine: 0.15 }[resolution] ?? 0.25;
  return Math.max(minCell, Math.sqrt((width * height) / target));
}
