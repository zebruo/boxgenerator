import { ShapeBase } from './ShapeBase.js';

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

  getContourPoints(deflection = 0.01) {
    const rx = this.params.length / 2;
    const ry = this.params.width / 2;
    // Rayon de courbure minimal de l'ellipse = (petit axe)² / grand axe
    // C'est là où la courbure est la plus forte → le plus de segments nécessaires
    const rMin     = Math.min(rx, ry) ** 2 / Math.max(rx, ry);
    const theta    = 2 * Math.acos(1 - deflection / rMin);
    const segments = Math.max(32, Math.ceil(2 * Math.PI / theta));
    const pts = [];
    for (let i = 0; i < segments; i++) {
      const a = (2 * Math.PI * i) / segments;
      pts.push({ x: rx + rx * Math.cos(a), y: ry + ry * Math.sin(a) });
    }
    return pts;
  }

  getSVGPath() {
    const rx = this.params.length / 2;
    const ry = this.params.width / 2;
    return `M${2 * rx},${ry} A${rx},${ry} 0 1 1 ${2 * rx - 0.001},${ry} Z`;
  }
}
