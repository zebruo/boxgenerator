/**
 * SimulationView.js — Panneau superposé de simulation d'usinage (matière + parcours).
 *
 * S'affiche par-dessus la zone centrale. Rejoue le G-code (GCodeProgram) dans une grille
 * de hauteurs à deux faces (StockSim) et l'affiche en 3D : brut usiné (dessus et dessous),
 * fraise, trajectoires colorées par opération, contours théoriques (« Dessin »).
 *
 * Repère de la scène = repère du brut, face 1 (dessus) vers le haut. Les mouvements de la
 * face 2 (pièce retournée, ex. boîte empilable) y sont ramenés par toStockFrame ; la vue
 * « Face 2 » retourne toute la scène comme la pièce sur la machine.
 */

import * as THREE from '../../lib/three.module.js';
import { OrbitControls } from '../../lib/jsm/controls/OrbitControls.js';
import { t } from '../i18n.js';
import { parseProgram, moveIndexAt, formatDuration, toStockFrame } from './GCodeProgram.js';
import { StockSim, cellFor } from './StockSim.js';

const KIND_COLORS = { pocket: 0x2f80ed, contour: 0xf2711c, drill: 0x27ae60 };
const RAPID_COLOR = 0x9aa0a6;
const WOOD = new THREE.Color(0xd99559);
const SPEEDS = [1, 5, 10, 20, 50, 100, 200, 500];

function lsGet(key, def) { try { return localStorage.getItem(key) ?? def; } catch { return def; } }
function lsSet(key, val) { try { localStorage.setItem(key, val); } catch { /* stockage indisponible */ } }

// ─── Shaders ────────────────────────────────────────────────────────────────
// Textures : uHeight (dessus de la matière), uFloor (dessous), uMask (1 = dans une pièce).
// Une case est vide quand dessous ≥ dessus. uViewFlip retourne les normales quand la scène
// est retournée (vue face 2 : (−1,1,−1) autour de l'axe Y, (1,−1,−1) autour de l'axe X)
// pour garder l'éclairage venant d'en haut.
// Chaque sommet de la grille prend la hauteur de sa case ; vVis = 0 si la case est vide
// (traversée) ou hors pièce (« Pièce finie seule »). Un triangle n'est masqué que si ses
// trois sommets le sont : les flancs (un sommet sur la matière, les autres dans la
// découpe) restent entiers. La normale vient du triangle lui-même (dérivées écran),
// tournée vers la caméra (uCam, repère du maillage).
const COMMON = /* glsl */`
  uniform sampler2D uHeight, uFloor, uMask;
  uniform vec2 uSize;
  uniform float uCell, uTop, uBottom, uPartOnly;
  uniform vec3 uColor, uViewFlip, uCam;
  varying vec3 vPos;
  varying vec2 vCellPos;
  varying float vVis;
  vec2 tc(vec2 c) { return (clamp(c, vec2(0.0), uSize - 1.0) + 0.5) / uSize; }
  float Hs(vec2 c) { return texture2D(uHeight, tc(c)).r; }
  float Fs(vec2 c) { return texture2D(uFloor,  tc(c)).r; }
  bool hiddenCell(vec2 c) {
    return Fs(c) >= Hs(c) - 0.001 || (uPartOnly > 0.5 && texture2D(uMask, tc(c)).r < 0.5);
  }`;

// Fragment seulement (dFdx/dFdy n'existent pas dans un vertex shader)
// Les flancs sont des escaliers de cases : leur normale de triangle alterne entre X et Y
// (rayures sur les parois courbes). Pour un flanc, on prend donc la direction de la pente
// de la matière, lissée sur 5 × 3 cases, qui suit la vraie courbure de la paroi.
const FRAG_COMMON = COMMON + /* glsl */`
  float G(vec2 c);   // surface (dessus ou dessous) : définie par chaque shader
  vec3 faceNormal() {
    vec3 n = normalize(cross(dFdx(vPos), dFdy(vPos)));
    n = dot(n, uCam - vPos) < 0.0 ? -n : n;
    if (abs(n.z) > 0.6) return n;                    // surface plane ou en pente douce : normale exacte
    vec2 c = floor(vCellPos + 0.5), g = vec2(0.0);
    for (int k = -1; k <= 1; k++) {
      float fk = float(k);
      g.x += G(c + vec2(2.0, fk)) - G(c - vec2(2.0, fk));
      g.y += G(c + vec2(fk, 2.0)) - G(c - vec2(fk, 2.0));
    }
    if (length(g) < 1e-4) return n;
    vec3 w = normalize(vec3(-g, 0.0));               // horizontale, vers le côté le plus bas
    return dot(w, n) < 0.0 ? -w : w;                 // du côté visible du triangle
  }
  float light(vec3 n) {
    n = normalize(n * uViewFlip);   // repère du brut → monde (vue face 2 retournée)
    return 0.38 + 0.55 * max(dot(n, normalize(vec3(0.35, -0.55, 0.75))), 0.0)
                + 0.18 * max(dot(n, normalize(vec3(-0.5, 0.45, 0.6))), 0.0)
                + 0.12 * max(dot(n, vec3(0.0, 0.0, -1.0)), 0.0);   // un peu de lumière par-dessous
  }`;

const vert = zExpr => COMMON + /* glsl */`
  void main() {
    vCellPos = uv * (uSize - 1.0);
    vec2 c = floor(vCellPos + 0.5);
    vVis = hiddenCell(c) ? 0.0 : 1.0;
    vPos = vec3(position.xy, ${zExpr});
    gl_Position = projectionMatrix * modelViewMatrix * vec4(vPos, 1.0);
  }`;

// Dessus de la matière
const VERT_TOP = vert('max(Hs(c), Fs(c))');
const FRAG_TOP = FRAG_COMMON + /* glsl */`
  float G(vec2 c) { return max(Hs(c), Fs(c)); }
  void main() {
    if (vVis < 0.001) discard;                       // triangle entièrement dans une découpe
    float depth = clamp((uTop - vPos.z) / max(uTop - uBottom, 0.001), 0.0, 1.0);
    gl_FragColor = vec4(uColor * (1.0 - 0.28 * depth) * light(faceNormal()), 1.0);
  }`;

// Dessous de la matière (plat, ou creusé par la face 2)
const VERT_UNDER = vert('min(Fs(c), Hs(c)) - 0.02');
const FRAG_UNDER = FRAG_COMMON + /* glsl */`
  float G(vec2 c) { return min(Fs(c), Hs(c)); }
  void main() {
    if (vVis < 0.001) discard;
    float depth = clamp((vPos.z - uBottom) / max(uTop - uBottom, 0.001), 0.0, 1.0);
    gl_FragColor = vec4(uColor * 0.85 * (1.0 - 0.28 * depth) * light(faceNormal()), 1.0);
  }`;

export class SimulationView {
  /**
   * @param {HTMLElement} host   conteneur (zone centrale) dans lequel le panneau se superpose
   * @param {object} o
   * @param {string} o.code             G-code à simuler
   * @param {{x0,y0,x1,y1,top,bottom}} o.stock  brut, en coordonnées machine (face 1)
   * @param {{pts:{x,y}[], face:number, outer?:boolean}[]} [o.drawing]  contours théoriques
   *        (repère machine de leur face) ; outer = contour qui détache une pièce
   * @param {number} o.toolDiameter
   * @param {number} [o.rapidRate]      vitesse des G0 de la machine (mm/min), pour le temps estimé
   * @param {boolean} [o.light]         thème clair
   * @param {Function} [o.onClose]
   */
  constructor(host, { code, stock, drawing = [], toolDiameter, rapidRate = 3000, light = false, onClose = null }) {
    this.host = host;
    this.code = code;
    this.stock = stock;
    this.drawing = drawing;
    this.toolR = toolDiameter / 2;
    this.onClose = onClose;
    this.playing = false;
    this.time = 0;
    this.speed = Number(lsGet('sim.speed', 50)) || 50;
    this.resolution = 'standard';          // ≈ 0,27 mm : suffisant pour ces pièces
    this.rapidRate = rapidRate > 0 ? rapidRate : 3000;
    this.light = light;
    this.viewMode = 'auto';                // 'auto' | '1' | '2' (boîtes usinées sur deux faces)
    this.viewFace = 1;
    this.partOnly = false;

    this._loadProgram();
    this._buildDom();
    this._setupThree();
    this._buildSim();
    this._buildPaths();
    this._buildDrawing();
    this._buildTool();
    this._fitCamera();
    this._seek(0);
    this._resizeObs = new ResizeObserver(() => this._resize());
    this._resizeObs.observe(this.ui.canvas.parentElement);
    this._resize();
    this._lastFrame = performance.now();
    this._loop();
  }

  // ─── Interface ───────────────────────────────────────────────────────────

  _buildDom() {
    const el = document.createElement('div');
    el.className = 'sim-overlay';
    const speedOpts = SPEEDS.map(s => `<option value="${s}"${s === this.speed ? ' selected' : ''}>×${s}</option>`).join('');
    const twoFaces = !!this.program.flip;
    const hasDrawing = this.drawing.length > 0;
    el.innerHTML = `
      <div class="sim-toolbar">
        <span class="sim-title">${t('sim.title')}</span>
        <label class="sim-lbl">${t('sim.speed')} <select class="sim-speed">${speedOpts}</select></label>
        ${twoFaces ? `<label class="sim-lbl" title="${t('sim.view_tip')}">${t('sim.view')} <select class="sim-view">
          <option value="auto">${t('sim.view_auto')}</option>
          <option value="1">${t('sim.view_face1')}</option>
          <option value="2">${t('sim.view_face2')}</option>
        </select></label>` : ''}
        <label class="sim-lbl"><input type="checkbox" class="sim-show-tool" checked> ${t('sim.tool')}</label>
        <label class="sim-lbl"><input type="checkbox" class="sim-show-paths" checked> ${t('sim.paths')}</label>
        <label class="sim-lbl" title="${t('sim.rapids_tip')}"><input type="checkbox" class="sim-show-rapids"> ${t('sim.rapids')}</label>
        ${hasDrawing ? `<label class="sim-lbl" title="${t('sim.drawing_tip')}"><input type="checkbox" class="sim-show-drawing" checked> ${t('sim.drawing')}</label>
        <label class="sim-lbl" title="${t('sim.part_only_tip')}"><input type="checkbox" class="sim-part-only"> ${t('sim.part_only')}</label>` : ''}
        <button class="sim-btn sim-close" title="${t('sim.close')}"><i class="fa-solid fa-xmark"></i></button>
      </div>
      <div class="sim-stage">
        <canvas class="sim-canvas"></canvas>
        <div class="sim-info">
          <span class="sim-op"></span>
        </div>
        <div class="sim-transport">
          <div class="sim-buttons">
            <button class="sim-btn" data-act="start" title="${t('sim.start')}"><i class="fa-solid fa-backward-step"></i></button>
            <button class="sim-btn" data-act="prev"  title="${t('sim.prev_op')}"><i class="fa-solid fa-backward"></i></button>
            <button class="sim-btn sim-play" data-act="play" title="${t('sim.play')}"><i class="fa-solid fa-play"></i></button>
            <button class="sim-btn" data-act="next"  title="${t('sim.next_op')}"><i class="fa-solid fa-forward"></i></button>
            <button class="sim-btn" data-act="end"   title="${t('sim.end')}"><i class="fa-solid fa-forward-step"></i></button>
          </div>
          <div class="sim-timeline">
            <span class="sim-time"></span>
            <input type="range" class="sim-progress" min="0" max="10000" step="1" value="0">
            <span class="sim-total"></span>
          </div>
        </div>
        <div class="sim-legend">
          <span><i style="background:#2f80ed"></i>${t('sim.kind_pocket')}</span>
          <span><i style="background:#f2711c"></i>${t('sim.kind_contour')}</span>
          <span><i style="background:#27ae60"></i>${t('sim.kind_drill')}</span>
        </div>
      </div>
      <div class="sim-status"></div>`;
    this.host.appendChild(el);
    this.el = el;
    const q = s => el.querySelector(s);
    this.ui = {
      canvas: q('.sim-canvas'), progress: q('.sim-progress'), play: q('.sim-play'),
      time: q('.sim-time'), total: q('.sim-total'), op: q('.sim-op'), status: q('.sim-status'),
      tool: q('.sim-show-tool'), paths: q('.sim-show-paths'), rapids: q('.sim-show-rapids'),
      drawing: q('.sim-show-drawing'), partOnly: q('.sim-part-only'),
    };

    el.querySelectorAll('[data-act]').forEach(b => b.addEventListener('click', () => this._action(b.dataset.act)));
    q('.sim-close').addEventListener('click', () => this.close());
    this.ui.progress.addEventListener('input', () => {
      this._setPartOnly(false);
      this._seek(this.total * this.ui.progress.value / 10000);
    });
    q('.sim-speed').addEventListener('change', e => { this.speed = Number(e.target.value); lsSet('sim.speed', this.speed); });
    q('.sim-view')?.addEventListener('change', e => { this.viewMode = e.target.value; this._updateView(); });
    this.ui.tool.addEventListener('change', () => this._applyVisibility());
    this.ui.paths.addEventListener('change', () => this._applyVisibility());
    this.ui.rapids.addEventListener('change', () => this._applyVisibility());
    this.ui.drawing?.addEventListener('change', () => this._applyVisibility());
    this.ui.partOnly?.addEventListener('change', e => this._setPartOnly(e.target.checked));
    this._onKey = e => {
      if (e.key === 'Escape') this.close();
      else if (e.key === ' ' && !e.target.closest?.('input, select, textarea')) { e.preventDefault(); this._action('play'); }
    };
    document.addEventListener('keydown', this._onKey);
  }

  _action(act) {
    const secs = this.program.sections.map(s => s.t0);
    if (act !== 'end') this._setPartOnly(false);
    if (act === 'play') {
      if (!this.playing && this.time >= this.total - 1e-6) this._seek(0);
      this.playing = !this.playing;
    } else if (act === 'start') { this.playing = false; this._seek(0); }
    else if (act === 'end')   { this.playing = false; this._seek(this.total); }
    else if (act === 'next')  { this._seek(secs.find(s => s > this.time + 0.01) ?? this.total); }
    else if (act === 'prev')  { this._seek([...secs].reverse().find(s => s < this.time - 0.5) ?? 0); }
    this._updatePlayIcon();
  }

  _updatePlayIcon() {
    this.ui.play.innerHTML = `<i class="fa-solid fa-${this.playing ? 'pause' : 'play'}"></i>`;
  }

  /** Visibilité des éléments selon les cases (et le mode « Pièce finie seule »). */
  _applyVisibility() {
    const full = !this.partOnly;
    if (this.toolMesh) this.toolMesh.visible = full && this.ui.tool.checked;
    if (this.paths)    this.paths.visible    = full && this.ui.paths.checked;
    if (this.rapids)   this.rapids.visible   = full && this.ui.rapids.checked;
    if (this.sides)    this.sides.visible    = full;
    if (this.drawLines) this.drawLines.visible = !!this.ui.drawing?.checked;
  }

  /** « Pièce finie seule » : fin du programme, seule la matière des pièces est affichée. */
  _setPartOnly(on) {
    if (on === this.partOnly) return;
    this.partOnly = on;
    if (this.ui.partOnly) this.ui.partOnly.checked = on;
    if (on) { this.playing = false; this._updatePlayIcon(); this._seek(this.total); }
    this.uniforms.uPartOnly.value = on ? 1 : 0;
    this._applyVisibility();
  }

  // ─── Scène ───────────────────────────────────────────────────────────────

  _setupThree() {
    this.renderer = new THREE.WebGLRenderer({ canvas: this.ui.canvas, antialias: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.setClearColor(this.light ? 0xd4d4de : 0x45454d);
    this.scene = new THREE.Scene();
    this.world = new THREE.Group();   // repère du brut ; retourné pour la vue face 2
    this.scene.add(this.world);
    this.camera = new THREE.PerspectiveCamera(40, 1, 0.5, 20000);
    this.camera.up.set(0, 0, 1);
    this.scene.add(new THREE.AmbientLight(0xffffff, 1.4));
    const sun = new THREE.DirectionalLight(0xffffff, 2.2);
    sun.position.set(200, -300, 500);
    this.scene.add(sun);
    const fill = new THREE.DirectionalLight(0xffffff, 0.8);
    fill.position.set(-300, 200, 200);
    this.scene.add(fill);
    this.controls = new OrbitControls(this.camera, this.ui.canvas);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.08;
    this.ui.canvas.addEventListener('dblclick', () => this._fitCamera());
  }

  _loadProgram() {
    const s = this.stock;
    this.program = parseProgram(this.code, {
      rapidRate: this.rapidRate,
      start: { x: (s.x0 + s.x1) / 2, y: (s.y0 + s.y1) / 2, z: s.top + 5 },
    });
    this.total = this.program.totalTime;
  }

  /** Point du repère machine de sa face → repère du brut (scène). */
  _toStock(p, face) {
    return toStockFrame(p, face, this.program.flip, this.stock.top, this.stock.bottom);
  }

  _buildSim() {
    const s = this.stock;
    const t0 = performance.now();
    const cell = cellFor(s.x1 - s.x0, s.y1 - s.y0, this.resolution);
    this.sim = new StockSim({ ...s, cell, toolRadius: this.toolR, moves: this.program.moves, flip: this.program.flip });
    const { nx, ny } = this.sim;

    const tex = (data, type) => {
      const tx = new THREE.DataTexture(data, nx, ny, THREE.RedFormat, type);
      tx.minFilter = tx.magFilter = THREE.NearestFilter;
      tx.needsUpdate = true;
      return tx;
    };
    this.heightTex = tex(this.sim.heights, THREE.FloatType);
    this.floorTex  = tex(this.sim.floors,  THREE.FloatType);
    this.maskTex   = tex(this._partMask(), THREE.UnsignedByteType);
    this.uniforms = {
      uHeight: { value: this.heightTex }, uFloor: { value: this.floorTex }, uMask: { value: this.maskTex },
      uSize: { value: new THREE.Vector2(nx, ny) }, uCell: { value: this.sim.cell },
      uTop: { value: s.top }, uBottom: { value: s.bottom }, uColor: { value: WOOD },
      uPartOnly: { value: 0 }, uViewFlip: { value: new THREE.Vector3(1, 1, 1) },
      uCam: { value: new THREE.Vector3() },   // caméra dans le repère des maillages (mise à jour à chaque image)
    };

    // Dessus et dessous : grilles de sommets déplacés par les textures (vus des deux côtés)
    const w = this.sim.x1 - this.sim.x0, d = this.sim.y1 - this.sim.y0;
    const cx = (this.sim.x0 + this.sim.x1) / 2, cy = (this.sim.y0 + this.sim.y1) / 2;
    const surf = (vert, frag) => {
      const m = new THREE.Mesh(
        new THREE.PlaneGeometry(w, d, nx - 1, ny - 1),
        new THREE.ShaderMaterial({ vertexShader: vert, fragmentShader: frag, uniforms: this.uniforms, side: THREE.DoubleSide }),
      );
      m.position.set(cx, cy, 0);
      m.frustumCulled = false;
      this.world.add(m);
      return m;
    };
    this.surface = surf(VERT_TOP, FRAG_TOP);
    this.under   = surf(VERT_UNDER, FRAG_UNDER);

    // Flancs du brut
    const sideMat = new THREE.MeshLambertMaterial({ color: WOOD.clone().multiplyScalar(0.8), side: THREE.DoubleSide });
    const hgt = s.top - s.bottom;
    const sides = new THREE.Group();
    const wall = (len, rotZ, px, py) => {
      const m = new THREE.Mesh(new THREE.PlaneGeometry(len, hgt), sideMat);
      m.rotation.set(Math.PI / 2, 0, rotZ, 'ZXY');
      m.position.set(px, py, s.bottom + hgt / 2);
      sides.add(m);
    };
    wall(w, 0, cx, this.sim.y0);
    wall(w, 0, cx, this.sim.y1);
    wall(d, Math.PI / 2, this.sim.x0, cy);
    wall(d, Math.PI / 2, this.sim.x1, cy);
    this.sides = sides;
    this.world.add(sides);

    this._lastVersion = -1;
    this.computeMs = performance.now() - t0;
    this._status();
  }

  /** Contours « outer » du dessin, en repère du brut. */
  _outerPolys() {
    return this.drawing.filter(d => d.outer && d.pts.length > 2)
      .map(d => d.pts.map(p => this._toStock({ ...p, z: 0 }, d.face)));
  }

  /** Masque des cases appartenant à une pièce (intérieur des contours « outer »). */
  _partMask() {
    const { nx, ny, x0, y0, cell } = this.sim;
    const mask = new Uint8Array(nx * ny);
    const polys = this._outerPolys();
    if (!polys.length) { mask.fill(255); return mask; }
    for (let j = 0; j < ny; j++) {
      const y = y0 + j * cell;
      for (const poly of polys) {
        const xs = [];
        for (let i = 0, k = poly.length - 1; i < poly.length; k = i++) {
          const a = poly[i], b = poly[k];
          if ((a.y > y) !== (b.y > y)) xs.push(a.x + (y - a.y) * (b.x - a.x) / (b.y - a.y));
        }
        xs.sort((p, q) => p - q);
        for (let k = 0; k + 1 < xs.length; k += 2) {
          const i0 = Math.max(0, Math.ceil((xs[k] - x0) / cell)), i1 = Math.min(nx - 1, Math.floor((xs[k + 1] - x0) / cell));
          for (let i = i0; i <= i1; i++) mask[j * nx + i] = 255;
        }
      }
    }
    return mask;
  }

  _buildPaths() {
    const feed = [], feedCol = [], rapid = [];
    const col = new THREE.Color();
    for (const mv of this.program.moves) {
      if (mv.type === 'dwell' || mv.len === 0) continue;
      const kind = this.program.sections[mv.sec]?.kind ?? 'contour';
      const raw = [];
      if (mv.type === 'arc') {
        const n = Math.max(2, Math.ceil(Math.abs(mv.sw) / (Math.PI / 36)));
        for (let k = 0; k <= n; k++) {
          const a = mv.a0 + mv.sw * k / n;
          raw.push({ x: mv.cx + mv.r * Math.cos(a), y: mv.cy + mv.r * Math.sin(a), z: mv.z0 + (mv.z - mv.z0) * k / n });
        }
      } else {
        raw.push({ x: mv.x0, y: mv.y0, z: mv.z0 }, { x: mv.x, y: mv.y, z: mv.z });
      }
      const pts = raw.map(p => this._toStock(p, mv.face));
      const out = mv.type === 'rapid' ? rapid : feed;
      col.setHex(KIND_COLORS[kind] ?? KIND_COLORS.contour);
      for (let k = 0; k + 1 < pts.length; k++) {      // un segment par paire de points consécutifs
        out.push(pts[k].x, pts[k].y, pts[k].z, pts[k + 1].x, pts[k + 1].y, pts[k + 1].z);
        if (out === feed) feedCol.push(col.r, col.g, col.b, col.r, col.g, col.b);
      }
    }
    const fg = new THREE.BufferGeometry();
    fg.setAttribute('position', new THREE.Float32BufferAttribute(feed, 3));
    fg.setAttribute('color', new THREE.Float32BufferAttribute(feedCol, 3));
    this.paths = new THREE.LineSegments(fg, new THREE.LineBasicMaterial({ vertexColors: true, transparent: true, opacity: 0.85 }));
    this.world.add(this.paths);

    const rg = new THREE.BufferGeometry();
    rg.setAttribute('position', new THREE.Float32BufferAttribute(rapid, 3));
    // Pointillés repartant de zéro sur chaque segment : un même déplacement répété à chaque
    // passe se superpose exactement (avec des distances cumulées, les copies décalées
    // remplissaient les trous et le trait paraissait continu).
    const dist = new Float32Array(rapid.length / 3);
    for (let k = 0; k < dist.length; k += 2) {
      const p = k * 3;
      dist[k + 1] = Math.hypot(rapid[p + 3] - rapid[p], rapid[p + 4] - rapid[p + 1], rapid[p + 5] - rapid[p + 2]);
    }
    rg.setAttribute('lineDistance', new THREE.BufferAttribute(dist, 1));
    this.rapids = new THREE.LineSegments(rg, new THREE.LineDashedMaterial({ color: RAPID_COLOR, dashSize: 2, gapSize: 2 }));
    this.rapids.visible = false;
    this.world.add(this.rapids);
  }

  /** « Dessin » : contours théoriques, juste au-dessus (face 1) ou au-dessous (face 2) du brut. */
  _buildDrawing() {
    if (!this.drawing.length) return;
    const s = this.stock, seg = [];
    for (const d of this.drawing) {
      const z = d.face === 2 ? s.bottom - 0.05 : s.top + 0.05;
      const pts = d.pts.map(p => ({ ...this._toStock({ ...p, z: 0 }, d.face), z }));
      for (let i = 0; i < pts.length; i++) {
        const a = pts[i], b = pts[(i + 1) % pts.length];
        seg.push(a.x, a.y, a.z, b.x, b.y, b.z);
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(seg, 3));
    this.drawLines = new THREE.LineSegments(g, new THREE.LineBasicMaterial({ color: this.light ? 0x101018 : 0x1c1c22 }));
    this.world.add(this.drawLines);
  }

  _buildTool() {
    const len = Math.max(20, (this.stock.top - this.stock.bottom) * 1.6);
    const geo = new THREE.CylinderGeometry(this.toolR, this.toolR, len, 24);
    geo.rotateX(Math.PI / 2);
    geo.translate(0, 0, len / 2);       // origine du maillage = bout de la fraise
    this.toolMesh = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ color: 0xd0d4da, metalness: 0.6, roughness: 0.35 }));
    this.world.add(this.toolMesh);
  }

  _fitCamera() {
    const s = this.stock;
    const cx = (s.x0 + s.x1) / 2, cy = (s.y0 + s.y1) / 2, cz = (s.top + s.bottom) / 2;
    const size = Math.max(s.x1 - s.x0, s.y1 - s.y0);
    this.camera.position.set(cx + size * 0.35, cy - size * 1.05, cz + size * 0.85);
    this.controls.target.set(cx, cy, cz);
    this.controls.update();
  }

  /** Vue face 1 (dessus en haut) ou face 2 (pièce retournée comme sur la machine). */
  _setViewFace(face) {
    if (face === this.viewFace) return;
    this.viewFace = face;
    const f = this.program.flip, s = this.stock;
    const zm = s.top + s.bottom;          // retournement : z → top + bottom − z
    this.world.rotation.set(0, 0, 0);
    this.world.position.set(0, 0, 0);
    if (face === 2 && f) {
      if (f.axis === 'x') { this.world.rotation.y = Math.PI; this.world.position.set(2 * f.c, 0, zm); }
      else                { this.world.rotation.x = Math.PI; this.world.position.set(0, 2 * f.c, zm); }
    }
    const flipped = face === 2 && f;
    this.uniforms.uViewFlip.value.set(flipped && f.axis === 'x' ? -1 : 1, flipped && f.axis === 'y' ? -1 : 1, flipped ? -1 : 1);
  }

  _updateView(currentFace = this._currentFace ?? 1) {
    this._setViewFace(this.viewMode === 'auto' ? currentFace : Number(this.viewMode));
  }

  // ─── Simulation ──────────────────────────────────────────────────────────

  _seek(time, force = false) {
    this.time = Math.max(0, Math.min(this.total, time));
    if (force) this.sim.reset();
    this.sim.seek(this.time);
    const mv = this.program.moves[moveIndexAt(this.program.moves, this.time)];
    const face = mv?.face ?? 1;
    const p = this.sim.toolPosition();
    if (p && this.toolMesh) {
      const q = this._toStock(p, face);
      this.toolMesh.position.set(q.x, q.y, q.z);
      this.toolMesh.rotation.set(0, face === 2 && this.program.flip ? Math.PI : 0, 0);   // face 2 : outil par en dessous
    }
    this._currentFace = face;
    if (this.program.flip) this._updateView(face);
    const frac = this.total ? this.time / this.total : 0;
    this.ui.progress.value = Math.round(frac * 10000);
    this.ui.progress.style.setProperty('--p', `${(frac * 100).toFixed(2)}%`);   // partie remplie de la ligne de temps
    this.ui.time.textContent  = formatDuration(this.time);
    this.ui.total.textContent = formatDuration(this.total);
    const label = this.program.sections[mv?.sec]?.label ?? '';
    this.ui.op.textContent = this.program.flip && label ? `${t(face === 2 ? 'sim.view_face2' : 'sim.view_face1')} · ${label}` : label;
  }

  _status() {
    const s = this.sim;
    this.ui.status.textContent =
      `${t('sim.help')} · ${s.nx} × ${s.ny} ${t('sim.points')} · ${s.cell.toFixed(2).replace('.', ',')} mm · ${t('sim.compute')} ${Math.round(this.computeMs)} ms`;
  }

  _loop() {
    this._raf = requestAnimationFrame(() => this._loop());
    const now = performance.now();
    const dt = Math.min(0.1, (now - this._lastFrame) / 1000);
    this._lastFrame = now;
    if (this.playing) {
      this._seek(this.time + dt * this.speed);
      if (this.time >= this.total) { this.playing = false; this._updatePlayIcon(); }
    }
    if (this.sim.version !== this._lastVersion) {
      this.heightTex.needsUpdate = true;
      if (this.program.flip) this.floorTex.needsUpdate = true;   // le dessous ne change qu'en face 2
      this._lastVersion = this.sim.version;
    }
    this.controls.update();
    // Caméra dans le repère des maillages de surface (normales tournées vers elle)
    this.surface.updateWorldMatrix(true, false);
    this.surface.worldToLocal(this.uniforms.uCam.value.copy(this.camera.position));
    this.renderer.render(this.scene, this.camera);
  }

  _resize() {
    const c = this.ui.canvas;
    const w = c.clientWidth, h = c.clientHeight;
    if (!w || !h) return;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  _disposeObj(obj) {
    if (!obj) return;
    obj.parent?.remove(obj);
    obj.traverse(o => { o.geometry?.dispose(); o.material?.dispose?.(); });
  }

  close() {
    if (this._closed) return;
    this._closed = true;
    cancelAnimationFrame(this._raf);
    this._resizeObs?.disconnect();
    document.removeEventListener('keydown', this._onKey);
    [this.surface, this.under, this.sides, this.paths, this.rapids, this.drawLines, this.toolMesh].forEach(o => this._disposeObj(o));
    [this.heightTex, this.floorTex, this.maskTex].forEach(tx => tx?.dispose());
    this.controls.dispose();
    this.renderer.dispose();
    this.el.remove();
    this.onClose?.();
  }
}
