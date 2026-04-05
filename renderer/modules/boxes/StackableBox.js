import { GCodeGenerator } from '../gcode/GCodeGenerator.js';
import { pocketConcentric } from '../gcode/PocketConcentric.js';
import { t } from '../i18n.js';

/**
 * Boite empilable — fond plein + cavite interieure + languette d'empilement.
 *
 * Geometrie (vue en coupe, orientation usage) :
 *   [haut]    ouverture cavite
 *   [milieu]  cavite interieure
 *   [bas]     fond + languette qui depasse vers le bas
 *
 * Usinage en 2 operations (retournement) :
 *   OP1 (dessus)  : trous de centrage + cavite interieure
 *   Retournement sur goupilles
 *   OP2 (dessous) : rainure languette + contour exterieur (tabs en dernier)
 */
export class StackableBox {
  static label = 'box.stackable';
  static icon  = 'stackable';

  getBoxParams() {
    return [
      { id: 'height',          label: 'param.box_height',     min: 10,  max: 500, step: 1,    unit: 'mm', value: 40  },
      { id: 'wallThickness',   label: 'param.wall_thickness', min: 1,   max: 50,  step: 0.5,  unit: 'mm', value: 6   },
      { id: 'bottomThickness', label: 'param.bottom_thickness', min: 1, max: 50,  step: 0.5,  unit: 'mm', value: 6   },
      { id: 'rimHeight',       label: 'param.rim_height',     min: 2,   max: 100, step: 0.5,  unit: 'mm', value: 8   },
      { id: 'clearance',       label: 'param.clearance',      min: 0,   max: 2,   step: 0.1,  unit: 'mm', value: 0.3 },
      { id: 'regHoleDia',      label: 'param.pin_diameter',   min: 2,   max: 20,  step: 0.5,  unit: 'mm', value: 6   },
      { id: 'regHoleOffset',   label: 'param.pin_offset',     min: 5,   max: 50,  step: 1,    unit: 'mm', value: 15  },
      { id: 'pinDepth',        label: 'param.pin_depth',      min: 0,   max: 200, step: 0.5,  unit: 'mm', value: 0   },
    ];
  }

  generateGCode(shape, params, machineParams) {
    const gen = new GCodeGenerator(machineParams);
    const {
      height          = 40,
      wallThickness   = 6,
      bottomThickness = 6,
      rimHeight       = 8,
      clearance       = 0.3,
      regHoleDia      = 6,
      regHoleOffset   = 15,
      pinDepth        = 0,
    } = params;

    const effectivePinDepth = pinDepth > 0 ? pinDepth : height;

    const bb        = shape.getBoundingBox();
    const pts       = shape.getContourPoints();
    const tabOpts   = machineParams.tabOpts;
    const entryOpts = machineParams.entryOpts ?? {};
    const savedT    = gen.machine.materialThickness;
    const doPocket  = machineParams.pocketConc
      ? (p, lbl) => pocketConcentric(gen, p, lbl)
      : (p, lbl) => gen.pocketShape(p, lbl);

    // Positions trous de centrage — hors contour, dans le brut
    const holeY  = bb.height / 2;
    const holeXL = -(regHoleDia / 2 + regHoleOffset);
    const holeXR = bb.width + regHoleDia / 2 + regHoleOffset;

    gen.header(
      `Boite empilable \u2014 ${bb.width.toFixed(0)}\u00d7${bb.height.toFixed(0)}\u00d7${height.toFixed(0)}mm`
    );
    gen.comment(`Paroi: ${wallThickness}mm | Fond: ${bottomThickness}mm | Languette: H${rimHeight}mm | Jeu: ${clearance}mm`);
    gen.comment(`Goupilles: diam ${regHoleDia}mm a \u00b1${regHoleOffset.toFixed(0)}mm hors piece`);
    gen.emit('');

    // === OPERATION 1 — DESSUS =============================================
    gen.comment('==========================================');
    gen.comment('OPERATION 1 \u2014 DESSUS');
    gen.comment('==========================================');
    gen.emit('');

    // 1a. Trous de centrage (peuvent depasser dans le martyre si pinDepth > height)
    gen.machine.materialThickness = effectivePinDepth;
    gen.drillHole(holeXL, holeY, effectivePinDepth, t('gcode.op_pin_left',  { d: regHoleDia }), regHoleDia);
    gen.drillHole(holeXR, holeY, effectivePinDepth, t('gcode.op_pin_right', { d: regHoleDia }), regHoleDia);

    // 1b. Cavite interieure (depuis le dessus)
    const pocketDepth = height - bottomThickness;
    if (pocketDepth > 0 && wallThickness > 0) {
      gen.machine.materialThickness = pocketDepth;
      doPocket(gen.insetContour(pts, wallThickness), t('gcode.op_cavity'));
    }

    // === FIN OP1 — instruction manuelle (commentaire uniquement) ==========
    gen.emit('');
    gen.comment('Retourner la piece sur les goupilles avant de lancer OP2');
    gen.comment('Z0 inchange \u2014 piece a plat sur le martyre');
    gen.emit('');

    // 2a. Rainure languette — fraisage annulaire autour du plot
    // Le plot (languette) = solid inset de (wt + stackGap) depuis le bord exterieur
    // Dimension plot = shape - 2*(wt+gap), s emboite dans la cavite du dessous avec jeu=gap
    const tongueInset = wallThickness + clearance;
    const toolR = gen.machine.toolDiameter / 2;
    gen.machine.materialThickness = rimHeight;
    gen.comment("Rainure plot — anneau de " + tongueInset.toFixed(1) + "mm de large");
    const ringContours = [];
    for (let d = toolR; d < tongueInset - toolR * 0.01; d += gen.machine.toolDiameter) {
      const ringPts = gen.insetContour(pts, d);
      if (ringPts.length >= 3) ringContours.push(ringPts);
    }
    // Passe finale au bord exact du plot
    const finalPts = gen.insetContour(pts, tongueInset);
    if (finalPts.length >= 3) ringContours.push(finalPts);
    gen.cutContoursInterleaved(ringContours, 'outside', t('gcode.op_rim_mill'));

    // 2b. Contour exterieur — EN DERNIER (tabs maintiennent la piece)
    // Épaisseur totale = hauteur corps + hauteur plot (pièce retournée)
    gen.machine.materialThickness = savedT;  // épaisseur stock réelle (inclut offset)
    if (tabOpts) gen.cutContourWithTabs(pts, 'outside', tabOpts, entryOpts, t('gcode.op_outer_contour'));
    else         gen.cutContour(pts, 'outside', entryOpts, t('gcode.op_outer_contour'));

    gen.machine.materialThickness = savedT;
    gen.footer();
    return gen.getCode();
  }

  getFlatPanels(shape, params) {
    const { height = 40 } = params;
    const bb = shape.getBoundingBox();
    return [
      {
        id: 'body', label: `Corps (H=${height}mm)`,
        x: 0, y: 0, width: bb.width, height: bb.height,
        path: shape.getContourPoints().map((p, i) =>
          `${i === 0 ? 'M' : 'L'}${p.x.toFixed(2)},${p.y.toFixed(2)}`
        ).join(' ') + ' Z',
        color: '#4a9eff'
      }
    ];
  }
}