import { ShapeBase } from './ShapeBase.js';

export class Circle extends ShapeBase {
  defaultParams() {
    return { diameter: 100 };
  }

  getParamDescriptors() {
    return [
      { id: 'diameter', label: 'param.diameter', min: 10, max: 2000, step: 1, unit: 'mm' }
    ];
  }

  getContourPoints(segments = 64) {
    const r = this.params.diameter / 2;
    const pts = [];
    for (let i = 0; i < segments; i++) {
      const a = (2 * Math.PI * i) / segments;
      pts.push({ x: r + r * Math.cos(a), y: r + r * Math.sin(a) });
    }
    return pts;
  }

  getSVGPath() {
    const r = this.params.diameter / 2;
    return `M${2 * r},${r} A${r},${r} 0 1 1 ${2 * r - 0.001},${r} Z`;
  }
}
