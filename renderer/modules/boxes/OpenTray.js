import { GCodeGenerator } from '../gcode/GCodeGenerator.js';
import { pocketConcentric } from '../gcode/PocketConcentric.js';
import { t } from '../i18n.js';

/**
 * Plateau ouvert — fraisage du fond + contour des parois.
 * Stratégie: découpe du fond en pocket, puis profil extérieur des murs.
 */
export class OpenTray {
  static label = 'box.open_tray';
  static icon = 'tray';

  /**
   * @param {ShapeBase} shape - forme du contour
   * @param {object} params - { height, wallThickness }
   * @param {object} machineParams
   */
  generateGCode(shape, params, machineParams) {
    const gen = new GCodeGenerator(machineParams);
    const { height = 30, wallThickness = 6, bottomThickness } = params;
    const bFl = bottomThickness ?? wallThickness;  // épaisseur du fond (défaut = épaisseur paroi)
    const bb = shape.getBoundingBox();
    const doPocket = machineParams.pocketConc
      ? (pts, lbl) => pocketConcentric(gen, pts, lbl)
      : (pts, lbl) => gen.pocketShape(pts, lbl);

    gen.header(`Plateau ouvert — ${bb.width.toFixed(0)}×${bb.height.toFixed(0)}×${height.toFixed(0)}mm`);

    // 1. Pocket intérieur (fond) — suit les rayons de coin de la forme
    const pts     = shape.getContourPoints();
    const tabOpts   = machineParams.tabOpts;
    const entryOpts = machineParams.entryOpts ?? {};
    const innerW = bb.width  - 2 * wallThickness;
    const innerH = bb.height - 2 * wallThickness;

    if (innerW > 0 && innerH > 0) {
      const savedThickness = gen.machine.materialThickness;
      gen.machine.materialThickness = height - bFl;
      doPocket(gen.insetContour(pts, wallThickness), t('gcode.op_cavity'));
      gen.machine.materialThickness = savedThickness;
    }

    // 2. Découpe du contour extérieur (parois)
    if (tabOpts) gen.cutContourWithTabs(pts, 'outside', tabOpts, entryOpts, t('gcode.op_outer_wall'));
    else         gen.cutContour(pts, 'outside', entryOpts, t('gcode.op_outer_wall'));

    gen.footer();
    return gen.getCode();
  }

  /**
   * Retourne les panneaux SVG pour la vue développée.
   */
  getFlatPanels(shape, params) {
    const { height = 30 } = params;
    const bb = shape.getBoundingBox();
    const panels = [];

    // Fond — polyline pour compatibilité CAO (évite les arcs SVG mal interprétés)
    const fondPts = shape.getContourPoints();
    panels.push({
      id: 'bottom',
      label: 'Fond',
      x: 0, y: 0,
      path: fondPts.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x.toFixed(2)},${p.y.toFixed(2)}`).join(' ') + ' Z',
      width: bb.width, height: bb.height,
      color: '#4a9eff'
    });

    // Parois : uniquement pour Rectangle (les autres formes ont des parois courbes,
    // et de toute façon l'OpenTray est usiné dans un seul bloc)
    const isRectangle = 'cornerRadius' in (shape.params ?? {}) && (shape.params.cornerRadius ?? 0) === 0;
    if (isRectangle) {
      const gap = 10;
      for (let i = 0; i < 2; i++) {
        const px = 0, py = bb.height + gap + i * (height + gap);
        panels.push({
          id: `wall-front-${i}`,
          label: i === 0 ? 'Paroi avant' : 'Paroi arrière',
          x: px, y: py,
          width: bb.width, height: height,
          path: `M${px},${py} L${px+bb.width},${py} L${px+bb.width},${py+height} L${px},${py+height} Z`,
          color: '#ff9f4a'
        });
      }
      for (let i = 0; i < 2; i++) {
        const px = bb.width + gap, py = bb.height + gap + i * (height + gap);
        panels.push({
          id: `wall-side-${i}`,
          label: i === 0 ? 'Paroi gauche' : 'Paroi droite',
          x: px, y: py,
          width: bb.height, height: height,
          path: `M${px},${py} L${px+bb.height},${py} L${px+bb.height},${py+height} L${px},${py+height} Z`,
          color: '#ff9f4a'
        });
      }
    }

    return panels;
  }

  getBoxParams() {
    return [
      { id: 'height',          label: 'param.height',           min: 5,  max: 500, step: 1,   unit: 'mm', value: 40 },
      { id: 'wallThickness',   label: 'param.wall_thickness',   min: 1,  max: 50,  step: 0.5, unit: 'mm', value: 6 },
      { id: 'bottomThickness', label: 'param.bottom_thickness', min: 1,  max: 50,  step: 0.5, unit: 'mm', value: 6 }
    ];
  }
}
