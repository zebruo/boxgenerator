import { ShapeBase } from './ShapeBase.js';

export class Hexagon extends ShapeBase {
  defaultParams() {
    // Valeurs par défaut : hexagone régulier côté=60, orientation=0° (pointy-top)
    const size = 60, orientation = 0;
    const { longueur, largeur } = _computeDims(size, orientation);
    const ratio = +(longueur / largeur).toFixed(4);
    return { longueur: +longueur.toFixed(2), largeur: +largeur.toFixed(2), ratio, cornerRadius: 0, orientation };
  }

  getParamDescriptors() {
    const { longueur, largeur, orientation } = this.params;
    const isRegular = _isRegular(longueur, largeur, orientation);
    return [
      { id: 'longueur',     label: 'param.length',          min: 10, max: 2000, step: 0.5, unit: 'mm' },
      { id: 'largeur',      label: 'param.width',           min: 10, max: 2000, step: 0.5, unit: 'mm' },
      {
        id: 'ratio', label: 'param.ratio_long_larg', unit: '', readonly: true,
        warn:    !isRegular,
        warnTip: isRegular ? '' : 'warn.hexagon_irregular|' + _regularRatio(orientation).toFixed(4),
      },
      { id: 'cornerRadius', label: 'param.corner_radius',  min: 0,  max: 200,  step: 0.5, unit: 'mm' },
      { id: 'orientation',  label: 'param.rotation',       min: 0,  max: 360,  step: 30,  unit: '°'  }
    ];
  }

  updateParam(id, value) {
    if (id === 'orientation') {
      const wasRegular    = _isRegular(this.params.longueur, this.params.largeur, this.params.orientation);
      const oldOrientation = this.params.orientation;
      this.params.orientation = parseFloat(value);
      if (wasRegular) {
        const unitOld = _computeDims(1, oldOrientation);
        const size    = this.params.longueur / unitOld.longueur;
        const { longueur, largeur } = _computeDims(size, this.params.orientation);
        this.params.longueur = +longueur.toFixed(2);
        this.params.largeur  = +largeur.toFixed(2);
      }
    } else {
      this.params[id] = parseFloat(value);
    }
    this.params.ratio = +(this.params.longueur / this.params.largeur).toFixed(4);
  }

  getBoundingBox() {
    const { longueur: W, largeur: H } = this.params;
    return { minX: 0, minY: 0, maxX: W, maxY: H, width: W, height: H };
  }

  getContourPoints(arcSegments = 6) {
    const { longueur: L, largeur: W, cornerRadius: r, orientation } = this.params;
    const offset = (orientation * Math.PI) / 180;

    const raw = Array.from({ length: 6 }, (_, i) => ({
      x: Math.cos(offset + 2 * Math.PI * i / 6),
      y: Math.sin(offset + 2 * Math.PI * i / 6),
    }));
    const uXs = raw.map(p => p.x), uYs = raw.map(p => p.y);
    const uMinX = Math.min(...uXs), uMaxX = Math.max(...uXs);
    const uMinY = Math.min(...uYs), uMaxY = Math.max(...uYs);
    const uCx = (uMinX + uMaxX) / 2, uCy = (uMinY + uMaxY) / 2;

    const pts = raw.map(p => ({
      x: (p.x - uCx) * (L / (uMaxX - uMinX)) + L / 2,
      y: (p.y - uCy) * (W / (uMaxY - uMinY)) + W / 2,
    }));

    return r > 0 ? this._roundedPolygon(pts, r, arcSegments) : pts;
  }
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function _computeDims(size, orientation) {
  const offset = (orientation * Math.PI) / 180;
  const xs = Array.from({ length: 6 }, (_, i) => Math.cos(offset + 2 * Math.PI * i / 6) * size);
  const ys = Array.from({ length: 6 }, (_, i) => Math.sin(offset + 2 * Math.PI * i / 6) * size);
  return { longueur: Math.max(...xs) - Math.min(...xs), largeur: Math.max(...ys) - Math.min(...ys) };
}


function _regularRatio(orientation) {
  const offset = (orientation * Math.PI) / 180;
  const xs = Array.from({ length: 6 }, (_, i) => Math.cos(offset + 2 * Math.PI * i / 6));
  const ys = Array.from({ length: 6 }, (_, i) => Math.sin(offset + 2 * Math.PI * i / 6));
  return (Math.max(...xs) - Math.min(...xs)) / (Math.max(...ys) - Math.min(...ys));
}

function _isRegular(longueur, largeur, orientation) {
  const expected = _regularRatio(orientation);
  const actual   = longueur / largeur;
  return Math.abs(actual - expected) / expected < 0.005; // tolérance 0.5%
}
