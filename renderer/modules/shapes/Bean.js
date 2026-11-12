import { ShapeBase, DEFLECTION, dedupePoints } from './ShapeBase.js';

/**
 * Forme haricot — contour extérieur issu du path SVG redessiné.
 * Seul le premier sous-chemin (avant le premier z) est utilisé.
 * Pas de transform de groupe : coordonnées SVG directes.
 * Longueur → axe X, largeur → axe Y (comme les autres formes).
 */

const _SVG_PATH = 'm 375.96515,180.47179 c 3.48579,-121.716104 -155.37889,-124.924843 -166.323,-25.458 -7.98258,72.55066 -68.77339,34.20319 -107.94,84.529 -42.043058,54.02433 -6.455221,135.98513 76.08,135.992 97.59674,-2.17285 195.62948,-105.89436 198.183,-195.063 z';

/** Courbes de Bézier cubiques du premier sous-chemin : [[P0, P1, P2, P3], …] (coordonnées absolues). */
function _parseCubics(d) {
  const tokens = d.match(/-?(?:\d+\.?\d*|\d*\.\d+)(?:[eE][+-]?\d+)?|[a-zA-Z]/g) || [];
  const cubics = [];
  let i = 0, cx = 0, cy = 0;

  const num   = () => Number.parseFloat(tokens[i++]);
  const isNum = () => i < tokens.length && !/^[a-zA-Z]$/.test(tokens[i]);

  while (i < tokens.length) {
    const cmd = tokens[i++];
    if (cmd === 'z' || cmd === 'Z') break;
    switch (cmd) {
      case 'm': cx += num(); cy += num(); break;
      case 'M': cx  = num(); cy  = num(); break;
      case 'c':
        while (isNum()) {
          const p1 = { x: cx + num(), y: cy + num() };
          const p2 = { x: cx + num(), y: cy + num() };
          const p3 = { x: cx + num(), y: cy + num() };
          cubics.push([{ x: cx, y: cy }, p1, p2, p3]);
          cx = p3.x; cy = p3.y;
        }
        break;
    }
  }
  return cubics;
}

const _bez = ([a, b, c, d], t) => {
  const v = 1 - t;
  return { x: v*v*v*a.x + 3*v*v*t*b.x + 3*v*t*t*c.x + t*t*t*d.x,
           y: v*v*v*a.y + 3*v*v*t*b.y + 3*v*t*t*c.y + t*t*t*d.y };
};

// Pré-calcul au chargement du module : courbes normalisées sur [0,1]×[0,1] (emprise exacte,
// mesurée sur un échantillonnage dense), sens inversé pour CCW (SVG Y-down → CW natif)
const _rawCubics = _parseCubics(_SVG_PATH);
const _dense = _rawCubics.flatMap(c => Array.from({ length: 400 }, (_, k) => _bez(c, k / 400)));
const _minX = Math.min(..._dense.map(p => p.x)), _maxX = Math.max(..._dense.map(p => p.x));
const _minY = Math.min(..._dense.map(p => p.y)), _maxY = Math.max(..._dense.map(p => p.y));
const _W = _maxX - _minX, _H = _maxY - _minY;
const _CUBICS = _rawCubics
  .map(c => c.map(p => ({ x: (p.x - _minX) / _W, y: (p.y - _minY) / _H })).reverse())
  .reverse();

export class Bean extends ShapeBase {
  defaultParams() {
    // Proportions naturelles du dessin
    return { length: 150, width: Math.round(150 * _H / _W) };
  }

  getParamDescriptors() {
    return [
      { id: 'length', label: 'param.length',         min: 20, max: 2000, step: 1, unit: 'mm' },
      { id: 'width',  label: 'param.width',          min: 20, max: 2000, step: 1, unit: 'mm' },
      { id: 'ratio',  label: 'param.ratio_larg_long', type: 'ratio', warnMin: 0.5, warnMax: 1.5 },
    ];
  }

  getContourPoints() {
    const L = this.params.length, W = this.params.width;
    const pts = [];
    for (const c of _CUBICS) {
      const q = c.map(p => ({ x: p.x * L, y: p.y * W }));
      // Nombre de segments tel que l'écart courbe / corde reste ≤ DEFLECTION :
      // écart ≤ max|B''| / (8 n²), avec max|B''| ≤ 6 · max(|P0 − 2P1 + P2|, |P1 − 2P2 + P3|)
      const d2 = (a, b, e) => Math.hypot(a.x - 2 * b.x + e.x, a.y - 2 * b.y + e.y);
      const m  = 6 * Math.max(d2(q[0], q[1], q[2]), d2(q[1], q[2], q[3]));
      const n  = Math.max(4, Math.ceil(Math.sqrt(m / (8 * DEFLECTION))));
      for (let s = 0; s < n; s++) pts.push(_bez(q, s / n));
    }
    const clean = dedupePoints(pts);
    // Départ au point le plus à gauche (comme avant)
    const k = clean.reduce((best, p, i) => p.x < clean[best].x ? i : best, 0);
    return [...clean.slice(k), ...clean.slice(0, k)];
  }
}
