import { GCodeGenerator } from '../gcode/GCodeGenerator.js';
import { pocketConcentric } from '../gcode/PocketConcentric.js';
import { buildPartitionContours } from '../gcode/PartitionedPocket.js';
import { insetPolygon, offsetPolygons, unionPolygons, roundCorners, clipToRegion, signedArea, distToPolygon } from '../gcode/Offset.js';
import { t } from '../i18n.js';

/**
 * Rayon de coin minimum de la lèvre (partie mâle de la feuillure) : Ø/2 + 0,4 mm. Un coin vif
 * ne s'emboîte pas dans son logement, dont la fraise arrondit forcément les coins.
 */
export const lipRadius = toolDiameter => toolDiameter / 2 + 0.4;

/** Lèvre : contour décalé de d vers l'intérieur, coins arrondis au rayon minimum. */
export function lipContour(bodyPts, d, toolDiameter) {
  return roundCorners(insetPolygon(bodyPts, d), lipRadius(toolDiameter));
}

/** Épaisseur minimale d'une cloison (mm) : en dessous, trop fragile à fraiser. */
export const MIN_PARTITION_THICKNESS = 3;

/**
 * Épaisseur des cloisons de la boîte à couvercle : elles prolongent le profil de la paroi vu depuis
 * la cavité. Feuillure intérieure : la largeur de la feuillure. Feuillure extérieure : ce qui reste
 * de la paroi à pleine hauteur (paroi − feuillure). Au moins MIN_PARTITION_THICKNESS, sans dépasser
 * l'épaisseur des parois.
 */
export function lidPartitionThickness(params) {
  const wt = params.wallThickness ?? 6, rb = params.rabbet ?? 3;
  if (!(rb > 0)) return wt;
  const exterior = Number(params.rabbetSide) === 1;
  const raw = exterior ? wt - rb : Math.min(rb, wt);
  return Math.min(Math.max(raw, MIN_PARTITION_THICKNESS), wt);
}

/** Logement de la lèvre (lèvre + jeu) : même rayon minimum, plus le jeu. */
export function lipSeat(bodyPts, d, toolDiameter, clearance) {
  return roundCorners(insetPolygon(bodyPts, d), lipRadius(toolDiameter) + Math.max(clearance, 0));
}

/**
 * Boîte avec couvercle à double feuillure.
 *
 * Corps  : feuillure sur le bord intérieur haut (largeur=rabbet, profondeur=rabbetDepth)
 * Couvercle : poche centrale laissant une lèvre extérieure (largeur=rabbet, hauteur=rabbetDepth)
 * → La lèvre du couvercle s'enfile dans la feuillure du corps.
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
      { id: 'clearance',          label: 'param.clearance',   min: 0, max: 2,   step: 0.1, unit: 'mm', value: 0.4 },
      { id: 'partitions',   label: 'param.partitions',    min: 0, max: 5, step: 1, unit: '', value: 0 },
      {
        id: 'partitionDir', label: 'param.partition_dir', type: 'select', unit: '',
        options: [
          { value: 'vertical',   label: 'option.partition_vertical' },
          { value: 'horizontal', label: 'option.partition_horizontal' }
        ]
      },
      // Répartition des compartiments en % (« 60/40 ») ; vide = parts égales
      { id: 'partitionSplit', label: 'param.partition_split', type: 'text', unit: '', value: '', placeholder: 'param.partition_split_ph' }
    ];
  }

  generateGCode(shape, params, machineParams) {
    const gen = new GCodeGenerator(machineParams);
    const { height = 40, lidHeight = 15, wallThickness = 6, rabbet = 3, rabbetSide = 0, clearance = 0.4 } = params;
    const partitions   = params.partitions   ?? 0;
    const partitionDir = (params.partitionDir === 'horizontal') ? 'horizontal' : 'vertical';
    const rabbetDepth = params.rabbetDepth ?? 4;
    const bb   = shape.getBoundingBox();
    const W    = bb.width, D = bb.height;
    const bt   = machineParams.materialThickness;
    const bFl  = params.bottomThickness    ?? bt;  // épaisseur fond corps
    const bFll = params.lidBottomThickness ?? bt;  // épaisseur fond couvercle

    const sideLabel = rabbetSide === 0 ? 'feuillure intérieure' : 'feuillure extérieure';
    gen.header(
      `Boîte couvercle — ${W.toFixed(0)}×${D.toFixed(0)}mm ` +
      `corps ${height}mm + couvercle ${lidHeight}mm`
    );
    gen.comment(`Paroi: ${wallThickness}mm | Fond corps: ${bFl}mm | Fond couvercle: ${bFll}mm | Feuillure: larg=${rabbet}mm prof=${rabbetDepth}mm (${sideLabel})`);
    gen.emit('');

    const tabOpts   = machineParams.tabOpts;
    const entryOpts = machineParams.entryOpts ?? {};
    const bodyPts   = shape.getContourPoints();
    const arcDef    = shape.getArcDef ? shape.getArcDef() : null;
    // Miroir horizontal appliqué APRÈS calcul d'inset : mirror(inset(P)) et non inset(mirror(P)).
    // Les deux ne sont pas équivalents pour les formes asymétriques (bisectrice différente).
    // Après retournement physique du couvercle, le contour miroir s'aligne exactement avec le corps.
    const mirrorPts = pts => pts.map(p => ({ x: W - p.x, y: p.y })).reverse();
    const savedT    = gen.machine.materialThickness;
    // Hauteurs de découpe de chaque pièce : sa propre hauteur + le surplus de brut éventuel.
    // Hauteurs différentes → deux bruts (avertissement à l'export) : le contour du couvercle
    // ne doit pas descendre à l'épaisseur du corps (il entrerait dans le martyr), et
    // inversement. Hauteurs égales : inchangé (= savedT).
    const stockExtra = Math.max(0, savedT - Math.max(height, lidHeight));
    // Hauteurs différentes : un surplus de brut par pièce (champs « Brut + » corps / couvercle)
    const bodyT = height    + (machineParams.stockExtraBody ?? stockExtra);
    const lidT  = lidHeight + (machineParams.stockExtraLid  ?? stockExtra);
    // Z0 en bas du brut (zOffset > 0) : chaque brut a sa propre épaisseur, donc son propre
    // décalage (le dessus du brut est à son épaisseur). Sans cela, le couvercle plus mince
    // n'était fraisé que jusqu'à Z = (épaisseur du corps − la sienne) au-dessus de son fond.
    // Z0 en haut du brut (zOffset = 0) : dessus de chaque brut à Z0, rien à décaler.
    const zOffBase = gen.machine.zOffset;
    const zOffFor  = T => (zOffBase > 0 ? zOffBase - (savedT - T) : zOffBase);
    gen.machine.zOffset = zOffFor(bodyT);
    const fa = machineParams.finishAllowance ?? 0;
    const doPocket = machineParams.pocketConc
      ? (pts, lbl, ds = 0) => pocketConcentric(gen, pts, lbl, ds, fa)
      : (pts, lbl, ds = 0) => gen.pocketShape(pts, lbl, ds, fa);

    // ═══════════════════════════════════════════════════════════════════════
    // CORPS
    // ═══════════════════════════════════════════════════════════════════════
    gen.comment('═══ CORPS ═══');

    // 1. Feuillure corps (peu profond — doit précéder la cavité)
    gen.machine.materialThickness = rabbetDepth;
    if (rabbetSide === 0) {
      // Logement de la lèvre du couvercle : coins au rayon de la lèvre + jeu
      doPocket(lipSeat(bodyPts, wallThickness - rabbet - clearance, gen.machine.toolDiameter, clearance), t('gcode.op_body_rabbet'));
    } else {
      // Feuillure extérieure : creuse l'anneau périphérique (passes concentriques)
      const td = gen.machine.toolDiameter;
      const ringW = rabbet + clearance;
      const dMin = td / 2;
      const dMax = ringW - td / 2;
      if (dMin > dMax + 1e-6) {
        gen.comment(`ATTENTION: fraise Ø${td}mm trop large pour feuillure ${ringW.toFixed(1)}mm — utiliser Ø≤${(ringW).toFixed(1)}mm`);
      }
      // Lèvre (partie qui reste haute, côté intérieur de la feuillure) : rayon de coin d'au moins
      // Ø/2 + 0,4 mm. Un coin vif ne peut pas s'emboîter dans la poche du couvercle, dont la
      // fraise arrondit forcément les coins. Si le contour a déjà des coins assez ronds,
      // `lip === lipRaw` et rien ne change.
      const lipRaw = gen.insetContour(bodyPts, ringW);
      const lip    = roundCorners(lipRaw, lipRadius(td));
      const rounded = lip !== lipRaw && lip.length > 2;
      // Anneaux jusqu'au bord exact de la feuillure (pas resserré dans les coins)
      const inset = d => gen.insetContour(bodyPts, d);
      // Coin de lèvre arrondi : l'anneau extérieur suit le contour (décalé de d), les autres
      // suivent la lèvre agrandie (arrondis concentriques à celui de la lèvre), rognés par
      // l'anneau extérieur. Dans les coins, des anneaux intermédiaires s'ajoutent tant que
      // l'écart avec l'anneau extérieur dépasse 0,6 Ø (sinon il resterait de la matière).
      const around = e => offsetPolygons(lip, e, { join: 'round' })[0] ?? [];
      const hug    = (d, e) => unionPolygons(inset(d), around(e));
      const bandRings = ds => {            // ds : distances au contour, de l'extérieur vers la lèvre
        if (ds.length < 2) return ds.map(d => hug(d, ringW - d));
        const outer = inset(ds[0]);
        if (outer.length < 3) return [];
        const clip = e => clipToRegion(around(e), outer)
          .sort((p, q) => Math.abs(signedArea(q)) - Math.abs(signedArea(p)))[0] ?? [];
        const gap = ring => (ring.length < 3 ? 0 : Math.max(...outer.map(v => distToPolygon(v, ring))));
        const es = ds.slice(1).map(d => ringW - d);            // extérieur → lèvre
        const maxStep = 0.6 * td;
        let eOut = es[0], ringOut = clip(eOut);
        const extra = [];
        for (let k = 0; k < 20 && ringOut.length > 2 && gap(ringOut) > maxStep; k++) {
          eOut += maxStep;
          ringOut = clip(eOut);
          if (ringOut.length > 2) extra.unshift(ringOut);
        }
        return [outer, ...extra, ...es.map(clip)];
      };
      const faRing = entryOpts.finishAllowance ?? 0;
      if (dMin > dMax + 1e-6) {
        // rien à usiner : la fraise est plus large que la feuillure
      } else if (faRing > 0) {
        // Ébauche à faRing des deux parois, puis finition sur chacune (bords exacts)
        const lo = dMin + faRing, hi = dMax - faRing;
        const roughD = hi >= lo - 1e-9 ? gen.ringInsets(bodyPts, lo, hi) : [(dMin + dMax) / 2];
        const finD = dMax - dMin > 1e-6 ? [dMin, dMax] : [dMin];
        const rough = rounded ? bandRings(roughD) : roughD.map(inset);
        const fin = rounded ? finD.map(d => (d === dMax && finD.length > 1 ? around(td / 2) : hug(d, td / 2))) : finD.map(inset);
        gen.cutBandRings(rough.filter(c => c.length > 2), fin.filter(c => c.length > 2), t('gcode.op_body_rabbet_ext'));
      } else {
        // Sans finition : mêmes anneaux, avec le détour dans les coins vifs à la dernière passe
        const ds = gen.ringInsets(bodyPts, dMin, dMax);
        const rings = rounded ? bandRings(ds) : ds.map(inset);
        gen.cutBandRings(rings.filter(c => c.length > 2), [], t('gcode.op_body_rabbet_ext'));
      }
    }

    // 2. Cavité corps
    // rabbetSide=0 : la feuillure a usiné tout l'intérieur → on repart du fond (depthStart=rabbetDepth)
    // rabbetSide=1 : la feuillure n'a usiné que l'anneau extérieur → intérieur vierge, depthStart=0
    const cavDepthStart = rabbetSide === 0 ? rabbetDepth : 0;
    const cavW = W - 2 * wallThickness, cavH = D - 2 * wallThickness;
    if (cavW > 0 && cavH > 0) {
      gen.machine.materialThickness = height - bFl;
      if (partitions > 0) {
        const cells = buildPartitionContours(W, D, wallThickness, partitions, partitionDir, machineParams.toolDiameter,
          { minX: bb.minX, minY: bb.minY, cavity: gen.insetContour(bodyPts, wallThickness), split: params.partitionSplit,
            partitionThickness: lidPartitionThickness(params) });
        if (cells) {
          cells.forEach((cellPts, i) => doPocket(cellPts, `${t('gcode.op_body_compartment')} ${i + 1}`, cavDepthStart));
        } else {
          doPocket(gen.insetContour(bodyPts, wallThickness), t('gcode.op_body_cavity'), cavDepthStart);
        }
      } else {
        doPocket(gen.insetContour(bodyPts, wallThickness), t('gcode.op_body_cavity'), cavDepthStart);
      }
    }

    gen.machine.materialThickness = bodyT;  // hauteur du corps (+ surplus de brut)
    gen.cutOutline(bodyPts, 'outside', entryOpts, t('gcode.op_body_contour'), tabOpts, arcDef);

    // ═══════════════════════════════════════════════════════════════════════
    // COUVERCLE
    // ═══════════════════════════════════════════════════════════════════════
    gen.comment('');
    gen.comment('═══ COUVERCLE ═══');
    gen.machine.zOffset = zOffFor(lidT);   // brut du couvercle (voir ci-dessus)

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
      // Couvercle réduit : inset nominal (wt-r), lèvre = r s'emboîte dans feuillure r+jeu
      const inset0 = wallThickness - rabbet;
      gen.comment(`Couvercle réduit: inset ${inset0.toFixed(1)}mm/côté (lèvre nominale ${rabbet}mm)`);
      // Lèvre du couvercle : coins au rayon minimum (s'emboîte dans le logement du corps)
      const lidPts = mirrorPts(lipContour(bodyPts, inset0, gen.machine.toolDiameter));
      // 1. Cavité intérieure (la lèvre est formée naturellement par contour + cavité)
      const lidCavDepth0 = lidHeight - bFll;
      if (lidCavDepth0 > 0 && W > 2 * wallThickness) {
        gen.machine.materialThickness = lidCavDepth0;
        const lidInnerPts0 = mirrorPts(gen.insetContour(bodyPts, wallThickness));
        if (lidInnerPts0.length > 2) doPocket(lidInnerPts0, t('gcode.op_lid_cavity'));
      }
      // 2. Contour extérieur (dernière opération)
      gen.machine.materialThickness = lidT;   // hauteur du couvercle (+ surplus de brut)
      gen.cutOutline(lidPts, 'outside', entryOpts, t('gcode.op_lid_contour'), tabOpts,
        arcDef && { ...arcDef, r: arcDef.r - inset0 });
    } else {
      // Couvercle plein nominal : taille = corps, lèvre r s'emboîte dans feuillure r+jeu
      gen.comment(`Couvercle plein: taille nominale (lèvre ${rabbet}mm, feuillure ${rabbet}+${clearance}mm)`);
      const lidPts1 = mirrorPts(bodyPts);
      // 1. Feuillure (peu profond)
      if (W > 2 * rabbet && D > 2 * rabbet) {
        gen.machine.materialThickness = rabbetDepth;
        // Logement de la lèvre du corps : coins au rayon de la lèvre + jeu
        doPocket(mirrorPts(lipSeat(bodyPts, rabbet, gen.machine.toolDiameter, clearance)), t('gcode.op_lid_rabbet_pocket'));
      }
      // 2. Cavité (depthStart=rabbetDepth, feuillure déjà usinée)
      const lidCavDepth1 = lidHeight - bFll;
      if (lidCavDepth1 > 0 && W > 2 * wallThickness) {
        gen.machine.materialThickness = lidCavDepth1;
        const lidInnerPts1 = mirrorPts(gen.insetContour(bodyPts, wallThickness));
        if (lidInnerPts1.length > 2) doPocket(lidInnerPts1, t('gcode.op_lid_cavity'), rabbetDepth);
      }
      // 3. Contour extérieur (dernière opération)
      gen.machine.materialThickness = lidT;   // hauteur du couvercle (+ surplus de brut)
      gen.cutOutline(lidPts1, 'outside', entryOpts, t('gcode.op_lid_contour'), tabOpts, arcDef);
    }
    gen.machine.originX = savedOriginX;
    gen.machine.originY = savedOriginY;
    gen.machine.materialThickness = savedT;

    gen.footer();
    return gen.getCode();
  }

  /**
   * Contours théoriques pour la simulation : corps à l'origine, couvercle décalé comme
   * dans le G-code (même règle de disposition que generateGCode), coordonnées de la forme.
   */
  getDrawing(shape, params, machineParams = {}) {
    const { wallThickness = 6, rabbet = 3, rabbetSide = 0 } = params;
    const bb = shape.getBoundingBox();
    const W = bb.width, D = bb.height, lidGap = 20;
    const bodyPts = shape.getContourPoints();
    const mirrorPts = pts => pts.map(p => ({ x: W - p.x, y: p.y })).reverse();
    let dx = 0, dy = 0;
    if (!machineParams.lidAtOrigin) {
      const useVertical = Math.max(W, 2 * D + lidGap) < Math.max(2 * W + lidGap, D);
      if (useVertical) dy = D + lidGap; else dx = W + lidGap;
    }
    const shift = pts => pts.map(p => ({ x: p.x + dx, y: p.y + dy }));
    const lidOuter = rabbetSide === 0
      ? mirrorPts(lipContour(bodyPts, wallThickness - rabbet, machineParams.toolDiameter ?? 3.175)) : mirrorPts(bodyPts);
    const cavity = insetPolygon(bodyPts, wallThickness);
    // part : pièce à laquelle appartient le contour (simulation pièce par pièce)
    const items = [{ pts: bodyPts, face: 1, outer: true, part: 'body' }];
    // Corps : compartiments s'il y a des cloisons, sinon la cavité
    const partitionDir = params.partitionDir === 'horizontal' ? 'horizontal' : 'vertical';
    const cells = (params.partitions ?? 0) > 0
      ? buildPartitionContours(W, D, wallThickness, params.partitions,
          partitionDir, machineParams.toolDiameter ?? 3.175,
          { minX: bb.minX, minY: bb.minY, cavity, split: params.partitionSplit,
            partitionThickness: lidPartitionThickness(params) })
      : null;
    for (const c of cells ?? (cavity.length > 2 ? [cavity] : [])) items.push({ pts: c, face: 1, part: 'body' });
    if (cavity.length > 2) items.push({ pts: shift(mirrorPts(cavity)), face: 1, part: 'lid' });
    if (lidOuter.length > 2) items.push({ pts: shift(lidOuter), face: 1, outer: true, part: 'lid' });
    return items;
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

}