import { t } from '../i18n.js';

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
      bg:      '#0f0f1a',
      panel:   '#101020',
      wood:    '#7a5230',
      woodLt:  '#a06840',
      inner:   '#181830',
      rabbet:  '#2ab87a',
      dim:     '#f0c040',
      dimLine: '#505080',
      text:    '#b0b4d0',
      title:   '#405090',
      divider: '#202040',
    };
  }

  static COLORS_DARK = {
    bg:      '#0f0f1a',
    panel:   '#101020',
    wood:    '#7a5230',
    woodLt:  '#a06840',
    inner:   '#181830',
    rabbet:  '#2ab87a',
    dim:     '#f0c040',
    dimLine: '#505080',
    text:    '#b0b4d0',
    title:   '#405090',
    divider: '#202040',
  };

  static COLORS_LIGHT = {
    bg:      '#c4c4d4',
    panel:   '#d0d0e0',
    wood:    '#c8a060',
    woodLt:  '#d8b878',
    inner:   '#d0d0e4',
    rabbet:  '#008f70',
    dim:     '#cc6200',
    dimLine: '#9090b0',
    text:    '#1a1a3a',
    title:   '#1a6fcc',
    divider: '#c0c0d8',
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

    const totalH = boxTypeKey === 'lid-box' ? H + lidH + 2 : boxTypeKey === 'stackable' ? 2 * H + rimH : H;
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

    const nfo = { shape, bb, W, D, H, wt, bt, bFl, bFll, lidH, r, rD, rim, rimH, rs, jeu, sc, totalH, boxTypeKey, boxParams };

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
    const { shape, bb, W, D, wt, sc, boxTypeKey, boxParams } = nfo;
    this._panelBg(ox, oy, qW, qH, title);

    const ctx = this.ctx;
    const pts = shape.getContourPoints();
    const cx  = ox + qW / 2;
    const cy  = oy + qH / 2 + 10;
    // Origine de translation : centre du canvas − centre du bb
    const sx  = cx - (bb.minX + bb.maxX) * sc / 2;
    const sy  = cy - (bb.minY + bb.maxY) * sc / 2;

    // Ancres réelles de la forme en coordonnées canvas
    const shapeL = sx + bb.minX * sc;
    const shapeR = sx + bb.maxX * sc;
    const shapeT = sy + bb.minY * sc;
    const shapeB = sy + bb.maxY * sc;

    // Forme extérieure
    ctx.save();
    ctx.translate(sx, sy);
    ctx.scale(sc, sc);
    ctx.beginPath();
    pts.forEach((p, i) => i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y));
    ctx.closePath();
    ctx.fillStyle = this.C.wood;
    ctx.fill();
    ctx.strokeStyle = this.C.text;
    ctx.lineWidth = 1.2 / sc;
    ctx.stroke();

    // Cavité intérieure
    if (boxTypeKey !== 'finger-joint') {
      const ip = this._offsetPts(pts, wt);
      if (ip.length > 2) {
        ctx.beginPath();
        ip.forEach((p, i) => i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y));
        ctx.closePath();
        ctx.fillStyle = this.C.inner;
        ctx.fill();
        ctx.strokeStyle = '#383860';
        ctx.lineWidth = 0.7 / sc;
        ctx.stroke();
      }
    }
    ctx.restore();

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

  // ── VUE 2 : Face ─────────────────────────────────────────────────────────
  _viewFace(ox, oy, qW, qH, nfo, title) {
    const { W, H, wt, bFl, bFll, lidH, r, rD, rimH, rs, jeu, sc, totalH, boxTypeKey } = nfo;
    this._panelBg(ox, oy, qW, qH, title);

    const ctx = this.ctx;
    const cx     = ox + qW / 2;
    const cy     = oy + qH / 2 + 10;
    const sx     = cx - W * sc / 2;
    const sy     = cy + totalH * sc / 2; // bas du corps
    const csBot = boxTypeKey === 'stackable' && rimH > 0 ? sy - (H + rimH) * sc : sy;

    // Corps
    ctx.fillStyle = this.C.wood;
    ctx.fillRect(sx, csBot - H * sc, W * sc, H * sc);
    ctx.strokeStyle = this.C.text;
    ctx.lineWidth = 1.2;
    ctx.strokeRect(sx, csBot - H * sc, W * sc, H * sc);

    // Cavité intérieure
    if (boxTypeKey !== 'finger-joint' && W > 2 * wt && H > bFl) {
      ctx.fillStyle = this.C.inner;
      ctx.fillRect(sx + wt * sc, csBot - H * sc, (W - 2 * wt) * sc, (H - bFl) * sc);
    }

    // Rainure feuillure corps (lid-box) — largeur r+jeu pour le jeu mécanique
    if (boxTypeKey === 'lid-box' && r > 0) {
      const rJ = r + jeu;
      ctx.fillStyle = this.C.rabbet;
      ctx.globalAlpha = 0.35;
      if (rs === 0) {
        // Cas 0 : rainure intérieure — de (wt-r-jeu) à wt, largeur r+jeu
        ctx.fillRect(sx + (wt - rJ) * sc, sy - H * sc, rJ * sc, rD * sc);
        ctx.fillRect(sx + (W - wt) * sc,  sy - H * sc, rJ * sc, rD * sc);
        ctx.globalAlpha = 1;
        ctx.strokeStyle = this.C.rabbet; ctx.lineWidth = 0.8;
        ctx.strokeRect(sx + (wt - rJ) * sc, sy - H * sc, rJ * sc, rD * sc);
        ctx.strokeRect(sx + (W - wt) * sc,  sy - H * sc, rJ * sc, rD * sc);
      } else {
        // Cas 1 : rainure extérieure — de 0 à r+jeu, largeur r+jeu
        ctx.fillRect(sx,                    sy - H * sc, rJ * sc, rD * sc);
        ctx.fillRect(sx + (W - rJ) * sc,    sy - H * sc, rJ * sc, rD * sc);
        ctx.globalAlpha = 1;
        ctx.strokeStyle = this.C.rabbet; ctx.lineWidth = 0.8;
        ctx.strokeRect(sx,                    sy - H * sc, rJ * sc, rD * sc);
        ctx.strokeRect(sx + (W - rJ) * sc,    sy - H * sc, rJ * sc, rD * sc);
      }
    }

    // Couvercle (lid-box) — taille nominale, sans jeu (c'est la rainure qui est plus large)
    if (boxTypeKey === 'lid-box' && lidH > 0) {
      const gap  = 2;
      const lidY = sy - H * sc - gap - lidH * sc;
      const lidInset = rs === 0 ? (wt - r) * sc : 0;
      const lidSx    = sx + lidInset;
      const lidW     = W * sc - 2 * lidInset;

      ctx.fillStyle = this.C.woodLt;
      ctx.fillRect(lidSx, lidY, lidW, lidH * sc);
      // Cavité intérieure couvercle (plafond bFll, au-dessus des lèvres)
      const lidCavHF = lidH - rD - bFll;
      if (lidCavHF > 0 && W > 2 * wt) {
        ctx.fillStyle = this.C.inner;
        ctx.fillRect(sx + wt * sc, lidY + bFll * sc, (W - 2 * wt) * sc, lidCavHF * sc);
      }
      ctx.strokeStyle = this.C.text; ctx.lineWidth = 1.2;
      ctx.strokeRect(lidSx, lidY, lidW, lidH * sc);

      if (r > 0) {
        ctx.fillStyle = this.C.inner;
        ctx.fillRect(lidSx + r * sc, lidY + (lidH - rD) * sc, lidW - 2 * r * sc, rD * sc);
        ctx.strokeStyle = this.C.rabbet; ctx.lineWidth = 0.8;
        ctx.setLineDash([3, 3]);
        ctx.strokeRect(lidSx + r * sc, lidY + (lidH - rD) * sc, lidW - 2 * r * sc, rD * sc);
        ctx.setLineDash([]);
      }

      // Cote largeur couvercle (seulement si différente de W, i.e. rainure intérieure)
      if (rs === 0) {
        const lidRealW = W - 2 * (wt - r);
        this._dimH(lidSx, lidSx + lidW, lidY - 16,
          `${lidRealW.toFixed(1)} mm`, null, false, lidRealW, 1, 2000);
      }
    }


    // Cote jeu assemblage (lid-box) — dessiné après le couvercle pour rester visible
    if (boxTypeKey === 'lid-box' && r > 0 && jeu > 0) {
      ctx.save();
      ctx.fillStyle   = this.C.dim;
      ctx.font        = '9px monospace';
      ctx.textAlign   = 'center';
      ctx.globalAlpha = 0.9;
      const jeuX = rs === 0
        ? sx + (wt - r - jeu / 2) * sc
        : sx + (r + jeu / 2) * sc;
      ctx.fillText(t('view.clearance', { val: jeu.toFixed(2) }), jeuX, sy - H * sc + rD * sc / 2 + 2);
      ctx.restore();
    }
    // ── Boîte empilable : languette bas + fantôme (face) ─────────────────────
    if (boxTypeKey === 'stackable' && rimH > 0) {
      const tongueInset = wt + jeu;
      const tongueBot   = csBot + rimH * sc;
      // Rainures latérales (vides — matière fraisée)
      ctx.fillStyle = this.C.inner;
      ctx.fillRect(sx,                          csBot, tongueInset * sc, rimH * sc);
      ctx.fillRect(sx + (W - tongueInset) * sc, csBot, tongueInset * sc, rimH * sc);
      // Plot central solide
      ctx.fillStyle = this.C.wood;
      ctx.fillRect(sx + tongueInset * sc, csBot, (W - 2 * tongueInset) * sc, rimH * sc);
      ctx.strokeStyle = this.C.text; ctx.lineWidth = 1;
      ctx.strokeRect(sx + tongueInset * sc, csBot, (W - 2 * tongueInset) * sc, rimH * sc);
      const phantomTop = tongueBot;
      ctx.save();
      ctx.globalAlpha = 0.22;
      ctx.fillStyle   = this.C.wood;
      ctx.fillRect(sx, phantomTop, W * sc, H * sc);
      ctx.fillStyle = this.C.inner;
      ctx.fillRect(sx + wt * sc, phantomTop, (W - 2 * wt) * sc, (H - bFl) * sc);
      ctx.globalAlpha = 0.45;
      ctx.strokeStyle = this.C.woodLt; ctx.lineWidth = 1;
      ctx.setLineDash([5, 3]);
      ctx.strokeRect(sx, phantomTop, W * sc, H * sc);
      ctx.setLineDash([]);
      ctx.restore();
      if (jeu > 0) {
        ctx.save();
        ctx.fillStyle = this.C.dim; ctx.font = '9px monospace'; ctx.textAlign = 'center'; ctx.globalAlpha = 0.9;
        ctx.fillText(t('view.clearance', { val: jeu.toFixed(2) }), sx + (wt + jeu / 2) * sc, csBot + rimH * sc / 2);
        ctx.restore();
      }
      this._dimV(sx - 22, csBot, tongueBot, `H ${rimH.toFixed(1)}`, null, false, rimH);
    }

    // Cotes (affichage seul) — lignes d'attache depuis les bords de la forme
    // W (sous le corps)
    this._dimH(sx, sx + W * sc, sy + 18,
      `${W.toFixed(1)} mm`, null, false, W, 1, 9999, csBot);
    // H corps (gauche) — tick partagé en haut avec le couvercle
    this._dimV(sx - 26, csBot - H * sc, csBot,
      `${H.toFixed(1)} mm`, null, false, H, 1, 9999, sx);
    // H couvercle (gauche) — y2 = sy-H*sc : tick partagé |←H→|←lidH→|
    if (boxTypeKey === 'lid-box' && lidH > 0) {
      const gap  = 2;
      const lidY = sy - H * sc - gap - lidH * sc;
      this._dimV(sx - 26, lidY, sy - H * sc,
        `${lidH.toFixed(1)} mm`, null, false, lidH);
    }
  }

  // ── VUE 3 : Côté ─────────────────────────────────────────────────────────
  _viewCote(ox, oy, qW, qH, nfo, title) {
    const { D, H, wt, bFl, bFll, lidH, r, rD, rimH, rs, jeu, sc, totalH, boxTypeKey } = nfo;
    this._panelBg(ox, oy, qW, qH, title);

    const ctx = this.ctx;
    const cx  = ox + qW / 2;
    const cy  = oy + qH / 2 + 10;
    const sx  = cx - D * sc / 2;
    const sy  = cy + totalH * sc / 2;
    const csBot = boxTypeKey === 'stackable' && rimH > 0 ? sy - (H + rimH) * sc : sy;

    // Corps
    ctx.fillStyle = this.C.wood;
    ctx.fillRect(sx, csBot - H * sc, D * sc, H * sc);
    ctx.strokeStyle = this.C.text;
    ctx.lineWidth = 1.2;
    ctx.strokeRect(sx, csBot - H * sc, D * sc, H * sc);

    if (boxTypeKey !== 'finger-joint' && D > 2 * wt && H > bFl) {
      ctx.fillStyle = this.C.inner;
      ctx.fillRect(sx + wt * sc, csBot - H * sc, (D - 2 * wt) * sc, (H - bFl) * sc);
    }

    // Rainure feuillure corps côté (lid-box) — largeur r+jeu
    if (boxTypeKey === 'lid-box' && r > 0) {
      const rJ = r + jeu;
      ctx.fillStyle = this.C.rabbet;
      ctx.globalAlpha = 0.35;
      if (rs === 0) {
        // Cas 0 : rainure intérieure — de (wt-r-jeu) à wt, largeur r+jeu
        ctx.fillRect(sx + (wt - rJ) * sc, sy - H * sc, rJ * sc, rD * sc);
        ctx.fillRect(sx + (D - wt) * sc,  sy - H * sc, rJ * sc, rD * sc);
        ctx.globalAlpha = 1;
        ctx.strokeStyle = this.C.rabbet; ctx.lineWidth = 0.8;
        ctx.strokeRect(sx + (wt - rJ) * sc, sy - H * sc, rJ * sc, rD * sc);
        ctx.strokeRect(sx + (D - wt) * sc,  sy - H * sc, rJ * sc, rD * sc);
      } else {
        // Cas 1 : rainure extérieure — de 0 à r+jeu, largeur r+jeu
        ctx.fillRect(sx,                   sy - H * sc, rJ * sc, rD * sc);
        ctx.fillRect(sx + (D - rJ) * sc,   sy - H * sc, rJ * sc, rD * sc);
        ctx.globalAlpha = 1;
        ctx.strokeStyle = this.C.rabbet; ctx.lineWidth = 0.8;
        ctx.strokeRect(sx,                   sy - H * sc, rJ * sc, rD * sc);
        ctx.strokeRect(sx + (D - rJ) * sc,   sy - H * sc, rJ * sc, rD * sc);
      }
    }

    // Couvercle (lid-box) — taille nominale, sans jeu
    if (boxTypeKey === 'lid-box' && lidH > 0) {
      const gap      = 2;
      const lidY     = sy - H * sc - gap - lidH * sc;
      const lidInset = rs === 0 ? (wt - r) * sc : 0;
      const lidSx    = sx + lidInset;
      const lidW     = D * sc - 2 * lidInset;

      ctx.fillStyle = this.C.woodLt;
      ctx.fillRect(lidSx, lidY, lidW, lidH * sc);
      // Cavité intérieure couvercle (plafond bFll, au-dessus des lèvres)
      const lidCavHC = lidH - rD - bFll;
      if (lidCavHC > 0 && D > 2 * wt) {
        ctx.fillStyle = this.C.inner;
        ctx.fillRect(sx + wt * sc, lidY + bFll * sc, (D - 2 * wt) * sc, lidCavHC * sc);
      }
      ctx.strokeStyle = this.C.text;
      ctx.lineWidth = 1.2;
      ctx.strokeRect(lidSx, lidY, lidW, lidH * sc);

      if (r > 0) {
        ctx.fillStyle = this.C.inner;
        ctx.fillRect(lidSx + r * sc, lidY + (lidH - rD) * sc, lidW - 2 * r * sc, rD * sc);
        ctx.strokeStyle = this.C.rabbet;
        ctx.lineWidth = 0.8;
        ctx.setLineDash([3, 3]);
        ctx.strokeRect(lidSx + r * sc, lidY + (lidH - rD) * sc, lidW - 2 * r * sc, rD * sc);
        ctx.setLineDash([]);
      }

      // Cote profondeur couvercle (seulement si différente de D, i.e. rainure intérieure)
      if (rs === 0) {
        const lidRealD = D - 2 * (wt - r);
        this._dimH(lidSx, lidSx + lidW, lidY - 16,
          `${lidRealD.toFixed(1)} mm`, null, false, lidRealD, 1, 2000);
      }
    }


    // Cote jeu assemblage (lid-box) — dessiné après le couvercle pour rester visible
    if (boxTypeKey === 'lid-box' && r > 0 && jeu > 0) {
      ctx.save();
      ctx.fillStyle   = this.C.dim;
      ctx.font        = '9px monospace';
      ctx.textAlign   = 'center';
      ctx.globalAlpha = 0.9;
      const jeuX = rs === 0
        ? sx + (wt - r - jeu / 2) * sc
        : sx + (r + jeu / 2) * sc;
      ctx.fillText(t('view.clearance', { val: jeu.toFixed(2) }), jeuX, sy - H * sc + rD * sc / 2 + 2);
      ctx.restore();
    }
    // ── Boîte empilable : languette bas + fantôme (côté) ─────────────────────
    if (boxTypeKey === 'stackable' && rimH > 0) {
      const tongueInset = wt + jeu;
      const tongueBot   = csBot + rimH * sc;
      // Rainures latérales (vides — matière fraisée)
      ctx.fillStyle = this.C.inner;
      ctx.fillRect(sx,                          csBot, tongueInset * sc, rimH * sc);
      ctx.fillRect(sx + (D - tongueInset) * sc, csBot, tongueInset * sc, rimH * sc);
      // Plot central solide
      ctx.fillStyle = this.C.wood;
      ctx.fillRect(sx + tongueInset * sc, csBot, (D - 2 * tongueInset) * sc, rimH * sc);
      ctx.strokeStyle = this.C.text; ctx.lineWidth = 1;
      ctx.strokeRect(sx + tongueInset * sc, csBot, (D - 2 * tongueInset) * sc, rimH * sc);
      const phantomTop = tongueBot;
      ctx.save();
      ctx.globalAlpha = 0.22;
      ctx.fillStyle   = this.C.wood;
      ctx.fillRect(sx, phantomTop, D * sc, H * sc);
      ctx.fillStyle = this.C.inner;
      ctx.fillRect(sx + wt * sc, phantomTop, (D - 2 * wt) * sc, (H - bFl) * sc);
      ctx.globalAlpha = 0.45;
      ctx.strokeStyle = this.C.woodLt; ctx.lineWidth = 1;
      ctx.setLineDash([5, 3]);
      ctx.strokeRect(sx, phantomTop, D * sc, H * sc);
      ctx.setLineDash([]);
      ctx.restore();
      if (jeu > 0) {
        ctx.save();
        ctx.fillStyle = this.C.dim; ctx.font = '9px monospace'; ctx.textAlign = 'center'; ctx.globalAlpha = 0.9;
        ctx.fillText(t('view.clearance', { val: jeu.toFixed(2) }), sx + (wt + jeu / 2) * sc, csBot + rimH * sc / 2);
        ctx.restore();
      }
      this._dimV(sx - 22, csBot, tongueBot, `H ${rimH.toFixed(1)}`, null, false, rimH);
    }

    // Cotes (affichage seul) — lignes d'attache depuis les bords de la forme
    // D (sous le corps)
    this._dimH(sx, sx + D * sc, sy + 18,
      `${D.toFixed(1)} mm`, null, false, D, 1, 9999, csBot);
    // H (gauche) — tick partagé en haut avec le couvercle
    this._dimV(sx - 26, csBot - H * sc, csBot,
      `${H.toFixed(1)} mm`, null, false, H, 1, 9999, sx);
    // H couvercle (gauche) — y2 = sy-H*sc : tick partagé |←H→|←lidH→|
    if (boxTypeKey === 'lid-box' && lidH > 0) {
      const gap  = 2;
      const lidY = sy - H * sc - gap - lidH * sc;
      this._dimV(sx - 26, lidY, sy - H * sc,
        `${lidH.toFixed(1)} mm`, null, false, lidH);
    }
  }

  // ── VUE 4 : Coupe A-A ────────────────────────────────────────────────────
  _viewCoupe(ox, oy, qW, qH, nfo, title) {
    const { W, H, wt, bFl, bFll, lidH, r, rD, rimH, rs, jeu, sc, totalH, boxTypeKey } = nfo;
    this._panelBg(ox, oy, qW, qH, title);

    const ctx = this.ctx;
    const cx     = ox + qW / 2;
    const cy     = oy + qH / 2 + 10;
    const sx     = cx - W * sc / 2;
    const sy     = cy + totalH * sc / 2; // bas
    const csBot = boxTypeKey === 'stackable' && rimH > 0 ? sy - (H + rimH) * sc : sy;

    const iX  = sx + wt * sc;           // bord intérieur gauche
    const iW  = (W - 2 * wt) * sc;      // largeur intérieure
    const rX  = sx + (W - wt) * sc;     // paroi droite X
    const wW  = wt * sc;                 // épaisseur paroi

    // ── Fond ──
    ctx.fillStyle = this.C.wood;
    ctx.fillRect(sx, csBot - bFl * sc, W * sc, bFl * sc);
    ctx.strokeStyle = this.C.text;
    ctx.lineWidth = 1;
    // Contour fond : bords extérieurs + bord sup uniquement entre les parois
    ctx.beginPath();
    ctx.moveTo(sx, csBot - bFl * sc);
    ctx.lineTo(sx, csBot);
    ctx.lineTo(sx + W * sc, csBot);
    ctx.lineTo(sx + W * sc, csBot - bFl * sc);
    ctx.moveTo(sx + wW, csBot - bFl * sc);
    ctx.lineTo(rX, csBot - bFl * sc);
    ctx.stroke();

    // ── Paroi gauche ──
    ctx.fillStyle = this.C.wood;
    ctx.fillRect(sx, csBot - H * sc, wW, (H - bFl) * sc);
    ctx.strokeStyle = this.C.text;
    // 3 côtés seulement : pas de bord bas (jonction fond — même matière)
    ctx.beginPath();
    ctx.moveTo(sx,      csBot - bFl * sc);
    ctx.lineTo(sx,      csBot - H * sc);
    ctx.lineTo(sx + wW, csBot - H * sc);
    ctx.lineTo(sx + wW, csBot - bFl * sc);
    ctx.stroke();

    // ── Paroi droite ──
    ctx.fillStyle = this.C.wood;
    ctx.fillRect(rX, csBot - H * sc, wW, (H - bFl) * sc);
    ctx.strokeStyle = this.C.text;
    // 3 côtés seulement : pas de bord bas (jonction fond — même matière)
    ctx.beginPath();
    ctx.moveTo(rX,      csBot - bFl * sc);
    ctx.lineTo(rX,      csBot - H * sc);
    ctx.lineTo(rX + wW, csBot - H * sc);
    ctx.lineTo(rX + wW, csBot - bFl * sc);
    ctx.stroke();

    // ── Cavité intérieure ──
    if (H > bFl && W > 2 * wt) {
      ctx.fillStyle = this.C.inner;
      ctx.fillRect(iX, csBot - H * sc, iW, (H - bFl) * sc);
    }

    // ── Rainures feuillure corps (lid-box) — largeur r+jeu pour le jeu mécanique ──
    if (boxTypeKey === 'lid-box' && r > 0) {
      const rJ = r + jeu;
      ctx.fillStyle   = this.C.rabbet;
      ctx.globalAlpha = 0.35;
      if (rs === 0) {
        // Cas 0 : rainure intérieure — de (wt-r-jeu) à wt depuis bord ext, profondeur rD
        ctx.fillRect(iX - rJ * sc, sy - H * sc, rJ * sc, rD * sc);
        ctx.fillRect(rX,            sy - H * sc, rJ * sc, rD * sc);
        ctx.globalAlpha = 1;
        ctx.strokeStyle = this.C.rabbet; ctx.lineWidth = 1;
        ctx.strokeRect(iX - rJ * sc, sy - H * sc, rJ * sc, rD * sc);
        ctx.strokeRect(rX,            sy - H * sc, rJ * sc, rD * sc);
      } else {
        // Cas 1 : rainure extérieure — de 0 à r+jeu depuis bord ext, profondeur rD
        ctx.fillRect(sx,                 sy - H * sc, rJ * sc, rD * sc);
        ctx.fillRect(sx + (W - rJ) * sc, sy - H * sc, rJ * sc, rD * sc);
        ctx.globalAlpha = 1;
        ctx.strokeStyle = this.C.rabbet; ctx.lineWidth = 1;
        ctx.strokeRect(sx,                 sy - H * sc, rJ * sc, rD * sc);
        ctx.strokeRect(sx + (W - rJ) * sc, sy - H * sc, rJ * sc, rD * sc);
      }
    }

    // ── Section couvercle (lid-box) ──
    if (boxTypeKey === 'lid-box' && lidH > 0) {
      const gap      = 2;
      const lidBot   = sy - H * sc - gap;
      const lidTop   = lidBot - lidH * sc;
      // Cas 0 : couvercle réduit (inset wt-r) | Cas 1 : couvercle plein (inset 0)
      const lidInset = rs === 0 ? (wt - r) * sc : 0;
      const lidSx    = sx + lidInset;
      const lidW     = W * sc - 2 * lidInset;
      const lipY     = lidTop + (lidH - rD) * sc;  // début des lèvres (bas du bloc solide)

      // Bloc solide supérieur du couvercle
      ctx.fillStyle = this.C.woodLt;
      ctx.fillRect(lidSx, lidTop, lidW, (lidH - rD) * sc);
      // Cavité intérieure couvercle (plafond = bFll, profondeur = lidH - rD - bFll)
      const lidCavH = lidH - rD - bFll;
      if (lidCavH > 0 && W > 2 * wt) {
        ctx.fillStyle = this.C.inner;
        ctx.fillRect(sx + wt * sc, lidTop + bFll * sc, (W - 2 * wt) * sc, lidCavH * sc);
      }
      ctx.strokeStyle = this.C.text;
      ctx.lineWidth = 1;
      ctx.strokeRect(lidSx, lidTop, lidW, (lidH - rD) * sc);

      // Lèvre gauche : de lidSx à lidSx+r — s'emboîte dans rainure corps gauche
      ctx.fillStyle = this.C.woodLt;
      ctx.fillRect(lidSx, lipY, r * sc, rD * sc);
      ctx.strokeStyle = this.C.text;
      ctx.strokeRect(lidSx, lipY, r * sc, rD * sc);

      // Lèvre droite : de lidSx+lidW-r à lidSx+lidW — s'emboîte dans rainure corps droite
      ctx.fillStyle = this.C.woodLt;
      ctx.fillRect(lidSx + lidW - r * sc, lipY, r * sc, rD * sc);
      ctx.strokeStyle = this.C.text;
      ctx.strokeRect(lidSx + lidW - r * sc, lipY, r * sc, rD * sc);

      // Poche centrale (zone vide entre les lèvres = au-dessus de l'intérieur du corps)
      ctx.fillStyle = this.C.inner;
      ctx.fillRect(lidSx + r * sc, lipY, lidW - 2 * r * sc, rD * sc);
      ctx.strokeStyle = this.C.rabbet;
      ctx.lineWidth = 0.8;
      ctx.setLineDash([2, 2]);
      ctx.strokeRect(lidSx + r * sc, lipY, lidW - 2 * r * sc, rD * sc);
      ctx.setLineDash([]);

      // Ligne de joint
      ctx.strokeStyle = this.C.rabbet;
      ctx.lineWidth = 0.5;
      ctx.setLineDash([3, 3]);
      ctx.beginPath();
      ctx.moveTo(sx, lidBot); ctx.lineTo(sx + W * sc, lidBot);
      ctx.stroke();
      ctx.setLineDash([]);
    }

    // ── Boîte empilable : languette bas + fantôme (coupe) ─────────────
    if (boxTypeKey === 'stackable' && rimH > 0) {
      const tongueInset = wt + jeu;
      const tongueBot   = csBot + rimH * sc;
      // Rainures latérales (vides — matière fraisée)
      ctx.fillStyle = this.C.inner;
      ctx.fillRect(sx,                          csBot, tongueInset * sc, rimH * sc);
      ctx.fillRect(sx + (W - tongueInset) * sc, csBot, tongueInset * sc, rimH * sc);
      // Plot central solide
      ctx.fillStyle = this.C.wood;
      ctx.fillRect(sx + tongueInset * sc, csBot, (W - 2 * tongueInset) * sc, rimH * sc);
      ctx.strokeStyle = this.C.text; ctx.lineWidth = 1;
      ctx.strokeRect(sx + tongueInset * sc, csBot, (W - 2 * tongueInset) * sc, rimH * sc);
      const phantomTop = tongueBot;
      ctx.save();
      ctx.globalAlpha = 0.22;
      ctx.fillStyle   = this.C.wood;
      ctx.fillRect(sx,                 phantomTop, wt * sc, H * sc);
      ctx.fillRect(sx + (W - wt) * sc, phantomTop, wt * sc, H * sc);
      ctx.fillRect(sx, phantomTop + (H - bFl) * sc, W * sc, bFl * sc);
      ctx.fillStyle = this.C.inner;
      ctx.fillRect(iX, phantomTop, iW, (H - bFl) * sc);
      ctx.globalAlpha = 0.45;
      ctx.strokeStyle = this.C.woodLt; ctx.lineWidth = 1;
      ctx.setLineDash([5, 3]);
      ctx.strokeRect(sx, phantomTop, W * sc, H * sc);
      ctx.setLineDash([]);
      ctx.restore();
    }

    // ── Cotes section (affichage seul) ──
    // Épaisseur paroi — ligne d'attache depuis le bas du corps
    this._dimH(sx, iX, sy + 38,
      t('view.wall_thick', { val: wt.toFixed(1) }), null, false, wt, 1, 9999, csBot);

    // Feuillure (lid-box) — label centré dans la rainure, fond transparent
    if (boxTypeKey === 'lid-box' && r > 0) {
      const rDimX1 = rs === 0 ? iX - r * sc : sx;
      const rDimX2 = rs === 0 ? iX           : sx + r * sc;
      const rDimY  = sy - H * sc + rD * sc / 2; // centré dans la profondeur feuillure
      ctx.save();
      ctx.strokeStyle = this.C.dimLine;
      ctx.fillStyle   = this.C.dimLine;
      ctx.lineWidth   = 0.8;
      ctx.beginPath();
      ctx.moveTo(rDimX1, rDimY - 6); ctx.lineTo(rDimX1, rDimY + 6);
      ctx.moveTo(rDimX2, rDimY - 6); ctx.lineTo(rDimX2, rDimY + 6);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(rDimX1, rDimY); ctx.lineTo(rDimX2, rDimY);
      ctx.stroke();
      this._arrH(rDimX1, rDimY,  1);
      this._arrH(rDimX2, rDimY, -1);
      ctx.font         = '10px monospace';
      ctx.fillStyle    = this.C.text;
      ctx.textAlign    = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(t('view.rabbet', { val: r.toFixed(1) }), (rDimX1 + rDimX2) / 2, rDimY);
      ctx.restore();
    }

    // Jeu assemblage (lid-box) — label à côté de la cote feuillure
    if (boxTypeKey === 'lid-box' && r > 0 && jeu > 0) {
      ctx.save();
      ctx.fillStyle   = this.C.dim;
      ctx.font        = '9px monospace';
      ctx.textAlign   = 'center';
      ctx.globalAlpha = 0.9;
      const jeuX = rs === 0
        ? iX - r * sc - jeu * sc / 2
        : sx + r * sc + jeu * sc / 2;
      ctx.fillText(t('view.clearance', { val: jeu.toFixed(2) }), jeuX, sy - H * sc + rD * sc + 22);
      ctx.restore();
    }

    // Languette (stackable) — cotes rimH et jeu
    if (boxTypeKey === 'stackable' && rimH > 0) {
      this._dimV(sx - 22, csBot, csBot + rimH * sc, `H ${rimH.toFixed(1)}`, null, false, rimH);
      if (jeu > 0) {
        ctx.save();
        ctx.fillStyle = this.C.dim; ctx.font = '9px monospace'; ctx.textAlign = 'center'; ctx.globalAlpha = 0.9;
        ctx.fillText(t('view.clearance', { val: jeu.toFixed(2) }), sx + (wt + jeu / 2) * sc, csBot + rimH * sc / 2);
        ctx.restore();
      }
    }

    // Épaisseur matière (affichage seul — paramètre machine)
    ctx.save();
    ctx.font      = '9px monospace';
    ctx.fillStyle = this.C.dimLine;
    ctx.textAlign = 'right';
    ctx.fillText(t('view.bottom_thick', { val: bFl.toFixed(1) }), sx - 5, csBot - bFl * sc / 2);
    ctx.restore();
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
      background:   '#16162c',
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
    // Origine canvas telle que la bb globale soit centrée
    const ox  = (CW - (gMaxX - gMinX) * sc) / 2 - gMinX * sc;
    const oy  = (CH - (gMaxY - gMinY) * sc) / 2 - gMinY * sc + 10;

    // Un seul save/translate/scale pour tous les panneaux
    ctx.save();
    ctx.translate(ox, oy);
    ctx.scale(sc, sc);

    for (const p of panels) {
      const path2d = new Path2D(p.path);
      ctx.fillStyle   = p.color + '26';
      ctx.fill(path2d);
      ctx.strokeStyle = p.color;
      ctx.lineWidth   = 1.5 / sc;
      ctx.stroke(path2d);
    }

    // Labels en espace pixel (on annule le scale)
    ctx.scale(1 / sc, 1 / sc);
    for (const p of panels) {
      const cx = ((p.bMinX + p.bMaxX) / 2) * sc;
      const cy = ((p.bMinY + p.bMaxY) / 2) * sc;
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

  /** Offset de contour par bisectrice (même algo que ThreePreview) */
  _offsetPts(pts, offset) {
    const n = pts.length;
    if (n < 3) return [];
    const res = [];
    for (let i = 0; i < n; i++) {
      const prev = pts[(i - 1 + n) % n];
      const curr = pts[i];
      const next = pts[(i + 1)     % n];
      const dx1 = curr.x - prev.x, dy1 = curr.y - prev.y;
      const dx2 = next.x - curr.x, dy2 = next.y - curr.y;
      const l1  = Math.hypot(dx1, dy1) || 1;
      const l2  = Math.hypot(dx2, dy2) || 1;
      const nx1 = -dy1 / l1, ny1 = dx1 / l1;
      const nx2 = -dy2 / l2, ny2 = dx2 / l2;
      const nx  = nx1 + nx2, ny = ny1 + ny2;
      const den = Math.max(1 + nx1 * nx2 + ny1 * ny2, 0.1);
      const sc  = offset / den;
      const cl  = Math.abs(offset) * 3;
      res.push({
        x: curr.x + Math.max(-cl, Math.min(cl, nx * sc)),
        y: curr.y + Math.max(-cl, Math.min(cl, ny * sc)),
      });
    }
    return res;
  }
}
