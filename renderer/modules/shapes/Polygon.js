import { ShapeBase } from './ShapeBase.js';

export class Polygon extends ShapeBase {
  defaultParams() {
    return { length: 120, width: 120, sides: 5, cornerRadius: 0, orientation: 0 };
  }

  getParamDescriptors() {
    const { length: L, width: W, cornerRadius: r } = this.params;
    const rMax = Math.min(L, W) / 2;
    return [
      { id: 'length',       label: 'param.length',        min: 10, max: 2000, step: 1,   unit: 'mm' },
      { id: 'width',        label: 'param.width',         min: 10, max: 2000, step: 1,   unit: 'mm' },
      { id: 'sides',        label: 'param.sides',         min: 3,  max: 32,   step: 1,   unit: ''   },
      { id: 'cornerRadius', label: 'param.corner_radius', min: 0,  max: 500,  step: 0.5, unit: 'mm',
        warn: r > rMax, warnTip: 'warn.radius_clamped|' + +rMax.toFixed(2) },
      { id: 'orientation',  label: 'param.rotation',      min: 0,  max: 360,  step: 5,   unit: '°'  }
    ];
  }

  getBoundingBox() {
    const { length: L, width: W } = this.params;
    return { minX: 0, minY: 0, maxX: L, maxY: W, width: L, height: W };
  }

  getContourPoints() {
    const { length: L, width: W, sides, cornerRadius: r, orientation } = this.params;
    const n      = Math.max(3, Math.round(sides));
    const offset = (orientation * Math.PI) / 180;
    // Rayon limité à la moitié de la plus petite cote (au-delà : signalé dans l'interface)
    const rc = Math.min(Math.max(r || 0, 0), L / 2, W / 2);

    // Sommets unitaires (polygone inscrit dans le cercle unité)
    const raw = [];
    for (let i = 0; i < n; i++) {
      const a = offset + (2 * Math.PI * i) / n;
      raw.push({ x: Math.cos(a), y: Math.sin(a) });
    }

    // Mise à l'échelle : polygone de base d'emprise (L − 2rc) × (W − 2rc), centré ; agrandi
    // ensuite de rc avec des coins ronds → emprise finale exactement L × W, rayon exactement rc.
    const uXs = raw.map(p => p.x), uYs = raw.map(p => p.y);
    const uMinX = Math.min(...uXs), uMaxX = Math.max(...uXs);
    const uMinY = Math.min(...uYs), uMaxY = Math.max(...uYs);
    const uCx = (uMinX + uMaxX) / 2, uCy = (uMinY + uMaxY) / 2;
    const bw = L - 2 * rc, bh = W - 2 * rc;
    const pts = raw.map(p => ({
      x: (p.x - uCx) * (bw / (uMaxX - uMinX)) + L / 2,
      y: (p.y - uCy) * (bh / (uMaxY - uMinY)) + W / 2,
    }));

    return rc > 0 ? this._roundOutward(pts, rc) : pts;
  }
}
