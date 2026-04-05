import { ShapeBase } from './ShapeBase.js';

/**
 * Forme haricot — contour extérieur issu du path SVG redessiné.
 * Seul le premier sous-chemin (avant le premier z) est utilisé.
 * Pas de transform de groupe : coordonnées SVG directes.
 */

const _SVG_PATH = 'm 375.96515,180.47179 c 3.48579,-121.716104 -155.37889,-124.924843 -166.323,-25.458 -7.98258,72.55066 -68.77339,34.20319 -107.94,84.529 -42.043058,54.02433 -6.455221,135.98513 76.08,135.992 97.59674,-2.17285 195.62948,-105.89436 198.183,-195.063 z';

function _parsePath(d, segs = 16) {
  const tokens = d.match(/-?(?:[0-9]+\.?[0-9]*|[0-9]*\.[0-9]+)(?:[eE][+-]?[0-9]+)?|[a-zA-Z]/g) || [];
  const pts = [];
  let i = 0, cx = 0, cy = 0;

  const num   = () => parseFloat(tokens[i++]);
  const isNum = () => i < tokens.length && !/^[a-zA-Z]$/.test(tokens[i]);

  while (i < tokens.length) {
    const cmd = tokens[i++];
    if (cmd === 'z' || cmd === 'Z') break;

    switch (cmd) {
      case 'm': cx += num(); cy += num(); pts.push({ x: cx, y: cy }); break;
      case 'M': cx  = num(); cy  = num(); pts.push({ x: cx, y: cy }); break;

      case 'c':
        while (isNum()) {
          const cp1x = cx + num(), cp1y = cy + num();
          const cp2x = cx + num(), cp2y = cy + num();
          const ex   = cx + num(), ey   = cy + num();
          for (let s = 1; s <= segs; s++) {
            const t = s / segs, v = 1 - t;
            pts.push({
              x: v*v*v*cx + 3*v*v*t*cp1x + 3*v*t*t*cp2x + t*t*t*ex,
              y: v*v*v*cy + 3*v*v*t*cp1y + 3*v*t*t*cp2y + t*t*t*ey,
            });
          }
          cx = ex; cy = ey;
        }
        break;
    }
  }
  return pts;
}

// Pré-calcul au chargement du module
const _raw  = _parsePath(_SVG_PATH);
const _xs   = _raw.map(p => p.x), _ys = _raw.map(p => p.y);
const _minX = Math.min(..._xs), _maxX = Math.max(..._xs);
const _minY = Math.min(..._ys), _maxY = Math.max(..._ys);
const _W = _maxX - _minX, _H = _maxY - _minY;
// Normalisé [0,1]×[0,1] indépendamment — inversé pour CCW (SVG Y-down → CW natif)
const _NORM_raw = _raw.map(p => ({ x: (p.x - _minX) / _W, y: (p.y - _minY) / _H })).reverse();
// Rotation du tableau pour démarrer au point le plus proche du coin avant-gauche (minX)
const _startIdx = _NORM_raw.reduce((best, p, i) => p.x < _NORM_raw[best].x ? i : best, 0);
const _NORM = [..._NORM_raw.slice(_startIdx), ..._NORM_raw.slice(0, _startIdx)];

export class Bean extends ShapeBase {
  defaultParams() {
    return { length: 150, width: Math.round(150 * _W / _H) };
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
    return _NORM.map(p => ({ x: p.x * W, y: p.y * L }));
  }
}
