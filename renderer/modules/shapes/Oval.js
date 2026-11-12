import { ShapeBase, DEFLECTION } from './ShapeBase.js';

export class Oval extends ShapeBase {
  defaultParams() {
    return { length: 150, width: 80 };
  }

  getParamDescriptors() {
    return [
      { id: 'length', label: 'param.length', min: 10, max: 2000, step: 1, unit: 'mm' },
      { id: 'width',  label: 'param.width',  min: 10, max: 2000, step: 1, unit: 'mm' }
    ];
  }

  getContourPoints(deflection = DEFLECTION) {
    const rx = this.params.length / 2;
    const ry = this.params.width / 2;
    const at = a => ({ x: rx + rx * Math.cos(a), y: ry + ry * Math.sin(a) });
    // Écart entre l'arc d'ellipse [a, b] et sa corde, mesuré en trois points intérieurs
    const sag = (a, b) => {
      const p = at(a), q = at(b), dx = q.x - p.x, dy = q.y - p.y, l = Math.hypot(dx, dy) || 1;
      let d = 0;
      for (const f of [0.25, 0.5, 0.75]) {
        const m = at(a + (b - a) * f);
        d = Math.max(d, Math.abs((m.x - p.x) * dy - (m.y - p.y) * dx) / l);
      }
      return d;
    };
    // Subdivision adaptative : segments courts aux extrémités (forte courbure), longs sur les
    // flancs ; un seul quadrant calculé puis reporté par symétrie (contour symétrique).
    const q1 = [0];
    const split = (a, b, depth) => {
      if (depth < 16 && sag(a, b) > deflection) { const c = (a + b) / 2; split(a, c, depth + 1); split(c, b, depth + 1); }
      else q1.push(b);
    };
    const N0 = 4;   // découpage initial du quadrant
    for (let i = 0; i < N0; i++) split(Math.PI / 2 * i / N0, Math.PI / 2 * (i + 1) / N0, 0);
    const angles = [
      ...q1,                                                   // 0 → π/2
      ...q1.slice(0, -1).reverse().map(a => Math.PI - a),       // → π
      ...q1.slice(1).map(a => Math.PI + a),                     // → 3π/2
      ...q1.slice(1, -1).reverse().map(a => 2 * Math.PI - a),   // → 2π (exclu)
    ];
    return angles.map(at);
  }

}
