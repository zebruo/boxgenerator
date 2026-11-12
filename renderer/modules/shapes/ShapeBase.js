/**
 * Classe de base pour toutes les formes.
 * Chaque forme implémente defaultParams(), getParamDescriptors() et getContourPoints().
 */
export class ShapeBase {
  constructor(params = {}) {
    this.params = { ...this.defaultParams(), ...params };
  }

  /** Paramètres par défaut de la forme */
  defaultParams() { return {}; }

  /** Descripteurs de paramètres pour l'UI: [{id, label, value, min, max, step, unit}] */
  getParamDescriptors() { return []; }

  /**
   * Retourne les points du contour 2D en mm
   * @returns {Array<{x, y}>}
   */
  getContourPoints() { return []; }

  /** Bounding box {minX, minY, maxX, maxY, width, height} */
  getBoundingBox() {
    const pts = this.getContourPoints();
    if (!pts.length) return { minX: 0, minY: 0, maxX: 0, maxY: 0, width: 0, height: 0 };
    const xs = pts.map(p => p.x);
    const ys = pts.map(p => p.y);
    const minX = Math.min(...xs), maxX = Math.max(...xs);
    const minY = Math.min(...ys), maxY = Math.max(...ys);
    return { minX, minY, maxX, maxY, width: maxX - minX, height: maxY - minY };
  }

  updateParam(id, value) {
    this.params[id] = parseFloat(value);
  }

  /**
   * Polygone convexe aux coins arrondis de rayon r, d'emprise EXACTE : le contour est le
   * polygone de base (CCW, éventuellement dégénéré en segment ou en point) agrandi de r avec
   * des raccords ronds. Chaque coin est un arc de rayon r exactement, tangent aux côtés, et
   * l'emprise vaut celle de la base + 2r dans chaque direction.
   * @param {{x,y}[]} base - sommets du polygone de base (CCW)
   * @param {number}  r    - rayon des coins (mm, > 0)
   * @returns {{x,y}[]}
   */
  _roundOutward(base, r) {
    const b = dedupePoints(base);
    if (b.length < 2) {                       // base réduite à un point : cercle
      const c = b[0] ?? { x: 0, y: 0 }, n = arcSegments(r, 2 * Math.PI, DEFLECTION, 32);
      return Array.from({ length: n }, (_, i) => {
        const a = -Math.PI / 2 + 2 * Math.PI * i / n;
        return { x: c.x + r * Math.cos(a), y: c.y + r * Math.sin(a) };
      });
    }
    // Direction (angle) de la normale extérieure du côté a → c (polygone CCW)
    const normal = (a, c) => Math.atan2(-(c.x - a.x), c.y - a.y);
    const n = b.length, out = [];
    for (let i = 0; i < n; i++) {
      const prev = b[(i - 1 + n) % n], v = b[i], next = b[(i + 1) % n];
      const a0 = normal(prev, v);
      let dA = normal(v, next) - a0;
      dA = Math.atan2(Math.sin(dA), Math.cos(dA));   // (−π, π]
      if (dA < -1e-9) dA += 2 * Math.PI;             // demi-tour d'une base dégénérée : +π
      const segs = dA > 1e-9 ? arcSegments(r, dA) : 0;
      for (let j = 0; j <= segs; j++) {
        const a = a0 + (segs ? dA * j / segs : 0);
        out.push({ x: v.x + r * Math.cos(a), y: v.y + r * Math.sin(a) });
      }
    }
    return dedupePoints(out);
  }
}

/** Écart maximal (mm) toléré entre une courbe et sa polyligne (même valeur pour toutes les formes). */
export const DEFLECTION = 0.01;

/** Nombre de segments pour qu'un arc de rayon r et d'ouverture sweep (rad) reste à ≤ tol de sa corde. */
export function arcSegments(r, sweep, tol = DEFLECTION, min = 1) {
  if (!(r > tol)) return Math.max(min, Math.ceil(Math.abs(sweep) / (Math.PI / 2)));
  const step = 2 * Math.acos(1 - tol / r);
  return Math.max(min, Math.ceil(Math.abs(sweep) / step));
}

/** Retire les points consécutifs confondus (y compris le dernier s'il répète le premier). */
export function dedupePoints(pts, eps = 1e-6) {
  const out = [];
  for (const p of pts) {
    const q = out[out.length - 1];
    if (!q || Math.hypot(p.x - q.x, p.y - q.y) > eps) out.push(p);
  }
  while (out.length > 1 && Math.hypot(out[0].x - out[out.length - 1].x, out[0].y - out[out.length - 1].y) <= eps) out.pop();
  return out;
}
