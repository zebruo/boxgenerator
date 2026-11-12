/**
 * SimulationView.js — Panneau superposé de simulation d'usinage (matière + parcours).
 *
 * S'affiche par-dessus la zone d'aperçu. Rejoue le G-code (GCodeProgram) dans une grille
 * de hauteurs (StockSim) et l'affiche en 3D : brut usiné, fraise, trajectoires colorées
 * par opération. Commandes : lecture, pas à pas par opération, progression, vitesse,
 * résolution, vitesse des rapides (pour le temps estimé).
 */

import * as THREE from '../../lib/three.module.js';
import { OrbitControls } from '../../lib/jsm/controls/OrbitControls.js';
import { t } from '../i18n.js';
import { parseProgram, moveIndexAt, formatDuration } from './GCodeProgram.js';
import { StockSim, cellFor } from './StockSim.js';

const KIND_COLORS = { pocket: 0x2f80ed, contour: 0xf2711c, drill: 0x27ae60 };
const RAPID_COLOR = 0x9aa0a6;
const WOOD = new THREE.Color(0xd99559);
const SPEEDS = [1, 5, 10, 20, 50, 100, 200, 500];

function lsGet(key, def) { try { return localStorage.getItem(key) ?? def; } catch { return def; } }
function lsSet(key, val) { try { localStorage.setItem(key, val); } catch { /* stockage indisponible */ } }

const VERT = /* glsl */`
  uniform sampler2D uHeight;
  uniform vec2 uSize;
  uniform float uBottom;
  varying vec2 vCell;
  void main() {
    vCell = uv * (uSize - 1.0);
    float h = texture2D(uHeight, (floor(vCell + 0.5) + 0.5) / uSize).r;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position.xy, max(h, uBottom), 1.0);
  }`;

const FRAG = /* glsl */`
  uniform sampler2D uHeight;
  uniform vec2 uSize;
  uniform float uCell, uTop, uBottom;
  uniform vec3 uColor;
  varying vec2 vCell;
  float H(vec2 c) {
    c = clamp(c, vec2(0.0), uSize - 1.0);
    return max(texture2D(uHeight, (c + 0.5) / uSize).r, uBottom);
  }
  void main() {
    vec2 c = floor(vCell + 0.5);
    float h = H(c);
    if (h <= uBottom + 0.001) discard;              // découpe traversante : on voit à travers
    vec3 n = normalize(vec3((H(c - vec2(1.0, 0.0)) - H(c + vec2(1.0, 0.0))) / (2.0 * uCell),
                            (H(c - vec2(0.0, 1.0)) - H(c + vec2(0.0, 1.0))) / (2.0 * uCell), 1.0));
    float d = 0.38 + 0.55 * max(dot(n, normalize(vec3(0.35, -0.55, 0.75))), 0.0)
                   + 0.18 * max(dot(n, normalize(vec3(-0.5, 0.45, 0.6))), 0.0);
    float depth = clamp((uTop - h) / max(uTop - uBottom, 0.001), 0.0, 1.0);
    gl_FragColor = vec4(uColor * (1.0 - 0.28 * depth) * d, 1.0);
  }`;

// Dessous du brut : plein là où il reste de la matière jusqu'au fond, ajouré là où la
// découpe traverse (on voit alors la rainure et les tabs par en dessous).
const VERT_BOTTOM = /* glsl */`
  uniform vec2 uSize;
  varying vec2 vCell;
  void main() {
    vCell = uv * (uSize - 1.0);
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }`;

const FRAG_BOTTOM = /* glsl */`
  uniform sampler2D uHeight;
  uniform vec2 uSize;
  uniform float uBottom;
  uniform vec3 uColor;
  varying vec2 vCell;
  void main() {
    vec2 c = clamp(floor(vCell + 0.5), vec2(0.0), uSize - 1.0);
    if (texture2D(uHeight, (c + 0.5) / uSize).r <= uBottom + 0.001) discard;
    gl_FragColor = vec4(uColor * 0.62, 1.0);
  }`;

export class SimulationView {
  /**
   * @param {HTMLElement} host   conteneur (zone d'aperçu) dans lequel le panneau se superpose
   * @param {object} o
   * @param {string} o.code             G-code à simuler
   * @param {{x0,y0,x1,y1,top,bottom}} o.stock  brut, en coordonnées machine
   * @param {number} o.toolDiameter
   * @param {number} [o.rapidRate]      vitesse des G0 de la machine (mm/min), pour le temps estimé
   * @param {boolean} [o.light]         thème clair
   * @param {Function} [o.onClose]
   */
  constructor(host, { code, stock, toolDiameter, rapidRate = 3000, light = false, onClose = null }) {
    this.host = host;
    this.code = code;
    this.stock = stock;
    this.toolR = toolDiameter / 2;
    this.onClose = onClose;
    this.playing = false;
    this.time = 0;
    this.speed = Number(lsGet('sim.speed', 50)) || 50;
    this.resolution = 'standard';          // ≈ 0,27 mm : suffisant pour ces pièces
    this.rapidRate = rapidRate > 0 ? rapidRate : 3000;
    this.light = light;

    this._buildDom();
    this._setupThree();
    this._loadProgram();
    this._buildSim();
    this._buildPaths();
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
    el.innerHTML = `
      <div class="sim-toolbar">
        <span class="sim-title">${t('sim.title')}</span>
        <label class="sim-lbl">${t('sim.speed')} <select class="sim-speed">${speedOpts}</select></label>
        <label class="sim-lbl"><input type="checkbox" class="sim-show-tool" checked> ${t('sim.tool')}</label>
        <label class="sim-lbl"><input type="checkbox" class="sim-show-paths" checked> ${t('sim.paths')}</label>
        <label class="sim-lbl"><input type="checkbox" class="sim-show-rapids"> ${t('sim.rapids')}</label>
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
    };

    el.querySelectorAll('[data-act]').forEach(b => b.addEventListener('click', () => this._action(b.dataset.act)));
    q('.sim-close').addEventListener('click', () => this.close());
    this.ui.progress.addEventListener('input', () => {
      this._seek(this.total * this.ui.progress.value / 10000);
    });
    q('.sim-speed').addEventListener('change', e => { this.speed = Number(e.target.value); lsSet('sim.speed', this.speed); });
    q('.sim-show-tool').addEventListener('change', e => { this.toolMesh.visible = e.target.checked; });
    q('.sim-show-paths').addEventListener('change', e => { this.paths.visible = e.target.checked; });
    q('.sim-show-rapids').addEventListener('change', e => { this.rapids.visible = e.target.checked; });
    this._onKey = e => {
      if (e.key === 'Escape') this.close();
      else if (e.key === ' ' && !e.target.closest?.('input, select, textarea')) { e.preventDefault(); this._action('play'); }
    };
    document.addEventListener('keydown', this._onKey);
  }

  _action(act) {
    const secs = this.program.sections.map(s => s.t0);
    if (act === 'play') {
      if (!this.playing && this.time >= this.total - 1e-6) this._seek(0);
      this.playing = !this.playing;
    } else if (act === 'start') { this.playing = false; this._seek(0); }
    else if (act === 'end')   { this.playing = false; this._seek(this.total); }
    else if (act === 'next')  { this._seek(secs.find(s => s > this.time + 0.01) ?? this.total); }
    else if (act === 'prev')  { this._seek([...secs].reverse().find(s => s < this.time - 0.5) ?? 0); }
    this.ui.play.innerHTML = `<i class="fa-solid fa-${this.playing ? 'pause' : 'play'}"></i>`;
  }

  // ─── Scène ───────────────────────────────────────────────────────────────

  _setupThree() {
    this.renderer = new THREE.WebGLRenderer({ canvas: this.ui.canvas, antialias: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.setClearColor(this.light ? 0xd4d4de : 0x45454d);
    this.scene = new THREE.Scene();
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

  _buildSim() {
    const s = this.stock;
    const t0 = performance.now();
    const cell = cellFor(s.x1 - s.x0, s.y1 - s.y0, this.resolution);
    this.sim = new StockSim({ ...s, cell, toolRadius: this.toolR, moves: this.program.moves });
    const { nx, ny } = this.sim;

    // Surface : grille de sommets déplacés par la texture de hauteurs
    this._disposeObj(this.surface);
    this._disposeObj(this.sides);
    this.heightTex?.dispose();
    this.heightTex = new THREE.DataTexture(this.sim.heights, nx, ny, THREE.RedFormat, THREE.FloatType);
    this.heightTex.minFilter = this.heightTex.magFilter = THREE.NearestFilter;
    this.heightTex.needsUpdate = true;
    const w = this.sim.x1 - this.sim.x0, d = this.sim.y1 - this.sim.y0;
    const geo = new THREE.PlaneGeometry(w, d, nx - 1, ny - 1);
    const uniforms = {
      uHeight: { value: this.heightTex }, uSize: { value: new THREE.Vector2(nx, ny) },
      uCell: { value: this.sim.cell }, uTop: { value: s.top }, uBottom: { value: s.bottom },
      uColor: { value: WOOD },
    };
    // DoubleSide : par une découpe traversante, on voit les flancs de la rainure et les tabs
    const mat = new THREE.ShaderMaterial({ vertexShader: VERT, fragmentShader: FRAG, uniforms, side: THREE.DoubleSide });
    this.surface = new THREE.Mesh(geo, mat);
    this.surface.position.set((this.sim.x0 + this.sim.x1) / 2, (this.sim.y0 + this.sim.y1) / 2, 0);
    this.surface.frustumCulled = false;
    this.scene.add(this.surface);

    // Flancs et dessous du brut
    const sideMat = new THREE.MeshLambertMaterial({ color: WOOD.clone().multiplyScalar(0.8), side: THREE.DoubleSide });
    const hgt = s.top - s.bottom, cx = (this.sim.x0 + this.sim.x1) / 2, cy = (this.sim.y0 + this.sim.y1) / 2;
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
    // Dessous : même grille de cases que la surface, ajouré là où la découpe traverse
    const under = new THREE.Mesh(
      new THREE.PlaneGeometry(w, d),
      new THREE.ShaderMaterial({ vertexShader: VERT_BOTTOM, fragmentShader: FRAG_BOTTOM, uniforms, side: THREE.DoubleSide }),
    );
    under.position.set(cx, cy, s.bottom - 0.02);   // juste sous la surface (pas de scintillement)
    sides.add(under);
    this.sides = sides;
    this.scene.add(sides);

    this._lastVersion = -1;
    this.computeMs = performance.now() - t0;
    this._status();
  }

  _buildPaths() {
    const feed = [], feedCol = [], rapid = [];
    const col = new THREE.Color();
    for (const mv of this.program.moves) {
      if (mv.type === 'dwell' || mv.len === 0) continue;
      const kind = this.program.sections[mv.sec]?.kind ?? 'contour';
      const pts = [];
      if (mv.type === 'arc') {
        const n = Math.max(2, Math.ceil(Math.abs(mv.sw) / (Math.PI / 36)));
        for (let k = 0; k <= n; k++) {
          const a = mv.a0 + mv.sw * k / n;
          pts.push(mv.cx + mv.r * Math.cos(a), mv.cy + mv.r * Math.sin(a), mv.z0 + (mv.z - mv.z0) * k / n);
        }
      } else {
        pts.push(mv.x0, mv.y0, mv.z0, mv.x, mv.y, mv.z);
      }
      const out = mv.type === 'rapid' ? rapid : feed;
      col.setHex(KIND_COLORS[kind] ?? KIND_COLORS.contour);
      for (let k = 0; k + 5 < pts.length; k += 3) {      // un segment par paire de points consécutifs
        out.push(pts[k], pts[k + 1], pts[k + 2], pts[k + 3], pts[k + 4], pts[k + 5]);
        if (out === feed) feedCol.push(col.r, col.g, col.b, col.r, col.g, col.b);
      }
    }
    const fg = new THREE.BufferGeometry();
    fg.setAttribute('position', new THREE.Float32BufferAttribute(feed, 3));
    fg.setAttribute('color', new THREE.Float32BufferAttribute(feedCol, 3));
    this.paths = new THREE.LineSegments(fg, new THREE.LineBasicMaterial({ vertexColors: true, transparent: true, opacity: 0.85 }));
    this.scene.add(this.paths);

    const rg = new THREE.BufferGeometry();
    rg.setAttribute('position', new THREE.Float32BufferAttribute(rapid, 3));
    this.rapids = new THREE.LineSegments(rg, new THREE.LineDashedMaterial({ color: RAPID_COLOR, dashSize: 2, gapSize: 2 }));
    this.rapids.computeLineDistances();
    this.rapids.visible = false;
    this.scene.add(this.rapids);
  }

  _buildTool() {
    const len = Math.max(20, (this.stock.top - this.stock.bottom) * 1.6);
    const geo = new THREE.CylinderGeometry(this.toolR, this.toolR, len, 24);
    geo.rotateX(Math.PI / 2);
    geo.translate(0, 0, len / 2);       // origine du maillage = bout de la fraise
    this.toolMesh = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ color: 0xd0d4da, metalness: 0.6, roughness: 0.35 }));
    this.scene.add(this.toolMesh);
  }

  _fitCamera() {
    const s = this.stock;
    const cx = (s.x0 + s.x1) / 2, cy = (s.y0 + s.y1) / 2, cz = (s.top + s.bottom) / 2;
    const size = Math.max(s.x1 - s.x0, s.y1 - s.y0);
    this.camera.position.set(cx + size * 0.35, cy - size * 1.05, cz + size * 0.85);
    this.controls.target.set(cx, cy, cz);
    this.controls.update();
  }

  // ─── Simulation ──────────────────────────────────────────────────────────

  _seek(time, force = false) {
    this.time = Math.max(0, Math.min(this.total, time));
    if (force) this.sim.reset();
    const p = this.sim.seek(this.time);
    if (p) this.toolMesh?.position.set(p.x, p.y, p.z);
    const frac = this.total ? this.time / this.total : 0;
    this.ui.progress.value = Math.round(frac * 10000);
    this.ui.progress.style.setProperty('--p', `${(frac * 100).toFixed(2)}%`);   // partie remplie de la ligne de temps
    this.ui.time.textContent  = formatDuration(this.time);
    this.ui.total.textContent = formatDuration(this.total);
    const mv = this.program.moves[moveIndexAt(this.program.moves, this.time)];
    this.ui.op.textContent = this.program.sections[mv?.sec]?.label ?? '';
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
      if (this.time >= this.total) { this.playing = false; this.ui.play.innerHTML = '<i class="fa-solid fa-play"></i>'; }
    }
    if (this.sim.version !== this._lastVersion) {
      this.heightTex.needsUpdate = true;
      this._lastVersion = this.sim.version;
    }
    this.controls.update();
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
    this.scene.remove(obj);
    obj.traverse(o => { o.geometry?.dispose(); o.material?.dispose?.(); });
  }

  close() {
    if (this._closed) return;
    this._closed = true;
    cancelAnimationFrame(this._raf);
    this._resizeObs?.disconnect();
    document.removeEventListener('keydown', this._onKey);
    [this.surface, this.sides, this.paths, this.rapids, this.toolMesh].forEach(o => this._disposeObj(o));
    this.heightTex?.dispose();
    this.controls.dispose();
    this.renderer.dispose();
    this.el.remove();
    this.onClose?.();
  }
}
