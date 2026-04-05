import { GCodeGenerator } from '../gcode/GCodeGenerator.js';
import { t } from '../i18n.js';

/**
 * Boîte à encoches — port direct de box_generator.js (TabTools)
 *
 * Algorithme :
 *  - Nombre d'encoches toujours IMPAIR  → coins symétriques
 *  - firstUp / lastUp = true            → coins au niveau de la surface
 *  - inverted = true pour les slots     → entailles vers l'intérieur
 *  - cutOff = true sur les bords des panneaux latéraux
 *    → supprime une épaisseur aux coins pour éviter les chevauchements
 *  - Panneaux latéraux démarrent à [t, t]  → s'insèrent entre avant/arrière
 */
export class FingerJointBox {
  static label = 'box.finger_joint';
  static icon  = 'finger-joint';

  getBoxParams() {
    return [
      { id: 'height',      label: 'param.height',        min: 10, max: 500, step: 1,    unit: 'mm', value: 50  },
      { id: 'thickness',   label: 'param.mat_thickness', min: 1,  max: 30,  step: 0.5,  unit: 'mm', value: 6   },
      { id: 'fingerWidth', label: 'param.finger_width',  min: 5,  max: 50,  step: 0.5,  unit: 'mm', value: 10  },
      { id: 'clearance',   label: 'param.clearance',     min: -0.5, max: 1, step: 0.05, unit: 'mm', value: 0.1 },
      { id: 'withLid',     label: 'param.with_lid',      type: 'checkbox',               value: true },
    ];
  }

  // ─── Port de TabTools (box_generator.js) ─────────────────────────────────

  /**
   * Génère les points relatifs [dx, dy] d'une série d'encoches.
   * Port direct de _generate_tabs_path().
   */
  _generateTabsRelative(tab_width, nb_tabs, thickness, opt) {
    const pts = [];
    for (let i = 1; i <= nb_tabs; i++) {
      if (opt.inverted) {
        if (i % 2 === 1) { // gap (slot / entaille)
          const hasLeft  = i !== 1      || !opt.firstUp;
          const hasRight = i !== nb_tabs || !opt.lastUp;
          if (hasLeft)  pts.push([0, thickness]);
          if (i === 1 || i === nb_tabs) {
            pts.push([tab_width - (opt.cutOff ? thickness : 0) - 0.5 * opt.backlash, 0]);
          } else {
            pts.push([tab_width - opt.backlash, 0]);
          }
          if (hasRight) pts.push([0, -thickness]);
        } else {            // tab plat
          pts.push([tab_width + opt.backlash, 0]);
        }
      } else {
        if (i % 2 === 1) { // tab (saillant)
          if (i !== 1 || !opt.firstUp)  pts.push([0, -thickness]);
          if (i === 1 || i === nb_tabs) {
            pts.push([tab_width - (opt.cutOff ? thickness : 0) + 0.5 * opt.backlash, 0]);
          } else {
            pts.push([tab_width + opt.backlash, 0]);
          }
          if (i !== nb_tabs || !opt.lastUp) pts.push([0, thickness]);
        } else {            // gap plat
          pts.push([tab_width - opt.backlash, 0]);
        }
      }
    }
    return pts;
  }

  /**
   * Calcule le nombre d'encoches (toujours impair) et génère le bord.
   * Port de TabTools.tabs().
   *
   * @param {number} length     - longueur du bord (mm)
   * @param {number} fw         - largeur nominale d'encoche (mm)
   * @param {number} t          - épaisseur matière (mm)
   * @param {object} options    - { direction, firstUp, lastUp, inverted, backlash, cutOff }
   * @returns {[number,number][]} - liste de mouvements relatifs [dx, dy]
   */
  _tabs(length, fw, t, options = {}) {
    const opt = {
      direction: 0, firstUp: false, lastUp: false,
      inverted: false, backlash: 0, cutOff: false,
      ...options,
    };

    let nb = Math.floor(length / fw);
    if (nb < 1) nb = 1;
    nb = nb - 1 + (nb % 2);           // toujours impair
    const tw = length / nb;            // largeur réelle d'encoche

    const pts = this._generateTabsRelative(tw, nb, t, opt);
    return this._rotatePath(pts, opt.direction);
  }

  /** Port de _rotate_path() */
  _rotatePath(points, direction) {
    switch (direction) {
      case 1: return points.map(([dx, dy]) => [-dy,  dx]);
      case 2: return points.map(([dx, dy]) => [-dx, -dy]);
      case 3: return points.map(([dx, dy]) => [ dy, -dx]);
      default: return points;
    }
  }

  // ─── Construction des panneaux ────────────────────────────────────────────
  // Chaque méthode retourne une liste de mouvements relatifs [dx, dy]
  // commençant par le point de départ (ex: [0, 0]).
  // Convention identique à box_generator.js.

  _bottom(W, D, fw, t, bl) {
    const o = { firstUp: true, lastUp: true, backlash: bl };
    const rel = [[0, 0]];
    rel.push(...this._tabs(W, fw, t, { ...o, direction: 0 }));
    rel.push(...this._tabs(D, fw, t, { ...o, direction: 1 }));
    rel.push(...this._tabs(W, fw, t, { ...o, direction: 2 }));
    rel.push(...this._tabs(D, fw, t, { ...o, direction: 3 }));
    return rel;
  }

  _frontWithTop(W, H, fw, t, bl) {
    const o = { firstUp: true, lastUp: true, backlash: bl };
    const rel = [[0, t]];
    rel.push(...this._tabs(W, fw, t, { ...o, direction: 0, inverted: true }));
    rel.push(...this._tabs(H - 2 * t, fw, t, { ...o, direction: 1 }));
    rel.push(...this._tabs(W, fw, t, { ...o, direction: 2, inverted: true }));
    rel.push(...this._tabs(H - 2 * t, fw, t, { ...o, direction: 3 }));
    return rel;
  }

  _frontWithoutTop(W, H, fw, t, bl) {
    const o = { firstUp: true, lastUp: true, backlash: bl };
    const rel = [[0, 0], [W, 0]];   // bord supérieur plat
    rel.push(...this._tabs(H - t, fw, t, { ...o, direction: 1 }));
    rel.push(...this._tabs(W, fw, t, { ...o, direction: 2, inverted: true }));
    rel.push(...this._tabs(H - t, fw, t, { ...o, direction: 3 }));
    return rel;
  }

  _sideWithTop(D, H, fw, t, bl) {
    const o = { firstUp: true, lastUp: true, backlash: bl };
    const rel = [[t, t]];           // décalé de t pour s'insérer entre avant/arrière
    rel.push(...this._tabs(D, fw, t, { ...o, direction: 0, inverted: true, cutOff: true }));
    rel.push(...this._tabs(H - 2 * t, fw, t, { ...o, direction: 1, inverted: true }));
    rel.push(...this._tabs(D, fw, t, { ...o, direction: 2, inverted: true, cutOff: true }));
    rel.push(...this._tabs(H - 2 * t, fw, t, { ...o, direction: 3, inverted: true }));
    return rel;
  }

  _sideWithoutTop(D, H, fw, t, bl) {
    const o = { firstUp: true, lastUp: true, backlash: bl };
    const rel = [[t, 0], [D - 2 * t, 0]];   // bord supérieur plat
    rel.push(...this._tabs(H - t, fw, t, { ...o, direction: 1, inverted: true }));
    rel.push(...this._tabs(D, fw, t, { ...o, direction: 2, inverted: true, cutOff: true }));
    rel.push(...this._tabs(H - t, fw, t, { ...o, direction: 3, inverted: true }));
    return rel;
  }

  // ─── Conversion relatif → absolu ──────────────────────────────────────────

  _toSVGPath(rel, ox = 0, oy = 0) {
    let x = ox, y = oy;
    return rel.map(([dx, dy], i) => {
      x += dx; y += dy;
      return `${i === 0 ? 'M' : 'L'}${x.toFixed(3)},${y.toFixed(3)}`;
    }).join(' ') + ' Z';
  }

  _toPoints(rel, ox = 0, oy = 0) {
    let x = ox, y = oy;
    return rel.map(([dx, dy]) => { x += dx; y += dy; return { x, y }; });
  }

  // ─── Vue 2D aplatie ───────────────────────────────────────────────────────

  getFlatPanels(shape, params) {
    const { height = 40, thickness = 6, fingerWidth = 10, clearance = 0.1, withLid = true } = params;
    const t = thickness, fw = fingerWidth, bl = clearance;
    const bb = shape.getBoundingBox();
    const W = bb.width, D = bb.height, H = height;
    const gap = 15;

    const frontRel = withLid ? this._frontWithTop(W, H, fw, t, bl)  : this._frontWithoutTop(W, H, fw, t, bl);
    const sideRel  = withLid ? this._sideWithTop(D, H, fw, t, bl)   : this._sideWithoutTop(D, H, fw, t, bl);

    const panels = [
      { id: 'bottom', label: 'panel.bottom', rel: this._bottom(W, D, fw, t, bl), x: 0,         y: 0,               color: '#4a9eff' },
      ...(withLid ? [{ id: 'top', label: 'panel.top', rel: this._bottom(W, D, fw, t, bl), x: W + gap, y: 0, color: '#4affcc' }] : []),
      { id: 'front',  label: 'panel.front',  rel: frontRel,                       x: 0,         y: D + gap,         color: '#ff9f4a' },
      { id: 'back',   label: 'panel.back',   rel: frontRel,                       x: W + gap,   y: D + gap,         color: '#ff9f4a' },
      { id: 'left',   label: 'panel.left',   rel: sideRel,                        x: 0,         y: D + H + 2 * gap, color: '#c04aff' },
      { id: 'right',  label: 'panel.right',  rel: sideRel,                        x: D + gap,   y: D + H + 2 * gap, color: '#c04aff' },
    ];

    return panels.map(p => {
      const path = this._toSVGPath(p.rel, p.x, p.y);
      const pts  = this._toPoints(p.rel, p.x, p.y);
      const xs = pts.map(q => q.x), ys = pts.map(q => q.y);
      const bMinX = Math.min(...xs), bMaxX = Math.max(...xs);
      const bMinY = Math.min(...ys), bMaxY = Math.max(...ys);
      return {
        ...p, path,
        width:  bMaxX - bMinX,
        height: bMaxY - bMinY,
        bMinX, bMinY, bMaxX, bMaxY,
      };
    });
  }

  // ─── Layout partagé G-code ────────────────────────────────────────────────

  _buildGCodeLayout(shape, params) {
    const { height = 40, thickness = 6, fingerWidth = 10, clearance = 0.1, withLid = true } = params;
    const t = thickness, fw = fingerWidth, bl = clearance;
    const bb = shape.getBoundingBox();
    const W = bb.width, D = bb.height, H = height;
    const gap = 20;

    const frontRel = withLid ? this._frontWithTop(W, H, fw, t, bl)  : this._frontWithoutTop(W, H, fw, t, bl);
    const sideRel  = withLid ? this._sideWithTop(D, H, fw, t, bl)   : this._sideWithoutTop(D, H, fw, t, bl);

    return [
      { label: 'Fond',          rel: this._bottom(W, D, fw, t, bl), ox: 0,       oy: 0 },
      ...(withLid ? [{ label: 'Couvercle', rel: this._bottom(W, D, fw, t, bl), ox: W + gap, oy: 0 }] : []),
      { label: 'Paroi avant',   rel: frontRel,                       ox: 0,       oy: D + gap },
      { label: 'Paroi arrière', rel: frontRel,                       ox: W + gap, oy: D + gap },
      { label: 'Côté gauche',   rel: sideRel,                        ox: 0,       oy: D + H + 2 * gap },
      { label: 'Côté droit',    rel: sideRel,                        ox: D + gap, oy: D + H + 2 * gap },
    ];
  }

  // Bounding box complète incluant les protrusions de tabs (valeurs négatives)
  // Utilisée pour calculer la taille de plaque conseillée.
  getSheetBoundingBox(shape, params) {
    const layout = this._buildGCodeLayout(shape, params);
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const p of layout) {
      const pts = this._toPoints(p.rel, p.ox, p.oy);
      for (const q of pts) {
        if (q.x < minX) minX = q.x;
        if (q.y < minY) minY = q.y;
        if (q.x > maxX) maxX = q.x;
        if (q.y > maxY) maxY = q.y;
      }
    }
    return { minX, minY, maxX, maxY, width: maxX - minX, height: maxY - minY };
  }

  getGCodeBoundingBox(shape, params) {
    const layout = this._buildGCodeLayout(shape, params);
    // minX/minY = 0 : le layout part toujours de l'origine (0,0).
    // Les encoches dépassent légèrement en négatif → on les ignore pour
    // que le gizmo se positionne sur le coin nominal du layout, pas sur
    // l'extrémité des dents.
    let minX = 0, minY = 0, maxX = -Infinity, maxY = -Infinity;
    for (const p of layout) {
      const pts = this._toPoints(p.rel, p.ox, p.oy);
      for (const q of pts) {
        if (q.x > maxX) maxX = q.x;
        if (q.y > maxY) maxY = q.y;
      }
    }
    return { minX, minY, maxX, maxY, width: maxX - minX, height: maxY - minY };
  }

  // ─── G-code ───────────────────────────────────────────────────────────────

  generateGCode(shape, params, machineParams) {
    const gen = new GCodeGenerator(machineParams);
    const { height = 40, fingerWidth = 10 } = params;
    const bb = shape.getBoundingBox();
    const W = bb.width, D = bb.height, H = height;

    const savedT = gen.machine.materialThickness;
    gen.machine.materialThickness = params.thickness ?? 6;

    const lidStr = (params.withLid ?? true) ? 'avec couvercle' : 'sans couvercle';
    gen.header(`Boîte encoches — ${W.toFixed(0)}×${D.toFixed(0)}×${H.toFixed(0)}mm (t=${(params.thickness ?? 6)}mm, ${lidStr})`);
    gen.comment(`Larg. encoche: ${fingerWidth}mm, Jeu: ${params.clearance ?? 0.1}mm`);
    gen.emit('');

    const layout    = this._buildGCodeLayout(shape, params);
    const tabOpts   = machineParams.tabOpts;
    const entryOpts = { ...(machineParams.entryOpts ?? {}), dogbone: true };

    for (const panel of layout) {
      const pts = this._toPoints(panel.rel, panel.ox, panel.oy);
      if (tabOpts) gen.cutContourWithTabs(pts, 'outside', tabOpts, entryOpts, t(panel.label));
      else         gen.cutContour(pts, 'outside', entryOpts, t(panel.label));
    }

    gen.machine.materialThickness = savedT;
    gen.footer();
    return gen.getCode();
  }
}
