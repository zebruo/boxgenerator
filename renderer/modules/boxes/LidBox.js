import { GCodeGenerator } from '../gcode/GCodeGenerator.js';
import { pocketConcentric } from '../gcode/PocketConcentric.js';
import { t } from '../i18n.js';

/**
 * Boîte avec couvercle à double feuillure.
 *
 * Corps  : rainure sur le bord intérieur haut  (largeur=rabbet, profondeur=rabbetDepth)
 * Couvercle : poche centrale laissant une lèvre extérieure (largeur=rabbet, hauteur=rabbetDepth)
 * → La lèvre du couvercle s'enfile dans la rainure du corps.
 */
export class LidBox {
  static label = 'box.lid_box';
  static icon  = 'lid-box';

  getBoxParams() {
    return [
      { id: 'height',        label: 'param.box_height',      min: 10, max: 500, step: 1,   unit: 'mm', value: 40 },
      { id: 'lidHeight',     label: 'param.lid_height',      min: 5,  max: 200, step: 1,   unit: 'mm', value: 20 },
      { id: 'wallThickness', label: 'param.wall_thickness',  min: 2,  max: 30,  step: 0.5, unit: 'mm', value: 6 },
      { id: 'rabbet',      label: 'param.rabbet',       min: 1, max: 15, step: 0.5, unit: 'mm', value: 3 },
      { id: 'rabbetDepth', label: 'param.rabbet_depth', min: 1, max: 15, step: 0.5, unit: 'mm', value: 4 },
      {
        id: 'rabbetSide', label: 'param.rabbet_side', type: 'select', unit: '',
        options: [
          { value: 0, label: 'option.rabbet_interior' },
          { value: 1, label: 'option.rabbet_exterior' }
        ]
      },
      { id: 'bottomThickness',    label: 'param.bottom_body', min: 1, max: 30,  step: 0.5, unit: 'mm', value: 6 },
      { id: 'lidBottomThickness', label: 'param.bottom_lid',  min: 1, max: 30,  step: 0.5, unit: 'mm', value: 6 },
      { id: 'clearance',          label: 'param.clearance',   min: 0, max: 2,   step: 0.1, unit: 'mm', value: 0.3 }
    ];
  }

  generateGCode(shape, params, machineParams) {
    const gen = new GCodeGenerator(machineParams);
    const { height = 40, lidHeight = 15, wallThickness = 6, rabbet = 3, rabbetSide = 0, clearance = 0.3 } = params;
    const rabbetDepth = params.rabbetDepth ?? 4;
    const bb   = shape.getBoundingBox();
    const W    = bb.width, D = bb.height;
    const bt   = machineParams.materialThickness;
    const bFl  = params.bottomThickness    ?? bt;  // épaisseur fond corps
    const bFll = params.lidBottomThickness ?? bt;  // épaisseur fond couvercle

    const sideLabel = rabbetSide === 0 ? 'rainure intérieure' : 'rainure extérieure';
    gen.header(
      `Boîte couvercle — ${W.toFixed(0)}×${D.toFixed(0)}mm ` +
      `corps ${height}mm + couvercle ${lidHeight}mm`
    );
    gen.comment(`Paroi: ${wallThickness}mm | Fond corps: ${bFl}mm | Fond couvercle: ${bFll}mm | Feuillure: larg=${rabbet}mm prof=${rabbetDepth}mm (${sideLabel})`);
    gen.emit('');

    const tabOpts   = machineParams.tabOpts;
    const entryOpts = machineParams.entryOpts ?? {};
    const bodyPts   = shape.getContourPoints();
    // Miroir horizontal appliqué APRÈS calcul d'inset : mirror(inset(P)) et non inset(mirror(P)).
    // Les deux ne sont pas équivalents pour les formes asymétriques (bisectrice différente).
    // Après retournement physique du couvercle, le contour miroir s'aligne exactement avec le corps.
    const mirrorPts = pts => pts.map(p => ({ x: W - p.x, y: p.y })).reverse();
    const savedT    = gen.machine.materialThickness;
    const doPocket = machineParams.pocketConc
      ? (pts, lbl, ds = 0) => pocketConcentric(gen, pts, lbl, ds)
      : (pts, lbl, ds = 0) => gen.pocketShape(pts, lbl, ds);

    // ═══════════════════════════════════════════════════════════════════════
    // CORPS
    // ═══════════════════════════════════════════════════════════════════════
    gen.comment('═══ CORPS ═══');

    // 1. Feuillure corps (peu profond — doit précéder la cavité)
    gen.machine.materialThickness = rabbetDepth;
    if (rabbetSide === 0) {
      doPocket(gen.insetContour(bodyPts, wallThickness - rabbet - clearance), t('gcode.op_body_rabbet'));
    } else {
      // Feuillure extérieure : creuse l'anneau périphérique (passes concentriques)
      const td = gen.machine.toolDiameter;
      const stepOver = td * 0.6;
      const ringW = rabbet + clearance;
      const dMin = td / 2;
      const dMax = ringW - td / 2;
      if (dMin > dMax + 1e-6) {
        gen.comment(`ATTENTION: fraise Ø${td}mm trop large pour feuillure ${ringW.toFixed(1)}mm — utiliser Ø≤${(ringW).toFixed(1)}mm`);
      }
      const ringContours = [];
      for (let d = dMin; d <= dMax + 1e-6; d += stepOver) {
        const c = gen.insetContour(bodyPts, d);
        if (c.length > 2) ringContours.push(c);
      }
      if (ringContours.length) gen.cutContoursInterleaved(ringContours, 'center', t('gcode.op_body_rabbet_ext'));
    }

    // 2. Cavité corps
    // rabbetSide=0 : la feuillure a usiné tout l'intérieur → on repart du fond (depthStart=rabbetDepth)
    // rabbetSide=1 : la feuillure n'a usiné que l'anneau extérieur → intérieur vierge, depthStart=0
    const cavDepthStart = rabbetSide === 0 ? rabbetDepth : 0;
    const cavW = W - 2 * wallThickness, cavH = D - 2 * wallThickness;
    if (cavW > 0 && cavH > 0) {
      gen.machine.materialThickness = height - bFl;
      doPocket(gen.insetContour(bodyPts, wallThickness), t('gcode.op_body_cavity'), cavDepthStart);
    }

    gen.machine.materialThickness = savedT;  // épaisseur stock réelle (inclut offset)
    if (tabOpts) gen.cutContourWithTabs(bodyPts, 'outside', tabOpts, entryOpts, t('gcode.op_body_contour'));
    else         gen.cutContour(bodyPts, 'outside', entryOpts, t('gcode.op_body_contour'));

    // ═══════════════════════════════════════════════════════════════════════
    // COUVERCLE
    // ═══════════════════════════════════════════════════════════════════════
    gen.comment('');
    gen.comment('═══ COUVERCLE ═══');

    // Décale le couvercle par rapport au corps
    const lidGap       = 20;
    const savedOriginX = gen.machine.originX;
    const savedOriginY = gen.machine.originY ?? 0;
    if (!machineParams.lidAtOrigin) {
      const useVertical = Math.max(W, 2*D + lidGap) < Math.max(2*W + lidGap, D);
      if (useVertical) {
        gen.machine.originY = savedOriginY + D + lidGap;
        gen.comment(`Couvercle décalé Y+${(D + lidGap).toFixed(0)}mm — layout vertical`);
      } else {
        gen.machine.originX = savedOriginX + W + lidGap;
        gen.comment(`Couvercle décalé X+${(W + lidGap).toFixed(0)}mm — layout horizontal`);
      }
    }

    if (rabbetSide === 0) {
      // Couvercle réduit : inset nominal (wt-r), lèvre = r s'emboîte dans rainure r+jeu
      const inset0 = wallThickness - rabbet;
      gen.comment(`Couvercle réduit: inset ${inset0.toFixed(1)}mm/côté (lèvre nominale ${rabbet}mm)`);
      const lidPts = mirrorPts(gen.insetContour(bodyPts, inset0));
      // 1. Cavité intérieure (la lèvre est formée naturellement par contour + cavité)
      const lidCavDepth0 = lidHeight - bFll;
      if (lidCavDepth0 > 0 && W > 2 * wallThickness) {
        gen.machine.materialThickness = lidCavDepth0;
        const lidInnerPts0 = mirrorPts(gen.insetContour(bodyPts, wallThickness));
        if (lidInnerPts0.length > 2) doPocket(lidInnerPts0, t('gcode.op_lid_cavity'));
      }
      // 2. Contour extérieur (dernière opération)
      gen.machine.materialThickness = savedT;  // épaisseur stock réelle (inclut offset)
      if (tabOpts) gen.cutContourWithTabs(lidPts, 'outside', tabOpts, entryOpts, t('gcode.op_lid_contour'));
      else         gen.cutContour(lidPts, 'outside', entryOpts, t('gcode.op_lid_contour'));
    } else {
      // Couvercle plein nominal : taille = corps, lèvre r s'emboîte dans rainure r+jeu
      gen.comment(`Couvercle plein: taille nominale (lèvre ${rabbet}mm, rainure ${rabbet}+${clearance}mm)`);
      const lidPts1 = mirrorPts(bodyPts);
      // 1. Feuillure (peu profond)
      if (W > 2 * rabbet && D > 2 * rabbet) {
        gen.machine.materialThickness = rabbetDepth;
        doPocket(mirrorPts(gen.insetContour(bodyPts, rabbet)), t('gcode.op_lid_rabbet_pocket'));
      }
      // 2. Cavité (depthStart=rabbetDepth, feuillure déjà usinée)
      const lidCavDepth1 = lidHeight - bFll;
      if (lidCavDepth1 > 0 && W > 2 * wallThickness) {
        gen.machine.materialThickness = lidCavDepth1;
        const lidInnerPts1 = mirrorPts(gen.insetContour(bodyPts, wallThickness));
        if (lidInnerPts1.length > 2) doPocket(lidInnerPts1, t('gcode.op_lid_cavity'), rabbetDepth);
      }
      // 3. Contour extérieur (dernière opération)
      gen.machine.materialThickness = savedT;  // épaisseur stock réelle (inclut offset)
      if (tabOpts) gen.cutContourWithTabs(lidPts1, 'outside', tabOpts, entryOpts, t('gcode.op_lid_contour'));
      else         gen.cutContour(lidPts1, 'outside', entryOpts, t('gcode.op_lid_contour'));
    }
    gen.machine.originX = savedOriginX;
    gen.machine.originY = savedOriginY;
    gen.machine.materialThickness = savedT;

    gen.footer();
    return gen.getCode();
  }

  getGCodeBoundingBox(shape, _params, machineParams) {
    if (machineParams?.lidAtOrigin) {
      const bb = shape.getBoundingBox();
      return { minX: 0, minY: 0, maxX: bb.width, maxY: bb.height, width: bb.width, height: bb.height };
    }
    const bb  = shape.getBoundingBox();
    const W = bb.width, D = bb.height;
    const lidGap = 20;
    const useVertical = Math.max(W, 2*D + lidGap) < Math.max(2*W + lidGap, D);
    if (useVertical) {
      return { minX: 0, minY: 0, maxX: W,            maxY: 2*D + lidGap, width: W,            height: 2*D + lidGap };
    } else {
      return { minX: 0, minY: 0, maxX: 2*W + lidGap, maxY: D,            width: 2*W + lidGap, height: D };
    }
  }

  getFlatPanels(shape, params) {
    const { height = 40, lidHeight = 15, wallThickness = 6, rabbet = 3, rabbetSide = 0 } = params;
    const bb  = shape.getBoundingBox();
    const gap = 20;

    // Pour couvercle réduit (rabbetSide=0), le contour est inséré de (wt-r) par côté
    const inset = rabbetSide === 0 ? (wallThickness - rabbet) : 0;
    const lidW  = bb.width  - 2 * inset;
    const lidH  = bb.height - 2 * inset;

    const bodyPts = shape.getContourPoints();
    // Miroir appliqué APRÈS inset (même logique que generateGCode)
    const mirrorPts = pts => pts.map(p => ({ x: bb.width - p.x, y: p.y })).reverse();
    // Polyline pour le corps (évite les arcs SVG qui posent problème dans Fusion 360 et autres CAO)
    const bodyPath = bodyPts.map((p, i) =>
      `${i === 0 ? 'M' : 'L'}${p.x.toFixed(2)},${p.y.toFixed(2)}`
    ).join(' ') + ' Z';
    // Décalage canvas commun aux deux cas : normPath soustrait p.x du panneau,
    // donc on pré-ajoute (bb.width+gap) pour que les coords locales soient correctes
    // même quand le premier point du contour n'est pas à (0,0) (ex: coins arrondis).
    const canvasOffX = bb.width + gap;
    let lidPath;
    if (rabbetSide === 0) {
      const gen = new GCodeGenerator();
      const lidPts = mirrorPts(gen.insetContour(bodyPts, inset));
      lidPath = lidPts.length > 2
        ? lidPts.map((p, i) =>
            `${i === 0 ? 'M' : 'L'}${(p.x + canvasOffX).toFixed(2)},${p.y.toFixed(2)}`
          ).join(' ') + ' Z'
        : `M0,0 L${lidW},0 L${lidW},${lidH} L0,${lidH} Z`;
    } else {
      // Même décalage canvas pour que normPath normalise correctement
      const lidPtsMirror = mirrorPts(bodyPts);
      lidPath = lidPtsMirror
        .map((p, i) => `${i === 0 ? 'M' : 'L'}${(p.x + canvasOffX).toFixed(2)},${p.y.toFixed(2)}`)
        .join(' ') + ' Z';
    }

    return [
      {
        id: 'body', label: `Corps (H=${height}mm)`,
        x: 0, y: 0, width: bb.width, height: bb.height,
        path: bodyPath, color: '#4a9eff'
      },
      {
        id: 'lid', label: `Couvercle (H=${lidHeight}mm)`,
        x: bb.width + gap + inset, y: inset, width: lidW, height: lidH,
        path: lidPath, color: '#4affcc'
      }
    ];
  }
}