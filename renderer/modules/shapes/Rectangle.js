import { ShapeBase } from './ShapeBase.js';

export class Rectangle extends ShapeBase {
  defaultParams() {
    return { length: 150, width: 100, cornerRadius: 0 };
  }

  getParamDescriptors() {
    const { length: L, width: W, cornerRadius: r } = this.params;
    const rMax = Math.min(L, W) / 2;
    return [
      { id: 'length',       label: 'param.length',        min: 10, max: 2000, step: 1,   unit: 'mm' },
      { id: 'width',        label: 'param.width',         min: 10, max: 2000, step: 1,   unit: 'mm' },
      { id: 'cornerRadius', label: 'param.corner_radius', min: 0,  max: 50,   step: 0.5, unit: 'mm',
        warn: r > rMax, warnTip: 'warn.radius_clamped|' + +rMax.toFixed(2) }
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

  getContourPoints() {
    const { length: L, width: W, cornerRadius: r } = this.params;
    // L (Longueur) → axe X (horizontal), W (Largeur) → axe Y (profondeur)
    const rc = Math.min(r, L / 2, W / 2);

    if (!(rc > 0)) {
      return [
        { x: 0, y: 0 }, { x: L, y: 0 },
        { x: L, y: W }, { x: 0, y: W }
      ];
    }
    // Coins arrondis : rectangle intérieur agrandi de rc (départ en (L − rc, 0), comme avant).
    // rc = W/2 → oblong ; rc = L/2 = W/2 → cercle.
    return this._roundOutward([
      { x: L - rc, y: rc }, { x: L - rc, y: W - rc }, { x: rc, y: W - rc }, { x: rc, y: rc },
    ], rc);
  }

}