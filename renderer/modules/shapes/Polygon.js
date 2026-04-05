import { ShapeBase } from './ShapeBase.js';

export class Polygon extends ShapeBase {
  defaultParams() {
    return { length: 120, width: 120, sides: 5, cornerRadius: 0, orientation: 0 };
  }

  getParamDescriptors() {
    return [
      { id: 'length',       label: 'param.length',        min: 10, max: 2000, step: 1,   unit: 'mm' },
      { id: 'width',        label: 'param.width',         min: 10, max: 2000, step: 1,   unit: 'mm' },
      { id: 'sides',        label: 'param.sides',         min: 3,  max: 32,   step: 1,   unit: ''   },
      { id: 'cornerRadius', label: 'param.corner_radius', min: 0,  max: 500,  step: 0.5, unit: 'mm' },
      { id: 'orientation',  label: 'param.rotation',      min: 0,  max: 360,  step: 5,   unit: '°'  }
    ];
  }

  getBoundingBox() {
    const { length: L, width: W } = this.params;
    return { minX: 0, minY: 0, maxX: L, maxY: W, width: L, height: W };
  }

  getContourPoints(arcSegments = 6) {
    const { length: L, width: W, sides, cornerRadius: r, orientation } = this.params;
    const n      = Math.max(3, Math.round(sides));
    const offset = (orientation * Math.PI) / 180;

    // Sommets unitaires (polygone inscrit dans le cercle unité)
    const raw = [];
    for (let i = 0; i < n; i++) {
      const a = offset + (2 * Math.PI * i) / n;
      raw.push({ x: Math.cos(a), y: Math.sin(a) });
    }

    // Mise à l'échelle vers L × W, bounding box exacte
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
