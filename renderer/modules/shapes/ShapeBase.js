/**
 * Classe de base pour toutes les formes.
 * Chaque forme doit implémenter getParams(), getContourPoints(), et getSVGPath().
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

  /**
   * Retourne le chemin SVG (attribut d)
   */
  getSVGPath() {
    const pts = this.getContourPoints();
    if (!pts.length) return '';
    return pts.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x.toFixed(3)},${p.y.toFixed(3)}`).join(' ') + ' Z';
  }

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

  /** Périmètre approximatif en mm */
  getPerimeter() {
    const pts = this.getContourPoints();
    let perim = 0;
    for (let i = 0; i < pts.length; i++) {
      const a = pts[i], b = pts[(i + 1) % pts.length];
      perim += Math.hypot(b.x - a.x, b.y - a.y);
    }
    return perim;
  }

  updateParam(id, value) {
    this.params[id] = parseFloat(value);
  }

  /**
   * Arrondit les sommets d'un polygone convexe avec un rayon r.
   * Pour chaque sommet, calcule les points tangents et génère un arc.
   * @param {{x,y}[]} pts  - sommets du polygone
   * @param {number}  r    - rayon de coin souhaité (mm)
   * @param {number}  segs - nb de segments par arc
   * @returns {{x,y}[]}
   */
  _roundedPolygon(pts, r, segs = 6) {
    const n = pts.length;
    const result = [];
    for (let i = 0; i < n; i++) {
      const prev = pts[(i - 1 + n) % n];
      const curr = pts[i];
      const next = pts[(i + 1) % n];

      // Vecteurs unitaires depuis curr vers les voisins
      const e1x = prev.x - curr.x, e1y = prev.y - curr.y;
      const l1 = Math.hypot(e1x, e1y) || 1;
      const e2x = next.x - curr.x, e2y = next.y - curr.y;
      const l2 = Math.hypot(e2x, e2y) || 1;

      // Angle intérieur au sommet
      const dot  = Math.max(-1, Math.min(1, (e1x * e2x + e1y * e2y) / (l1 * l2)));
      const phi  = Math.acos(dot);
      if (phi < 1e-6 || Math.PI - phi < 1e-6) { result.push(curr); continue; }
      const halfPhi = phi / 2;

      // Distance tangente depuis le sommet (clampée à la moitié de chaque arête)
      const t  = Math.min(r / Math.tan(halfPhi), l1 / 2, l2 / 2);
      const rc = t * Math.tan(halfPhi);  // rayon réel (peut être < r si clampé)

      const T1 = { x: curr.x + (e1x / l1) * t, y: curr.y + (e1y / l1) * t };
      const T2 = { x: curr.x + (e2x / l2) * t, y: curr.y + (e2y / l2) * t };

      // Centre de l'arc (sur la bissectrice, à l'intérieur du polygone)
      const bx = e1x / l1 + e2x / l2, by = e1y / l1 + e2y / l2;
      const bl = Math.hypot(bx, by) || 1;
      const C  = { x: curr.x + (bx / bl) * (rc / Math.sin(halfPhi)),
                   y: curr.y + (by / bl) * (rc / Math.sin(halfPhi)) };

      // Arc du plus court chemin de T1 à T2
      const a1 = Math.atan2(T1.y - C.y, T1.x - C.x);
      let   dA = Math.atan2(T2.y - C.y, T2.x - C.x) - a1;
      if (dA >  Math.PI) dA -= 2 * Math.PI;
      if (dA < -Math.PI) dA += 2 * Math.PI;

      for (let j = 0; j <= segs; j++) {
        const a = a1 + dA * (j / segs);
        result.push({ x: C.x + rc * Math.cos(a), y: C.y + rc * Math.sin(a) });
      }
    }
    return result;
  }
}
