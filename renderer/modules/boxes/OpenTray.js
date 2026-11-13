import { GCodeGenerator } from '../gcode/GCodeGenerator.js';
import { pocketConcentric } from '../gcode/PocketConcentric.js';
import { buildPartitionContours } from '../gcode/PartitionedPocket.js';
import { insetPolygon } from '../gcode/Offset.js';
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
    const partitions   = params.partitions   ?? 0;
    const partitionDir = (params.partitionDir === 'horizontal') ? 'horizontal' : 'vertical';
    const bFl = bottomThickness ?? wallThickness;  // épaisseur du fond (défaut = épaisseur paroi)
    const bb = shape.getBoundingBox();
    const fa = machineParams.finishAllowance ?? 0;
    const doPocket = machineParams.pocketConc
      ? (pts, lbl) => pocketConcentric(gen, pts, lbl, 0, fa)
      : (pts, lbl) => gen.pocketShape(pts, lbl, 0, fa);

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
      // Compartiments s'il y a des cloisons, sinon (ou si elles ne tiennent pas) la cavité entière
      const cavity = gen.insetContour(pts, wallThickness);
      const cells = partitions > 0
        ? buildPartitionContours(bb.width, bb.height, wallThickness, partitions, partitionDir, machineParams.toolDiameter,
            { minX: bb.minX, minY: bb.minY, cavity })
        : null;
      if (cells) cells.forEach((cellPts, i) => doPocket(cellPts, `${t('gcode.op_body_compartment')} ${i + 1}`));
      else       doPocket(cavity, t('gcode.op_cavity'));
      gen.machine.materialThickness = savedThickness;
    }

    // 2. Découpe du contour extérieur (parois)
    gen.cutOutline(pts, 'outside', entryOpts, t('gcode.op_outer_wall'), tabOpts, shape.getArcDef?.() ?? null);

    gen.footer();
    return gen.getCode();
  }

  /**
   * Contours théoriques pour la simulation (case « Dessin ») et le masque « Pièce finie
   * seule » : coordonnées de la forme (origine programme non appliquée).
   * outer = contour qui détache la pièce du brut.
   */
  getDrawing(shape, params, machineParams = {}) {
    const pts = shape.getContourPoints();
    const wt = params.wallThickness ?? 6;
    const cavity = insetPolygon(pts, wt);
    const bb = shape.getBoundingBox();
    const partitionDir = params.partitionDir === 'horizontal' ? 'horizontal' : 'vertical';
    const cells = (params.partitions ?? 0) > 0
      ? buildPartitionContours(bb.width, bb.height, wt, params.partitions,
          partitionDir, machineParams.toolDiameter ?? 3.175,
          { minX: bb.minX, minY: bb.minY, cavity })
      : null;
    const inner = cells ?? (cavity.length > 2 ? [cavity] : []);
    return [{ pts, face: 1, outer: true }, ...inner.map(c => ({ pts: c, face: 1 }))];
  }

  getBoxParams() {
    return [
      { id: 'height',          label: 'param.height',           min: 5,  max: 500, step: 1,   unit: 'mm', value: 40 },
      { id: 'wallThickness',   label: 'param.wall_thickness',   min: 1,  max: 50,  step: 0.5, unit: 'mm', value: 6 },
      { id: 'bottomThickness', label: 'param.bottom_thickness', min: 1,  max: 50,  step: 0.5, unit: 'mm', value: 6 },
      { id: 'partitions',   label: 'param.partitions',    min: 0, max: 5, step: 1, unit: '', value: 0 },
      {
        id: 'partitionDir', label: 'param.partition_dir', type: 'select', unit: '',
        options: [
          { value: 'vertical',   label: 'option.partition_vertical' },
          { value: 'horizontal', label: 'option.partition_horizontal' }
        ]
      }
    ];
  }
}
