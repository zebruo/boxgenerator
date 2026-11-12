import { GCodeGenerator } from '../gcode/GCodeGenerator.js';
import { pocketConcentric } from '../gcode/PocketConcentric.js';
import { insetPolygon } from '../gcode/Offset.js';
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
    const fa = machineParams.finishAllowance ?? 0;
    const doPocket  = machineParams.pocketConc
      ? (p, lbl) => pocketConcentric(gen, p, lbl, 0, fa)
      : (p, lbl) => gen.pocketShape(p, lbl, 0, fa);

    // Positions trous de centrage — hors contour, dans le brut
    const [holeL, holeR] = this.getPinHoles(shape, params);

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
    gen.drillHole(holeL.x, holeL.y, effectivePinDepth, t('gcode.op_pin_left',  { d: regHoleDia }), regHoleDia);
    gen.drillHole(holeR.x, holeR.y, effectivePinDepth, t('gcode.op_pin_right', { d: regHoleDia }), regHoleDia);

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
    // Rep\u00e8re lu par la simulation (GCodeProgram) : retournement gauche \u2194 droite, les
    // goupilles (sym\u00e9triques autour du centre) changent de trou \u2192 miroir X autour du centre
    gen.comment(`FACE 2 \u2014 piece retournee gauche-droite (miroir X autour de X=${(bb.width / 2 + gen.machine.originX).toFixed(3)})`);
    gen.emit('');

    // OP2 : pièce retournée gauche ↔ droite sur les goupilles → la machine voit la forme en
    // miroir autour de l'axe des goupilles (X = largeur/2). Sans ce miroir, le dessous ne
    // tombait juste que pour les formes symétriques gauche/droite.
    const pts2 = this._mirrorOp2(pts, bb);

    // 2a. Rainure languette — fraisage annulaire autour du plot
    // Le plot (languette) = solid inset de (wt + stackGap) depuis le bord exterieur
    // Dimension plot = shape - 2*(wt+gap), s emboite dans la cavite du dessous avec jeu=gap
    const tongueInset = wallThickness + clearance;
    const toolR = gen.machine.toolDiameter / 2;
    gen.machine.materialThickness = rimHeight;
    gen.comment("Rainure plot — anneau de " + tongueInset.toFixed(1) + "mm de large");
    // Anneaux du bord extérieur jusqu'au bord exact du plot (pas resserré dans les coins)
    const ringContours = gen.ringInsets(pts2, toolR, tongueInset)
      .map(d => gen.insetContour(pts2, d)).filter(c => c.length >= 3);
    gen.cutContoursInterleaved(ringContours, 'outside', entryOpts, t('gcode.op_rim_mill'));

    // 2b. Contour exterieur — EN DERNIER (tabs maintiennent la piece)
    // Épaisseur totale = hauteur corps + hauteur plot (pièce retournée)
    gen.machine.materialThickness = savedT;  // épaisseur stock réelle (inclut offset)
    const arcDef = shape.getArcDef?.() ?? null;   // cercle exact, en miroir comme pts2
    gen.cutOutline(pts2, 'outside', entryOpts, t('gcode.op_outer_contour'), tabOpts,
      arcDef && { ...arcDef, cx: bb.width - arcDef.cx });

    gen.machine.materialThickness = savedT;
    gen.footer();
    return gen.getCode();
  }

  /**
   * Trous de goupille de repositionnement (repère de la forme) : un de chaque côté du contour,
   * à mi-profondeur, à regHoleOffset mm du bord. Partagé par le G-code et la taille de plaque.
   * @returns {{x, y, d}[]}
   */
  getPinHoles(shape, params) {
    const { regHoleDia = 6, regHoleOffset = 15 } = params;
    const bb = shape.getBoundingBox();
    // Symétriques autour de X = largeur / 2 : l'axe de retournement de la face 2 (_mirrorOp2)
    const y = bb.height / 2, off = regHoleDia / 2 + regHoleOffset;
    return [{ x: -off, y, d: regHoleDia }, { x: bb.width + off, y, d: regHoleDia }];
  }

  /**
   * Contours théoriques pour la simulation (coordonnées de la forme, repère machine de
   * chaque face). La pièce est détachée par le contour de l'OP2 (face 2), d'où outer là.
   */
  getDrawing(shape, params) {
    const { wallThickness = 6, clearance = 0.3 } = params;
    const pts  = shape.getContourPoints();
    const pts2 = this._mirrorOp2(pts, shape.getBoundingBox());   // repère machine de l'OP2
    const cavity = insetPolygon(pts, wallThickness);
    const plot   = insetPolygon(pts2, wallThickness + clearance);
    return [
      { pts, face: 1 },
      ...(cavity.length > 2 ? [{ pts: cavity, face: 1 }] : []),
      { pts: pts2, face: 2, outer: true },
      ...(plot.length > 2 ? [{ pts: plot, face: 2 }] : []),
    ];
  }

  /**
   * Forme vue par la machine en OP2 : miroir autour de l'axe des goupilles (X = largeur/2,
   * milieu des deux trous), sens de parcours inversé pour garder l'orientation du contour.
   */
  _mirrorOp2(pts, bb) {
    return pts.map(p => ({ x: bb.width - p.x, y: p.y })).reverse();
  }
}
