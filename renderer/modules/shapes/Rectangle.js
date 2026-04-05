import { ShapeBase } from './ShapeBase.js';

export class Rectangle extends ShapeBase {
  defaultParams() {
    return { length: 150, width: 100, cornerRadius: 0 };
  }

  getParamDescriptors() {
    return [
      { id: 'length',       label: 'param.length',        min: 10, max: 2000, step: 1,   unit: 'mm' },
      { id: 'width',        label: 'param.width',         min: 10, max: 2000, step: 1,   unit: 'mm' },
      { id: 'cornerRadius', label: 'param.corner_radius', min: 0,  max: 50,   step: 0.5, unit: 'mm' }
    ];
  }

  updateParam(id, value) {
    const v = parseFloat(value);
    this.params[id] = v;
    // Garantir length ≥ width pour éviter la bascule d'orientation
    if (id === 'length' && v < this.params.width) {
      this.params.width = v;
    } else if (id === 'width' && v > this.params.length) {
      this.params.length = v;
    }
  }

  getContourPoints(segments = 8) {
    const { length: L, width: W, cornerRadius: r } = this.params;
    // L (Longueur) → axe X (horizontal), W (Largeur) → axe Y (profondeur)
    const rc = Math.min(r, L / 2, W / 2);
    const pts = [];

    if (rc <= 0) {
      return [
        { x: 0, y: 0 }, { x: L, y: 0 },
        { x: L, y: W }, { x: 0, y: W }
      ];
    }

    // Coins arrondis: 4 arcs de quart de cercle
    const corners = [
      { cx: L - rc, cy: rc,     startAngle: -Math.PI / 2, endAngle: 0 },
      { cx: L - rc, cy: W - rc, startAngle: 0,            endAngle: Math.PI / 2 },
      { cx: rc,     cy: W - rc, startAngle: Math.PI / 2,  endAngle: Math.PI },
      { cx: rc,     cy: rc,     startAngle: Math.PI,       endAngle: 3 * Math.PI / 2 }
    ];

    for (const c of corners) {
      for (let i = 0; i <= segments; i++) {
        const a = c.startAngle + (c.endAngle - c.startAngle) * (i / segments);
        pts.push({ x: c.cx + rc * Math.cos(a), y: c.cy + rc * Math.sin(a) });
      }
    }
    return pts;
  }

  getSVGPath() {
    const { length: L, width: W, cornerRadius: r } = this.params;
    const rc = Math.min(r, L / 2, W / 2);
    if (rc <= 0) {
      return `M0,0 L${L},0 L${L},${W} L0,${W} Z`;
    }
    return `M${rc},0 L${L - rc},0 A${rc},${rc} 0 0 1 ${L},${rc} L${L},${W - rc} A${rc},${rc} 0 0 1 ${L - rc},${W} L${rc},${W} A${rc},${rc} 0 0 1 0,${W - rc} L0,${rc} A${rc},${rc} 0 0 1 ${rc},0 Z`;
  }
}