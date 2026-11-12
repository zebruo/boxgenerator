import { t } from '../i18n.js';
import { buildPartitionContours } from '../gcode/PartitionedPocket.js';
import { insetPolygon } from '../gcode/Offset.js';

// Pièce d'illustration (boîte du dessous de l'empilable) : gris, comme dans l'aperçu 3D
const GHOST = '#8e8e96';

/**
 * TechnicalView — 4 vues orthogonales 2D avec cotes éditables
 *
 *  ┌──────────────┬──────────────┐
 *  │   DESSUS     │    FACE      │
 *  ├──────────────┼──────────────┤
 *  │    CÔTÉ      │  COUPE A-A   │
 *  └──────────────┴──────────────┘
 *
 *  Les cotes en jaune/gras sont cliquables → input inline → met à jour l'état.
 */
export class TechnicalView {
  constructor(canvas, onParamChange) {
    this.canvas = canvas;
    this.ctx    = canvas.getContext('2d');
    this.onParamChange = onParamChange; // (paramId, value, isShapeParam) => void
    this.hitAreas     = [];             // zones cliquables
    this._data        = null;
    this._activeInput = null;

    this.canvas.addEventListener('click',     e => this._onClick(e));
    this.canvas.addEventListener('mousemove', e => this._onHover(e));

    this.C = {
      bg:      '#333333',
      panel:   '#2e2e2e',
      wood:    '#7a5230',
      woodLt:  '#a06840',
      inner:   '#3d3d3d',
      rabbet:  '#2ab87a',
      dim:     '#f0c040',
      dimLine: '#6a6a6a',
      text:    '#c4c4c4',
      title:   '#7c7c7c',
      divider: '#444444',
    };
  }

  static COLORS_DARK = {
    bg:      '#333333',
    panel:   '#2e2e2e',
    wood:    '#7a5230',
    woodLt:  '#a06840',
    inner:   '#3d3d3d',
    rabbet:  '#2ab87a',
    dim:     '#f0c040',
    dimLine: '#6a6a6a',
    text:    '#c4c4c4',
    title:   '#7c7c7c',
    divider: '#444444',
  };

  static COLORS_LIGHT = {
    bg:      '#c6c6c6',
    panel:   '#d2d2d2',
    wood:    '#c8a060',
    woodLt:  '#d8b878',
    inner:   '#d6d6d6',
    rabbet:  '#008f70',
    dim:     '#7a6200',
    dimLine: '#959595',
    text:    '#1c1c1c',
    title:   '#3a3a3a',
    divider: '#c2c2c2',
  };

  setTheme(light) {
    this.C = light ? { ...TechnicalView.COLORS_LIGHT } : { ...TechnicalView.COLORS_DARK };
    if (this._data) this._draw();
  }

  resize(w, h) {
    this.canvas.width  = w;
    this.canvas.height = h;
    if (this._data) this._draw();
  }

  build(shape, boxTypeKey, boxParams, machineParams, boxType = null) {
    this._data = { shape, boxTypeKey, boxParams, machineParams, boxType };
    this._draw();
  }

  dispose() { this._removeOverlay(); }

  // ── Dessin principal ─────────────────────────────────────────────────────
  _draw() {
    if (!this._data) return;
    const { shape, boxTypeKey, boxParams, machineParams, boxType } = this._data;
    const ctx = this.ctx;
    const CW  = this.canvas.width;
    const CH  = this.canvas.height;

    this.hitAreas = [];
    ctx.fillStyle = this.C.bg;
    ctx.fillRect(0, 0, CW, CH);

    const bb   = shape.getBoundingBox();
    const W    = bb.width;
    const D    = bb.height;
    const H    = boxParams.height        ?? 30;
    const wt   = boxParams.wallThickness ?? machineParams.materialThickness ?? 6;
    const bt   = machineParams.materialThickness ?? 6;
    const bFl  = boxParams.bottomThickness    ?? bt;  // épaisseur fond corps
    const bFll = boxParams.lidBottomThickness ?? bFl;  // épaisseur fond couvercle
    const lidH = boxParams.lidHeight     ?? 0;
    const r    = boxParams.rabbet        ?? 0;
    const rD   = boxParams.rabbetDepth   ?? 4;
    const rim  = boxParams.stackRim      ?? wt;  // stackRim supprimé → fallback wallThickness
    const rimH = boxParams.rimHeight      ?? 0;   // hauteur du guide d'empilement
    const rs   = boxParams.rabbetSide    ?? 0;  // 0 = rainure intérieure, 1 = rainure extérieure
    const jeu  = boxParams.clearance     ?? 0; // jeu d'assemblage

    const qW = Math.floor(CW / 2);
    const qH = Math.floor(CH / 2);

    // Compartiments (cloisons) : mêmes contours que le G-code (découpés par la cavité)
    const nParts = boxParams.partitions ?? 0;
    const partDir = boxParams.partitionDir === 'horizontal' ? 'horizontal' : 'vertical';
    const cells = nParts > 0 && (boxTypeKey === 'open-tray' || boxTypeKey === 'lid-box')
      ? buildPartitionContours(W, D, wt, nParts, partDir, machineParams.toolDiameter ?? 3.175,
          { minX: bb.minX, minY: bb.minY, cavity: insetPolygon(shape.getContourPoints(), wt) })
      : null;

    // Modèle en couches (élévations et coupe) : étendue verticale réelle de ce qui est dessiné
    const layers = boxTypeKey === 'finger-joint' ? [] : this._layers(
      { shape, boxTypeKey, H, wt, bFl, bFll, lidH, r, rD, rimH, rs, jeu, cells });
    const zMin = layers.length ? Math.min(...layers.map(l => l.z0)) : 0;
    const zMax = layers.length ? Math.max(...layers.map(l => l.z1)) : H;
    const totalH = zMax - zMin;
    const pad    = 48;
    const maxWD  = Math.max(W, D) || 1;

    // Échelle vue DESSUS : contrainte par W (horizontal) et D (vertical)
    // Pour stackable : inclure les trous de goupille de chaque côté
    const regHoleDia    = boxParams.regHoleDia    ?? 6;
    const regHoleOffset = boxParams.regHoleOffset ?? 15;
    const topW = boxTypeKey === 'stackable'
      ? W + regHoleDia + 2 * regHoleOffset
      : W;
    const scTop = Math.min(
      (qW - pad * 2) / (topW || 1),
      (qH - pad * 2 - 20) / (D || 1)
    );

    // Échelle vues en élévation (FACE / CÔTÉ / COUPE) : contrainte par max(W,D) et H
    const scElev = Math.min(
      (qW - pad * 2) / maxWD,
      (qH - pad * 2 - 20) / (totalH || 1)
    );

    // Scale commun = le plus petit des deux pour cohérence visuelle entre vues
    const sc = Math.min(scTop, scElev);

    const nfo = { shape, bb, W, D, H, wt, bt, bFl, bFll, lidH, r, rD, rim, rimH, rs, jeu, sc, totalH, boxTypeKey, boxParams, cells, nParts, partDir, layers, zMin, zMax };

    if (boxTypeKey === 'finger-joint' && boxType) {
      this._viewFingerJoint(CW, CH, boxType, shape, boxParams);
      return;
    }

    this._viewDessus(0,  0,  qW, qH, nfo, t('view.top'));
    this._viewFace  (qW, 0,  qW, qH, nfo, t('view.front'));
    this._viewCote  (0,  qH, qW, qH, nfo, t('view.side'));
    this._viewCoupe (qW, qH, qW, qH, nfo, t('view.section'));

    // Séparateurs
    ctx.strokeStyle = this.C.divider;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(qW, 0);  ctx.lineTo(qW, CH);
    ctx.moveTo(0, qH);  ctx.lineTo(CW, qH);
    ctx.stroke();
  }

  // ── Fond de panneau + titre ───────────────────────────────────────────────
  _panelBg(ox, oy, qW, qH, title) {
    const ctx = this.ctx;
    ctx.fillStyle = this.C.panel;
    ctx.fillRect(ox + 1, oy + 1, qW - 2, qH - 2);
    ctx.font      = 'bold 10px monospace';
    ctx.fillStyle = this.C.title;
    ctx.textAlign = 'left';
    ctx.fillText(title, ox + 10, oy + 17);
  }

  // ── VUE 1 : Dessus ───────────────────────────────────────────────────────
  _viewDessus(ox, oy, qW, qH, nfo, title) {
    const { shape, bb, W, D, wt, sc, boxTypeKey, boxParams, cells } = nfo;
    this._panelBg(ox, oy, qW, qH, title);

    const ctx = this.ctx;
    const pts = shape.getContourPoints();
    const cx  = ox + qW / 2;
    const cy  = oy + qH / 2 + 10;
    // Origine de translation : centre du canvas − centre du bb. Axe Y vers le HAUT, comme
    // le G-code et l'aperçu 3D (le canvas a son Y vers le bas : on le retourne).
    const sx  = cx - (bb.minX + bb.maxX) * sc / 2;
    const sy  = cy + (bb.minY + bb.maxY) * sc / 2;
    const toX = x => sx + x * sc, toY = y => sy - y * sc;

    // Ancres réelles de la forme en coordonnées canvas
    const shapeL = toX(bb.minX);
    const shapeR = toX(bb.maxX);
    const shapeT = toY(bb.maxY);
    const shapeB = toY(bb.minY);

    // Forme extérieure
    ctx.save();
    ctx.translate(sx, sy);
    ctx.scale(sc, -sc);
    ctx.beginPath();
    pts.forEach((p, i) => i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y));
    ctx.closePath();
    ctx.fillStyle = this.C.wood;
    ctx.fill();
    ctx.strokeStyle = this.C.text;
    ctx.lineWidth = 1.2 / sc;
    ctx.stroke();

    // Cavité intérieure — ou compartiments s'il y a des cloisons
    if (boxTypeKey !== 'finger-joint') {
      const ip = insetPolygon(pts, wt);   // décalage Clipper : coins vifs si paroi > rayon de coin
      for (const poly of cells ?? [ip]) {
        if (poly.length <= 2) continue;
        ctx.beginPath();
        poly.forEach((p, i) => i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y));
        ctx.closePath();
        ctx.fillStyle = this.C.inner;
        ctx.fill();
        ctx.strokeStyle = this.C.dimLine;
        ctx.lineWidth = 0.7 / sc;
        ctx.stroke();
      }
    }

    // Boîte à couvercle réduit : contour du couvercle (posé dessus), en pointillés
    if (boxTypeKey === 'lid-box' && (boxParams.rabbetSide ?? 0) === 0 && nfo.lidH > 0) {
      const lid = insetPolygon(pts, wt - (boxParams.rabbet ?? 0));
      if (lid.length > 2) {
        ctx.beginPath();
        lid.forEach((p, i) => i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y));
        ctx.closePath();
        ctx.strokeStyle = this.C.rabbet;
        ctx.lineWidth = 1 / sc;
        ctx.setLineDash([4 / sc, 3 / sc]);
        ctx.stroke();
        ctx.setLineDash([]);
      }
    }
    ctx.restore();

    // Plan de coupe A-A (horizontal, au milieu) : trait mixte, flèches vers le sens de vue
    {
      const yA = toY((bb.minY + bb.maxY) / 2);
      const xa = shapeL - 16, xb = shapeR + 16;
      ctx.save();
      ctx.strokeStyle = this.C.dim;
      ctx.fillStyle = this.C.dim;
      ctx.lineWidth = 1;
      ctx.setLineDash([12, 3, 2, 3]);
      ctx.beginPath(); ctx.moveTo(xa, yA); ctx.lineTo(xb, yA); ctx.stroke();
      ctx.setLineDash([]);
      for (const x of [xa, xb]) {
        ctx.beginPath(); ctx.moveTo(x, yA); ctx.lineTo(x, yA - 12); ctx.stroke();
        this._arrV(x, yA - 12, -1);   // pointe vers le haut : coupe vue depuis l'avant
        ctx.font = 'bold 10px monospace';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'bottom';
        ctx.fillText('A', x, yA - 14);
      }
      ctx.restore();
    }

    // Rayon de coin : repère sur le coin le plus proche du haut-droit de la forme
    const cr = shape.params?.cornerRadius ?? 0;
    if (cr > 0 && boxTypeKey !== 'finger-joint') {
      const near = pts.reduce((best, p) =>
        (Math.hypot(p.x - bb.maxX, p.y - bb.maxY) < Math.hypot(best.x - bb.maxX, best.y - bb.maxY) ? p : best), pts[0]);
      const px = toX(near.x), py = toY(near.y);
      ctx.save();
      ctx.strokeStyle = this.C.dimLine;
      ctx.fillStyle = this.C.text;
      ctx.lineWidth = 0.8;
      ctx.beginPath(); ctx.moveTo(px, py); ctx.lineTo(px + 14, py - 14); ctx.lineTo(px + 22, py - 14); ctx.stroke();
      ctx.font = '10px monospace';
      ctx.textAlign = 'left';
      ctx.textBaseline = 'middle';
      ctx.fillText(t('view.corner_r', { val: cr.toFixed(1) }), px + 24, py - 14);
      ctx.restore();
    }

    // W (longueur) — dessous, lignes d'attache depuis le bord inférieur
    this._dimH(shapeL, shapeR, shapeB + 20,
      `${W.toFixed(1)} mm`, null, false, W, 1, 9999, shapeB);

    // D (largeur/profondeur) — droite, lignes d'attache depuis le bord droit
    this._dimV(shapeR + 20, shapeT, shapeB,
      `${D.toFixed(1)} mm`, null, false, D, 1, 9999, shapeR);

    // wt (épaisseur paroi) — gauche, du bord extérieur au bord intérieur supérieur
    if (boxTypeKey !== 'finger-joint' && wt > 0) {
      this._dimV(shapeL - 20, shapeT, shapeT + wt * sc,
        t('view.wall_thick', { val: wt.toFixed(1) }), null, false, wt, 1, 9999, shapeL);
    }

    // Goupilles de centrage (stackable)
    if (boxTypeKey === 'stackable') {
      const regHoleDia    = boxParams.regHoleDia    ?? 6;
      const regHoleOffset = boxParams.regHoleOffset ?? 15;
      const holeR   = regHoleDia / 2 * sc;
      const holeYC  = (shapeT + shapeB) / 2;
      const holeXL  = shapeL - (regHoleDia / 2 + regHoleOffset) * sc;
      const holeXR  = shapeR + (regHoleDia / 2 + regHoleOffset) * sc;

      ctx.save();
      ctx.strokeStyle = this.C.dimLine;
      ctx.fillStyle   = this.C.inner;
      ctx.lineWidth   = 1;
      for (const hx of [holeXL, holeXR]) {
        // Cercle
        ctx.beginPath(); ctx.arc(hx, holeYC, holeR, 0, Math.PI * 2);
        ctx.fill(); ctx.stroke();
        // Croix de centre
        ctx.beginPath();
        ctx.moveTo(hx - holeR * 1.5, holeYC); ctx.lineTo(hx + holeR * 1.5, holeYC);
        ctx.moveTo(hx, holeYC - holeR * 1.5); ctx.lineTo(hx, holeYC + holeR * 1.5);
        ctx.stroke();
      }
      // Cote offset gauche : du bord de la pièce au bord du trou
      const dimOffY = holeYC + holeR + 14;
      this._dimH(holeXL + holeR, shapeL, dimOffY,
        `${regHoleOffset.toFixed(0)}`, null, false, regHoleOffset);
      // Diamètre du trou
      ctx.font = '9px monospace'; ctx.fillStyle = this.C.dim;
      ctx.textAlign = 'center'; ctx.textBaseline = 'top';
      ctx.fillText(`Ø${regHoleDia.toFixed(0)}`, holeXL, holeYC + holeR + 3);
      ctx.restore();
    }
  }

  // ══ Modèle en couches (élévations et coupe) ═══════════════════════════════
  /**
   * Pièces décrites en tranches horizontales, en mm, repère de la forme (Y vers le haut),
   * z = hauteur depuis le dessous du corps : { z0, z1, outer:[poly], holes:[poly], part }.
   * part : 'body' | 'lid' | 'ghost'. Mêmes contours que le G-code (décalage Clipper).
   * Boîte à couvercle : couvercle assemblé (retourné), lèvre engagée de rD dans la feuillure.
   * Boîte empilable : boîte du dessous (part 'ghost') avec son plot, sous le plot.
   */
  _layers({ shape, boxTypeKey, H, wt, bFl, bFll, lidH, r, rD, rimH, rs, jeu, cells }) {
    const pts = shape.getContourPoints();
    const ok  = p => p && p.length > 2;
    const ins = d => (d > 1e-9 ? insetPolygon(pts, d) : pts);
    const cav = cells ?? [ins(wt)].filter(ok);
    const L = [];
    const add = (z0, z1, outer, holes, part = 'body') => {
      if (z1 - z0 > 1e-6) L.push({ z0, z1, outer: outer.filter(ok), holes: holes.filter(ok), part });
    };
    if (boxTypeKey === 'lid-box') {
      add(0, bFl, [pts], []);
      add(bFl, H - rD, [pts], cav);
      // Feuillure : intérieure (rs 0) → tout l'intérieur abaissé de rD (cloisons comprises) ;
      // extérieure (rs 1) → bord extérieur abaissé de rD
      if (rs === 0) add(H - rD, H, [pts], [ins(wt - r - jeu)]);
      else          add(H - rD, H, [ins(r + jeu)], cav);
      if (lidH > 0) {
        const zb = H - rD, top = zb + lidH, ceil = top - bFll;
        if (rs === 0) {
          const lo = ins(wt - r);
          add(zb, ceil, [lo], [ins(wt)], 'lid');
          add(ceil, top, [lo], [], 'lid');
        } else {
          add(zb, zb + rD, [pts], [ins(r)], 'lid');
          add(zb + rD, ceil, [pts], [ins(wt)], 'lid');
          add(ceil, top, [pts], [], 'lid');
        }
      }
    } else if (boxTypeKey === 'stackable') {
      const plot = ins(wt + jeu);
      const box = (dz, part) => {
        add(dz - rimH, dz, [plot], [], part);
        add(dz, dz + bFl, [pts], [], part);
        add(dz + bFl, dz + H, [pts], [ins(wt)], part);
      };
      box(0, 'body');
      box(-(H + rimH), 'ghost');
    } else {
      add(0, bFl, [pts], []);
      add(bFl, H, [pts], cav);
    }
    return L;
  }

  /** Intervalles de `poly` sur la ligne (axis 'x' : y = c ; 'y' : x = c), règle pair-impair. */
  static _cut(poly, axis, c) {
    const xs = [];
    for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
      const a = poly[i], b = poly[j];
      const [ua, va, ub, vb] = axis === 'x' ? [a.x, a.y, b.x, b.y] : [a.y, a.x, b.y, b.x];
      if ((va > c) !== (vb > c)) xs.push(ua + (c - va) * (ub - ua) / (vb - va));
    }
    xs.sort((p, q) => p - q);
    const iv = [];
    for (let k = 0; k + 1 < xs.length; k += 2) iv.push([xs[k], xs[k + 1]]);
    return iv;
  }

  /** Projection de `poly` sur l'axe (étendue min–max). */
  static _proj(poly, axis) {
    const v = poly.map(p => (axis === 'x' ? p.x : p.y));
    return [Math.min(...v), Math.max(...v)];
  }

  static _union(iv) {
    const s = iv.filter(([a, b]) => b - a > 1e-9).sort((p, q) => p[0] - q[0]);
    const out = [];
    for (const [a, b] of s) {
      if (out.length && a <= out[out.length - 1][1] + 1e-9) out[out.length - 1][1] = Math.max(out[out.length - 1][1], b);
      else out.push([a, b]);
    }
    return out;
  }

  /** a − b (intervalles triés, disjoints). */
  static _sub(a, b) {
    let res = a.map(i => [...i]);
    for (const [c, d] of b) {
      res = res.flatMap(([x, y]) => {
        if (d <= x || c >= y) return [[x, y]];
        const parts = [];
        if (c > x) parts.push([x, c]);
        if (d < y) parts.push([d, y]);
        return parts;
      });
    }
    return res.filter(([x, y]) => y - x > 1e-6);
  }

  /** Motif de hachures (matière coupée), recréé quand le thème change. */
  _hatch() {
    if (this._hatchFor === this.C.dimLine && this._hatchPat) return this._hatchPat;
    const c = document.createElement('canvas');
    c.width = c.height = 7;
    const g = c.getContext('2d');
    g.strokeStyle = this.C.dimLine;
    g.lineWidth = 1;
    g.beginPath(); g.moveTo(0, 7); g.lineTo(7, 0); g.moveTo(-1, 1); g.lineTo(1, -1); g.moveTo(6, 8); g.lineTo(8, 6); g.stroke();
    this._hatchPat = this.ctx.createPattern(c, 'repeat');
    this._hatchFor = this.C.dimLine;
    return this._hatchPat;
  }

  /**
   * Dessine un profil : couches { z0, z1, iv:[[a,b]], part, hidden?:[[a,b]] } (mm).
   * Remplissage, arêtes visibles (côtés de chaque intervalle + différences entre couches
   * voisines d'une même pièce), arêtes cachées en pointillés, hachures en coupe.
   */
  _drawProfile(prof, map, { hatch = false } = {}) {
    const ctx = this.ctx;
    const look = part => part === 'ghost'
      ? { fill: GHOST, alpha: 0.35, dash: [5, 3], stroke: GHOST }
      : { fill: part === 'lid' ? this.C.woodLt : this.C.wood, alpha: 1, dash: [], stroke: this.C.text };
    const rect = (a, b, z0, z1) => [map.u(a), map.z(z1), map.u(b) - map.u(a), map.z(z0) - map.z(z1)];

    // 1. Remplissage (+ hachures en coupe)
    for (const l of prof) {
      const s = look(l.part);
      ctx.save();
      ctx.globalAlpha = s.alpha;
      for (const [a, b] of l.iv) {
        ctx.fillStyle = s.fill;
        ctx.fillRect(...rect(a, b, l.z0, l.z1));
        if (hatch && l.part !== 'ghost') { ctx.fillStyle = this._hatch(); ctx.fillRect(...rect(a, b, l.z0, l.z1)); }
      }
      ctx.restore();
    }

    // 2. Arêtes visibles, pièce par pièce
    const eq = (p, q) => Math.abs(p - q) < 1e-6;
    for (const part of [...new Set(prof.map(l => l.part))]) {
      const ls = prof.filter(l => l.part === part);
      const s = look(part);
      ctx.save();
      ctx.globalAlpha = part === 'ghost' ? 0.6 : 1;
      ctx.strokeStyle = s.stroke;
      ctx.lineWidth = 1.1;
      ctx.setLineDash(s.dash);
      ctx.beginPath();
      for (const l of ls) for (const [a, b] of l.iv) {
        ctx.moveTo(map.u(a), map.z(l.z0)); ctx.lineTo(map.u(a), map.z(l.z1));
        ctx.moveTo(map.u(b), map.z(l.z0)); ctx.lineTo(map.u(b), map.z(l.z1));
      }
      const zs = [...new Set(ls.flatMap(l => [l.z0, l.z1]))];
      for (const z of zs) {
        const above = TechnicalView._union(ls.filter(l => eq(l.z0, z)).flatMap(l => l.iv));
        const below = TechnicalView._union(ls.filter(l => eq(l.z1, z)).flatMap(l => l.iv));
        const edges = [...TechnicalView._sub(above, below), ...TechnicalView._sub(below, above)];
        for (const [a, b] of edges) { ctx.moveTo(map.u(a), map.z(z)); ctx.lineTo(map.u(b), map.z(z)); }
      }
      ctx.stroke();
      ctx.restore();
    }

    // 3. Arêtes cachées (vues extérieures) : vides de la pièce, en pointillés fins
    ctx.save();
    ctx.strokeStyle = this.C.text;
    ctx.globalAlpha = 0.55;
    ctx.lineWidth = 0.7;
    ctx.setLineDash([4, 3]);
    for (const l of prof) {
      if (!l.hidden || l.part === 'ghost') continue;
      for (const [a, b] of l.hidden) ctx.strokeRect(...rect(a, b, l.z0, l.z1));
    }
    ctx.restore();
  }

  /**
   * Vue en élévation : 'face' (vue extérieure, vides en pointillés) ou 'section' (coupe
   * par la ligne A-A, matière hachurée). axis 'x' : vue de face (horizontale = X) ;
   * 'y' : vue de côté (horizontale = Y). Renvoie la projection pour placer les cotes.
   */
  _elev(ox, oy, qW, qH, nfo, title, axis, mode) {
    const { bb, sc, layers, zMin, zMax } = nfo;
    this._panelBg(ox, oy, qW, qH, title);
    const uMin = axis === 'x' ? bb.minX : bb.minY, uMax = axis === 'x' ? bb.maxX : bb.maxY;
    const x0 = ox + qW / 2 - (uMax - uMin) * sc / 2;
    const yBase = oy + qH / 2 + 10 + (zMax - zMin) * sc / 2;
    const map = { u: v => x0 + (v - uMin) * sc, z: v => yBase - (v - zMin) * sc };
    const c = axis === 'x' ? (bb.minY + bb.maxY) / 2 : (bb.minX + bb.maxX) / 2;
    const V = TechnicalView;
    const prof = layers.map(l => {
      if (mode === 'section') {
        const o = V._union(l.outer.flatMap(p => V._cut(p, axis, c)));
        const h = V._union(l.holes.flatMap(p => V._cut(p, axis, c)));
        return { ...l, iv: V._sub(o, h) };
      }
      return { ...l, iv: V._union(l.outer.map(p => V._proj(p, axis))), hidden: l.holes.map(p => V._proj(p, axis)) };
    });
    this._drawProfile(prof, map, { hatch: mode === 'section' });
    return { map, uMin, uMax, prof };
  }

  // ── VUE 2 : Face (extérieur, vides en pointillés) ────────────────────────
  _viewFace(ox, oy, qW, qH, nfo, title) {
    const { map, uMin, uMax } = this._elev(ox, oy, qW, qH, nfo, title, 'x', 'face');
    this._elevDims(nfo, map, uMin, uMax, 'x');
  }

  // ── VUE 3 : Côté (extérieur, vides en pointillés) ────────────────────────
  _viewCote(ox, oy, qW, qH, nfo, title) {
    const { map, uMin, uMax } = this._elev(ox, oy, qW, qH, nfo, title, 'y', 'face');
    this._elevDims(nfo, map, uMin, uMax, 'y');
  }

  /** Cotes communes aux vues extérieures : largeur, hauteurs (corps, couvercle, plot). */
  _elevDims(nfo, map, uMin, uMax, axis) {
    const { H, lidH, rD, rimH, wt, r, rs, boxTypeKey, zMin } = nfo;
    const L = map.u(uMin), R = map.u(uMax);
    const bottom = map.z(zMin);   // sous tout le dessin (boîte du dessous de l'empilable comprise)
    this._dimH(L, R, bottom + 18, `${(uMax - uMin).toFixed(1)} mm`, null, false, uMax - uMin, 1, 9999, bottom);
    this._dimV(L - 26, map.z(H), map.z(0), `${H.toFixed(1)} mm`, null, false, H, 1, 9999, L);
    if (boxTypeKey === 'lid-box' && lidH > 0) {
      const zb = H - rD;
      this._dimV(R + 26, map.z(zb + lidH), map.z(zb), `${lidH.toFixed(1)} mm`, null, false, lidH, 1, 9999, R);
      if (rs === 0) {   // couvercle réduit : sa largeur
        const w = uMax - uMin - 2 * (wt - r);
        this._dimH(map.u(uMin + wt - r), map.u(uMax - wt + r), map.z(zb + lidH) - 14, `${w.toFixed(1)} mm`, null, false, w);
      }
    }
    if (boxTypeKey === 'stackable' && rimH > 0) {
      this._dimV(L - 26, map.z(0), map.z(-rimH), `H ${rimH.toFixed(1)}`, null, false, rimH);
    }
  }

  // ── VUE 4 : Coupe A-A (matière hachurée) ─────────────────────────────────
  _viewCoupe(ox, oy, qW, qH, nfo, title) {
    const { H, bFl, bFll, lidH, r, rD, rimH, jeu, boxTypeKey } = nfo;
    const { map, prof } = this._elev(ox, oy, qW, qH, nfo, title, 'x', 'section');
    const ctx = this.ctx;

    // Paroi gauche réellement coupée (sur une forme inclinée, elle diffère de l'épaisseur nominale)
    const wall = prof.find(l => l.part === 'body' && l.z0 >= bFl - 1e-6 && l.iv.length > 1);
    if (wall) {
      const [a, b] = wall.iv[0];
      this._dimH(map.u(a), map.u(b), map.z(0) + 38,
        t('view.wall_thick', { val: (b - a).toFixed(1) }), null, false, b - a, 1, 9999, map.z(0));
      // Profondeur de la cavité, contre la paroi intérieure
      this._dimV(map.u(b) + 14, map.z(H), map.z(bFl), `${(H - bFl).toFixed(1)}`, null, false, H - bFl);
    }

    // Épaisseur du fond (texte à gauche)
    const left = Math.min(...prof.filter(l => l.part === 'body').flatMap(l => l.iv.map(i => i[0])));
    ctx.save();
    ctx.font = '9px monospace';
    ctx.fillStyle = this.C.dimLine;
    ctx.textAlign = 'right';
    ctx.textBaseline = 'middle';
    ctx.fillText(t('view.bottom_thick', { val: bFl.toFixed(1) }), map.u(left) - 5, map.z(bFl / 2));
    // Couvercle : hauteur et épaisseur du dessus
    if (boxTypeKey === 'lid-box' && lidH > 0) {
      const zb = H - rD;
      ctx.fillText(t('view.lid_top_thick', { val: bFll.toFixed(1) }), map.u(left) - 5, map.z(zb + lidH - bFll / 2));
    }
    ctx.restore();

    // Feuillure et jeu (boîte à couvercle), plot et jeu (boîte empilable) : légende
    const notes = [];
    if (boxTypeKey === 'lid-box' && r > 0) notes.push(t('view.rabbet_note', { r: r.toFixed(1), d: rD.toFixed(1), j: jeu.toFixed(2) }));
    if (boxTypeKey === 'stackable' && rimH > 0) notes.push(t('view.plot_note', { h: rimH.toFixed(1), j: jeu.toFixed(2) }));
    if (notes.length) {
      ctx.save();
      ctx.font = '9px monospace';
      ctx.fillStyle = this.C.text;
      ctx.textAlign = 'left';
      notes.forEach((n, i) => ctx.fillText(n, ox + 10, oy + 32 + i * 12));
      ctx.restore();
    }
  }

  // ── Cotes horizontales ────────────────────────────────────────────────────
  // extFromY : si fourni, trace des lignes d'attache (witness lines) du bord
  // de la forme (extFromY) jusqu'à la ligne de cote (y).
  _dimH(x1, x2, y, label, paramId, isShape, value, min = 1, max = 9999, extFromY = null) {
    const ctx       = this.ctx;
    const clickable = paramId != null;
    ctx.save();
    ctx.strokeStyle = this.C.dimLine;
    ctx.fillStyle   = this.C.dimLine;

    // Lignes d'attache (witness lines) depuis le bord de la forme
    if (extFromY != null) {
      ctx.lineWidth = 0.5;
      ctx.setLineDash([3, 2]);
      ctx.beginPath();
      ctx.moveTo(x1, extFromY); ctx.lineTo(x1, y);
      ctx.moveTo(x2, extFromY); ctx.lineTo(x2, y);
      ctx.stroke();
      ctx.setLineDash([]);
    }

    ctx.lineWidth = 0.8;
    // Tirets terminaux
    ctx.beginPath();
    ctx.moveTo(x1, y - 6); ctx.lineTo(x1, y + 6);
    ctx.moveTo(x2, y - 6); ctx.lineTo(x2, y + 6);
    ctx.stroke();

    // Ligne de cote
    ctx.beginPath();
    ctx.moveTo(x1, y); ctx.lineTo(x2, y);
    ctx.stroke();
    this._arrH(x1, y,  1);
    this._arrH(x2, y, -1);

    // Label
    const mx = (x1 + x2) / 2;
    ctx.font = `${clickable ? 'bold ' : ''}10px monospace`;
    const tw = ctx.measureText(label).width;
    const th = 13;
    ctx.fillStyle = this.C.panel;
    ctx.fillRect(mx - tw / 2 - 3, y - th / 2, tw + 6, th);
    ctx.fillStyle = clickable ? this.C.dim : this.C.text;
    ctx.textAlign    = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(label, mx, y);

    if (clickable) {
      this.hitAreas.push({
        x: mx - tw / 2 - 3, y: y - th / 2, w: tw + 6, h: th,
        cx: mx, cy: y, paramId, isShape, value, min, max
      });
    }
    ctx.restore();
  }

  // ── Cotes verticales ─────────────────────────────────────────────────────
  // extFromX : si fourni, trace des lignes d'attache depuis le bord de la forme.
  _dimV(x, y1, y2, label, paramId, isShape, value, min = 1, max = 9999, extFromX = null) {
    const ctx       = this.ctx;
    const clickable = paramId != null;
    ctx.save();
    ctx.strokeStyle = this.C.dimLine;
    ctx.fillStyle   = this.C.dimLine;

    // Lignes d'attache
    if (extFromX != null) {
      ctx.lineWidth = 0.5;
      ctx.setLineDash([3, 2]);
      ctx.beginPath();
      ctx.moveTo(extFromX, y1); ctx.lineTo(x, y1);
      ctx.moveTo(extFromX, y2); ctx.lineTo(x, y2);
      ctx.stroke();
      ctx.setLineDash([]);
    }

    ctx.lineWidth = 0.8;
    ctx.beginPath();
    ctx.moveTo(x - 6, y1); ctx.lineTo(x + 6, y1);
    ctx.moveTo(x - 6, y2); ctx.lineTo(x + 6, y2);
    ctx.stroke();

    ctx.beginPath();
    ctx.moveTo(x, y1); ctx.lineTo(x, y2);
    ctx.stroke();
    this._arrV(x, y1,  1);
    this._arrV(x, y2, -1);

    const my = (y1 + y2) / 2;
    ctx.save();
    ctx.translate(x, my);
    ctx.rotate(-Math.PI / 2);
    ctx.font = `${clickable ? 'bold ' : ''}10px monospace`;
    const tw = ctx.measureText(label).width;
    const th = 13;
    ctx.fillStyle = this.C.panel;
    ctx.fillRect(-tw / 2 - 3, -th / 2, tw + 6, th);
    ctx.fillStyle    = clickable ? this.C.dim : this.C.text;
    ctx.textAlign    = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(label, 0, 0);
    ctx.restore();

    if (clickable) {
      // Zone de clic : rectangle approximé en coordonnées canvas
      this.hitAreas.push({
        x: x - th / 2 - 4, y: my - tw / 2 - 3, w: th + 8, h: tw + 6,
        cx: x, cy: my, paramId, isShape, value, min, max
      });
    }
    ctx.restore();
  }

  // ── Flèches ───────────────────────────────────────────────────────────────
  _arrH(x, y, dir) {  // dir: +1 pointe à droite, -1 pointe à gauche
    const ctx = this.ctx;
    const s   = 5;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x + dir * s, y - s * 0.35);
    ctx.lineTo(x + dir * s, y + s * 0.35);
    ctx.closePath();
    ctx.fill();
  }

  _arrV(x, y, dir) {  // dir: +1 pointe en bas, -1 pointe en haut
    const ctx = this.ctx;
    const s   = 5;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x - s * 0.35, y + dir * s);
    ctx.lineTo(x + s * 0.35, y + dir * s);
    ctx.closePath();
    ctx.fill();
  }

  // ── Interaction ───────────────────────────────────────────────────────────
  _getHit(e) {
    const rect   = this.canvas.getBoundingClientRect();
    const scaleX = this.canvas.width  / rect.width;
    const scaleY = this.canvas.height / rect.height;
    const x = (e.clientX - rect.left) * scaleX;
    const y = (e.clientY - rect.top)  * scaleY;
    return this.hitAreas.find(a => x >= a.x && x <= a.x + a.w && y >= a.y && y <= a.y + a.h);
  }

  _onClick(e) {
    const ha = this._getHit(e);
    if (ha) this._showInput(ha);
    else    this._removeOverlay();
  }

  _onHover(e) {
    this.canvas.style.cursor = this._getHit(e) ? 'pointer' : 'default';
  }

  _showInput(ha) {
    this._removeOverlay();
    const rect   = this.canvas.getBoundingClientRect();
    const scaleX = rect.width  / this.canvas.width;
    const scaleY = rect.height / this.canvas.height;

    const input = document.createElement('input');
    input.type  = 'number';
    input.value = ha.value;
    input.step  = 0.5;
    input.min   = ha.min;
    input.max   = ha.max;
    Object.assign(input.style, {
      position:     'fixed',
      left:         (rect.left + ha.cx * scaleX - 40) + 'px',
      top:          (rect.top  + ha.cy * scaleY - 13) + 'px',
      width:        '80px',
      height:       '26px',
      background:   this.C.panel,
      color:        '#f0c040',
      border:       '1.5px solid #f0c040',
      borderRadius: '4px',
      font:         'bold 12px monospace',
      textAlign:    'center',
      zIndex:       '9999',
      outline:      'none',
      padding:      '0 4px',
    });

    document.body.appendChild(input);
    this._activeInput = input;
    input.focus();
    input.select();

    const commit = () => {
      const val = parseFloat(input.value);
      if (!isNaN(val) && val !== ha.value) {
        this.onParamChange(ha.paramId, val, ha.isShape);
      }
      this._removeOverlay();
    };

    input.addEventListener('blur',    commit);
    input.addEventListener('keydown', e => {
      if (e.key === 'Enter')  { e.preventDefault(); commit(); }
      if (e.key === 'Escape') { this._removeOverlay(); }
    });
  }

  _removeOverlay() {
    if (this._activeInput) {
      this._activeInput.remove();
      this._activeInput = null;
    }
  }

  // ── Helpers ───────────────────────────────────────────────────────────────
  /** Retourne les descripteurs de param correspondant à W et D */
  _getWDParams(shape) {
    const descs = shape.getParamDescriptors ? shape.getParamDescriptors() : [];
    const byId  = Object.fromEntries(descs.map(d => [d.id, d]));
    const mk    = id => byId[id]
      ? { id, value: shape.params[id] ?? byId[id].min, min: byId[id].min, max: byId[id].max }
      : null;
    const lP  = mk('length') ?? mk('diameter');
    const wdP = mk('width')  ?? (lP?.id === 'diameter' ? null : mk('diameter'));
    // Si wP et dP pointent vers le même paramètre (ex: cercle → diameter),
    // dP = null pour éviter une cote verticale cliquable redondante.
    return {
      wP: lP,
      dP: (wdP?.id && wdP.id !== lP?.id) ? wdP : null,
    };
  }

  // ── Vue panneau plat — Boîte encoches ─────────────────────────────────────
  _viewFingerJoint(CW, CH, boxType, shape, boxParams) {
    const ctx    = this.ctx;
    const panels = boxType.getFlatPanels(shape, boxParams);
    if (!panels || panels.length === 0) return;

    // Titre
    ctx.fillStyle = this.C.title;
    ctx.font      = 'bold 10px monospace';
    ctx.textAlign = 'left';
    ctx.fillText(t('view.flat_panels'), 10, 17);

    // Bounding box globale (en mm, coordonnées absolues incluant tabs)
    let gMinX = Infinity, gMinY = Infinity, gMaxX = -Infinity, gMaxY = -Infinity;
    for (const p of panels) {
      gMinX = Math.min(gMinX, p.bMinX);
      gMinY = Math.min(gMinY, p.bMinY);
      gMaxX = Math.max(gMaxX, p.bMaxX);
      gMaxY = Math.max(gMaxY, p.bMaxY);
    }

    const pad = 48;
    const sc  = Math.min((CW - pad * 2) / ((gMaxX - gMinX) || 1),
                         (CH - pad * 2 - 20) / ((gMaxY - gMinY) || 1));
    // Origine canvas telle que la bb globale soit centrée ; axe Y vers le HAUT comme sur la
    // machine (le fond, à Y = 0, est en bas — devant — et non en haut du dessin)
    const ox  = (CW - (gMaxX - gMinX) * sc) / 2 - gMinX * sc;
    const oy  = CH / 2 + 10 + (gMinY + gMaxY) / 2 * sc;

    // Un seul save/translate/scale pour tous les panneaux
    ctx.save();
    ctx.translate(ox, oy);
    ctx.scale(sc, -sc);

    for (const p of panels) {
      const path2d = new Path2D(p.path);
      ctx.fillStyle   = p.color + '26';
      ctx.fill(path2d);
      ctx.strokeStyle = p.color;
      ctx.lineWidth   = 1.5 / sc;
      ctx.stroke(path2d);
    }

    // Labels en espace pixel (on annule le scale, Y retourné)
    ctx.scale(1 / sc, -1 / sc);
    for (const p of panels) {
      const cx = ((p.bMinX + p.bMaxX) / 2) * sc;
      const cy = -((p.bMinY + p.bMaxY) / 2) * sc;
      ctx.font         = '12px monospace';
      ctx.fillStyle    = p.color;
      ctx.textAlign    = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(t(p.label), cx, cy);
      ctx.font      = '11px monospace';
      ctx.fillStyle = this.C.text;
      ctx.fillText(`${p.width.toFixed(0)}×${p.height.toFixed(0)}`, cx, cy + 14);
    }

    ctx.restore();
  }
}
