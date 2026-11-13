import * as THREE from '../../lib/three.module.js';
import { OrbitControls } from '../../lib/jsm/controls/OrbitControls.js';
import { buildPartitionContours } from '../gcode/PartitionedPocket.js';
import { FingerJointBox } from '../boxes/FingerJointBox.js';
import { insetPolygon, offsetPolygons } from '../gcode/Offset.js';

// Teinte unique des pièces (potiron) : fonds et parois se distinguent par l'éclairage,
// comme dans la simulation d'usinage.
const BOX_COLOR = 0xff9937;   // orange matière (aperçu 3D et simulation)
const PHANTOM_COLOR = 0x8e8e96;   // pièces d'illustration (boîte du dessous de l'empilable)
// Boîte à encoches : une teinte par panneau (tons bois contrastés) pour distinguer les encoches
const FINGER_COLORS = {
  bottom: 0xff7518,   // potiron
  front:  0xe8b04a,   // ocre clair
  back:   0xb5541c,   // brique
  left:   0xf3d18b,   // sable
  right:  0x8a4b2a,   // noyer
  lid:    0xffa860,   // abricot
};

/**
 * Prévisualisation 3D WebGL avec Three.js.
 * Système de coordonnées Z-up :
 *   Box.X → Three.X (longueur)
 *   Box.Y → Three.Y (profondeur)
 *   Box.Height → Three.Z (hauteur, axe up)
 */
export class ThreePreview {
  constructor(canvas) {
    this.canvas      = canvas;
    this.meshes      = [];
    this.rafId       = null;
    this.z0Pos       = 'center'; // 'center' | 'front-left' | 'front-right' | 'back-left' | 'back-right'
    this.z0Level     = 'top'; // 'bottom' (Z=0) | 'top' (Z=visH)
    this.stockOffset = 0;        // mm ajouté sur chaque côté XY en Z
    this.stockSide   = 'top';   // 'top' | 'bottom'
    this.lidLayout   = 'flat';  // boîte à couvercle : 'flat' (comme usinée) | 'assembled'
    this._gizmos     = [];
    this._xray       = false;
    this._setup();
  }

  // ─── Initialisation ───────────────────────────────────────────────────────

  _setup() {
    // Renderer
    this.renderer = new THREE.WebGLRenderer({ canvas: this.canvas, antialias: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;
    this.renderer.setClearColor(0x333333);

    // Scène
    this.scene = new THREE.Scene();

    // Caméra Z-up
    this.camera = new THREE.PerspectiveCamera(50, 1, 0.1, 50000);
    this.camera.up.set(0, 0, 1);
    this.camera.position.set(300, -300, 250);

    // Lumières
    const ambient = new THREE.AmbientLight(0xffffff, 0.55);   // neutre : la teinte des pièces reste fidèle
    this.scene.add(ambient);

    const sun = new THREE.DirectionalLight(0xffffff, 1.3);
    sun.position.set(300, -200, 500);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    // Biais contre l'« acné d'ombre » (stries en moiré sur les faces rasantes)
    sun.shadow.bias = -0.0005;
    sun.shadow.normalBias = 0.6;
    const sc = sun.shadow.camera;
    sc.near = 1; sc.far = 3000;
    sc.left = -400; sc.right = 400; sc.top = 400; sc.bottom = -400;
    this.scene.add(sun);

    const fill = new THREE.DirectionalLight(0xffffff, 0.35);
    fill.position.set(-300, 300, 100);
    this.scene.add(fill);

    const rim = new THREE.DirectionalLight(0xffffff, 0.15);
    rim.position.set(0, 0, -300);
    this.scene.add(rim);

    // Grille horizontale (plan XY, Z-up)
    this.grid = new THREE.GridHelper(2000, 60, 0x4c4c4c, 0x3e3e3e);
    this.grid.rotation.x = Math.PI / 2;
    this.scene.add(this.grid);

    // Contrôles orbitaux
    this.controls = new OrbitControls(this.camera, this.canvas);
    this.controls.enableDamping  = true;
    this.controls.dampingFactor  = 0.07;
    this.controls.zoomSpeed      = 1.2;
    this.controls.rotateSpeed    = 0.7;
    this.canvas.addEventListener('dblclick', () => this.resetView());   // recadrage par défaut

    this._animate();
  }

  _animate() {
    this.rafId = requestAnimationFrame(() => this._animate());
    this.controls.update();
    this.renderer.render(this.scene, this.camera);
  }

  // ─── API publique ─────────────────────────────────────────────────────────

  resize(w, h) {
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  setTheme(light) {
    if (light) {
      this.renderer.setClearColor(0xc6c6c6);
      this.scene.remove(this.grid);
      this.grid = new THREE.GridHelper(2000, 60, 0x9a9a9a, 0xb2b2b2);
      this.grid.rotation.x = Math.PI / 2;
      this.scene.add(this.grid);
    } else {
      this.renderer.setClearColor(0x333333);
      this.scene.remove(this.grid);
      this.grid = new THREE.GridHelper(2000, 60, 0x4c4c4c, 0x3e3e3e);
      this.grid.rotation.x = Math.PI / 2;
      this.scene.add(this.grid);
    }
  }

  /** Reconstruit toute la géométrie 3D selon la forme et le type de boîte. */
  build(shapePts, bb, boxTypeKey, boxParams, machineParams) {
    this._clear();
    this._clearGizmos();
    const W  = bb.width;
    const D  = bb.height;
    const H  = boxParams.height   ?? 30;
    const wt  = boxParams.wallThickness ?? machineParams.materialThickness;
    const bt  = machineParams.materialThickness;
    const bFl = boxParams.bottomThickness ?? bt;

    const _rimH = boxParams.rimHeight ?? 8;
    // Compartiments (cloisons) : mêmes contours que le G-code (découpés par la cavité)
    const cells = this._compartments(shapePts, bb, boxTypeKey, boxParams, machineParams);
    let layW = W, layD = D;   // emprise de ce qui est affiché (pièces côte à côte à plat)
    // Boîtes en plusieurs pièces (couvercle, encoches) : disposition (à plat / assemblée) et
    // hauteur visible
    let lidLay = null;
    switch (boxTypeKey) {
      case 'open-tray':    this._buildOpenTray(shapePts, W, D, H, wt, bFl, cells); break;
      case 'finger-joint':
        lidLay = this._buildFingerBox(shapePts, H, boxParams);
        layW = lidLay.W; layD = lidLay.D;
        break;
      case 'lid-box': {
        const _r = boxParams.rabbet ?? 3; const _bFll = boxParams.lidBottomThickness ?? bFl;
        lidLay = this._buildLidBox(shapePts, H, boxParams.lidHeight ?? 15, boxParams.wallThickness ?? 6, _r, boxParams.rabbetDepth ?? 4, boxParams.rabbetSide ?? 0, boxParams.clearance ?? 0, bFl, _bFll, cells);
        layW = lidLay.W; layD = lidLay.D;
        break;
      }
      case 'stackable': {
        const _gap = boxParams.clearance ?? 0.3;
        this._buildStackable(shapePts, H, wt, bFl, _rimH, _gap);
        break;
      }
    }

    // Positionner la caméra au centre de la géométrie visible
    let visH, visZCenter;
    if (lidLay) {
      visH = lidLay.height;   // côte à côte : la plus haute des deux ; assemblée : boîte fermée
      visZCenter = visH / 2;
    } else if (boxTypeKey === 'stackable') {
      visH = 2 * H + 2 * _rimH;   // boîte usinée + boîte du dessous, chacune avec son plot
      visZCenter = -_rimH;        // milieu entre H (haut) et −(H + 2·rimH) (bas)
    } else {
      visH = H;
      visZCenter = H / 2;
    }
    // Cadrage par défaut au premier affichage, au changement de type de boîte ou de disposition
    // (ou double-clic) ; sinon on garde l'angle et le zoom de l'utilisateur et on suit
    // seulement le centre de la pièce quand ses dimensions changent.
    const center  = new THREE.Vector3(layW / 2, layD / 2, visZCenter);
    const viewKey = `${boxTypeKey}|${lidLay ? this.lidLayout : ''}`;
    const size    = Math.max(layW, layD, visH);
    // Cote non valide (NaN) : on ne touche pas à la caméra, qui resterait cassée ensuite
    const finite  = [center.x, center.y, center.z, size].every(Number.isFinite);
    if (finite) {
      this._frame = { center, size };
      const camOk = [this.camera.position, this.controls.target].every(v => Number.isFinite(v.x + v.y + v.z));
      if (viewKey !== this._viewKey || !this._lastCenter || !camOk) {
        this._viewKey = viewKey;
        this.resetView();
      } else {
        const d = center.clone().sub(this._lastCenter);
        this.camera.position.add(d);
        this.controls.target.add(d);
        this.controls.update();
      }
      this._lastCenter = center;
    }

    // Grille sous la boîte (Z=0 = sol, grille à Z=-1)
    // Boîte empilable : sol entre la boîte usinée et la boîte du dessous (milieu de l'intervalle)
    const gridZ = boxTypeKey === 'stackable' ? -_rimH / 2 : -1;
    this.grid.position.set(layW / 2, layD / 2, gridZ);

    // Gizmo Z0 et brut — top par défaut au sommet de la boîte (Z=H) ; boîte à couvercle :
    // brut commun aux deux pièces (épaisseur = la plus haute), comme le G-code
    // Vue assemblée : ni brut ni repère Z0 (ils décrivent la disposition d'usinage)
    if (lidLay?.assembled) return;
    let machH = H;
    if (boxTypeKey === 'stackable') machH = H + _rimH;
    else if (lidLay) machH = lidLay.height;
    const zOff  = boxTypeKey === 'stackable' ? -_rimH : 0;
    this._buildZ0Gizmo(layW, layD, machH, this.z0Pos, this.z0Level, zOff);
    // Hauteurs différentes : deux bruts, chacun à l'épaisseur de sa pièce. Le G-code place les
    // dessus au même niveau (le repère Z0 est ainsi juste pour les deux) : la pièce la moins
    // haute, avec son brut, est remontée au niveau de la plus haute.
    const pc = lidLay?.pieces;
    if (pc && Math.abs(pc.H - pc.lidH) > 1e-6) {
      const gap = Math.abs(pc.H - pc.lidH);
      const zBody = pc.H < pc.lidH ? gap : 0, zLid = pc.lidH < pc.H ? gap : 0;
      for (const m of pc.bodyMeshes) m.position.z += zBody;
      pc.lid.position.z += zLid;
      this._buildStock(pc.W, pc.D, pc.H,    this.stockOffset, this.stockSide, zBody, 0,     0);
      this._buildStock(pc.W, pc.D, pc.lidH, this.stockOffset, this.stockSide, zLid,  pc.dx, pc.dy);
    } else {
      this._buildStock(layW, layD, machH, this.stockOffset, this.stockSide, zOff);
    }
  }

  /** Cadrage par défaut (vue 3/4 avant-droite) sur la dernière géométrie construite. */
  resetView() {
    if (!this._frame) return;
    const { center: c, size } = this._frame;
    const dist = size * 1.45;
    this.camera.position.set(c.x + dist * 0.7, c.y - dist * 0.7, c.z + dist * 0.55);
    this.controls.target.copy(c);
    this.controls.update();
  }

  dispose() {
    cancelAnimationFrame(this.rafId);
    this._clear();
    this._clearGizmos();
    this.controls.dispose();
    this.renderer.dispose();
  }

  // ─── Construction des géométries ──────────────────────────────────────────

  _buildOpenTray(pts, W, D, H, wt, bt, cells = null) {
    // Fond (forme réelle, épaisseur bt)
    const bottomShape = this._shape(pts);
    const bottomGeo = new THREE.ExtrudeGeometry(bottomShape, { depth: bt, bevelEnabled: false });
    this._mesh(bottomGeo, this._mat(BOX_COLOR, { roughness: 0.85 }));

    // Parois (et cloisons) : forme percée de la cavité — ou des compartiments — extrudée de bt à H
    const innerPts = this._offsetPts(pts, -wt);  // offset négatif = vers l'intérieur (CCW)
    const holes    = cells ?? [innerPts];
    const wallShape = this._shape(pts);
    wallShape.holes = holes.map(h => this._path(h));

    const wallGeo = new THREE.ExtrudeGeometry(wallShape, { depth: H - bt, bevelEnabled: false });
    const wallMesh = this._mesh(wallGeo, this._mat(BOX_COLOR, { roughness: 0.75 }));
    wallMesh.position.z = bt;

    // Plancher intérieur de chaque compartiment (légèrement au-dessus du fond)
    for (const h of holes) {
      const floorMesh = this._mesh(new THREE.ShapeGeometry(this._shape(h)),
        this._mat(BOX_COLOR, { roughness: 0.95, side: THREE.FrontSide }));
      floorMesh.position.z = bt + 0.5;
    }
  }

  /**
   * Boîte à encoches assemblée à partir des six panneaux réels (mêmes contours à créneaux
   * que le G-code). Chaque panneau a les dimensions extérieures de sa face ; ses créneaux
   * (profondeur = épaisseur) s'imbriquent aux arêtes. Panneau extrudé de t puis placé :
   *   fond / couvercle : plan XY (z 0 → t / H−t → H)
   *   avant / arrière  : plan XZ (y 0 → t / D−t → D), bord y=0 du panneau en haut
   *   gauche / droit   : plan YZ (x 0 → t / W−t → W), bord y=0 du panneau en haut
   */
  _buildFingerBox(pts, H, boxParams = {}) {
    const t       = boxParams.thickness   ?? 6;
    const fw      = boxParams.fingerWidth ?? 10;
    const bl      = boxParams.clearance   ?? 0.1;
    const withLid = boxParams.withLid     ?? true;
    const xs = pts.map(p => p.x), ys = pts.map(p => p.y);
    const W = Math.max(...xs) - Math.min(...xs), D = Math.max(...ys) - Math.min(...ys);

    const fj = new FingerJointBox();
    // Une teinte par panneau (tons bois contrastés) pour bien distinguer les encoches
    const mat = (key, extra = {}) => this._mat(FINGER_COLORS[key], { roughness: 0.7, ...extra });
    const M = (...e) => new THREE.Matrix4().set(...e, 0, 0, 0, 1);
    // m : matrice local (x, y, z extrudé) → monde ; rotations pures (déterminant +1)
    const place = (pts2, m, material) => {
      const geo = new THREE.ExtrudeGeometry(this._shape(pts2), { depth: t, bevelEnabled: false });
      geo.applyMatrix4(m);
      this._mesh(geo, material);
    };

    // ── À plat : panneaux disposés comme dans le G-code (brut = plaque d'épaisseur t) ──
    if (this.lidLayout !== 'assembled') {
      const fakeShape = { getBoundingBox: () => ({ width: W, height: D }) };
      const prm  = { ...boxParams, height: H };
      const keys = { 'Fond': 'bottom', 'Couvercle': 'lid', 'Paroi avant': 'front',
                     'Paroi arrière': 'back', 'Côté gauche': 'left', 'Côté droit': 'right' };
      for (const p of fj._buildGCodeLayout(fakeShape, prm)) {
        place(fj._toPoints(p.rel, p.ox, p.oy), new THREE.Matrix4(), mat(keys[p.label] ?? 'bottom'));
      }
      const bbG = fj.getGCodeBoundingBox(fakeShape, prm);
      return { W: bbG.maxX, D: bbG.maxY, assembled: false, height: t };
    }

    // ── Assemblée ───────────────────────────────────────────────────────────
    const front = fj._toPoints(withLid ? fj._frontWithTop(W, H, fw, t, bl) : fj._frontWithoutTop(W, H, fw, t, bl));
    const side  = fj._toPoints(withLid ? fj._sideWithTop(D, H, fw, t, bl)  : fj._sideWithoutTop(D, H, fw, t, bl));
    const floor = fj._toPoints(fj._bottom(W, D, fw, t, bl));

    place(floor, M(1, 0, 0, 0,   0, 1, 0, 0,   0, 0, 1, 0), mat('bottom'));                 // fond
    // avant / arrière : (x, y, z) → (x, z [+ D−t], H − y)
    place(front, M(1, 0, 0, 0,   0, 0, 1, 0,       0, -1, 0, H), mat('front'));
    place(front, M(1, 0, 0, 0,   0, 0, 1, D - t,   0, -1, 0, H), mat('back'));
    // gauche / droit : (x, y, z) → (t − z | W − z, x, H − y)
    place(side,  M(0, 0, -1, t,  1, 0, 0, 0,   0, -1, 0, H), mat('left'));
    place(side,  M(0, 0, -1, W,  1, 0, 0, 0,   0, -1, 0, H), mat('right'));
    // couvercle opaque (le bouton X-Ray permet de voir l'intérieur)
    if (withLid) {
      place(floor, M(1, 0, 0, 0,  0, 1, 0, 0,  0, 0, 1, H - t), mat('lid'));
    }
    return { W, D, assembled: true, height: H };
  }

  _buildLidBox(pts, H, lidH, wt, r, rD, rs, jeu = 0, bFl = 6, bFll = 6, cells = null) {
    // Emprise de la forme (même boîte englobante que le G-code pour la disposition du couvercle)
    const xs = pts.map(p => p.x), ys = pts.map(p => p.y);
    const W = Math.max(...xs) - Math.min(...xs), D = Math.max(...ys) - Math.min(...ys);
    const firstBodyMesh = this.meshes.length;   // les meshes du corps sont ajoutés jusqu'au couvercle

    // ── CORPS (z : 0 → H) ──────────────────────────────────────────────────
    const innerPts = this._offsetPts(pts, -wt);
    const holes    = cells ?? [innerPts];   // cavité, ou compartiments s'il y a des cloisons

    // Fond (pleine forme, épaisseur bFl)
    this._mesh(
      new THREE.ExtrudeGeometry(this._shape(pts), { depth: bFl, bevelEnabled: false }),
      this._mat(BOX_COLOR, { roughness: 0.85 })
    );

    // Parois (et cloisons) : de bFl à H-rD (s'arrête avant la rainure pour éviter le Z-fighting).
    // Feuillure intérieure (rs=0) : le G-code abaisse aussi les cloisons de rD ; feuillure
    // extérieure (rs=1) : les cloisons montent jusqu'en haut (bloc ajouté plus bas).
    const wallShape = this._shape(pts);
    wallShape.holes = holes.map(h => this._path(h));
    const wallMesh = this._mesh(
      new THREE.ExtrudeGeometry(wallShape, { depth: Math.max(0.1, H - rD - bFl), bevelEnabled: false }),
      this._mat(BOX_COLOR, { roughness: 0.7 })
    );
    wallMesh.position.z = bFl;
    if (cells && rs === 1) {
      const partShape = this._shape(innerPts);
      partShape.holes = cells.map(h => this._path(h));
      const partTop = this._mesh(
        new THREE.ExtrudeGeometry(partShape, { depth: rD, bevelEnabled: false }),
        this._mat(BOX_COLOR, { roughness: 0.7 })
      );
      partTop.position.z = H - rD;
    }

    // Face intérieure du fond (visuel cavité), par compartiment
    for (const h of holes) {
      const floorMesh = this._mesh(
        new THREE.ShapeGeometry(this._shape(h)),
        this._mat(BOX_COLOR, { roughness: 0.95, side: THREE.FrontSide })
      );
      floorMesh.position.z = bFl + 0.5;
    }

    // Feuillure corps — élargie par le jeu mécanique
    // Cas 0 : rainure intérieure — anneau entre (wt-r-jeu) et wt, largeur r+jeu, profondeur rD
    // Cas 1 : rainure extérieure — anneau entre 0 et r+jeu (bord ext), largeur r+jeu, profondeur rD
    const grooveOuter = rs === 0 ? this._offsetPts(pts, -(wt - r - jeu)) : pts;
    const grooveInner = rs === 0 ? innerPts                               : this._offsetPts(pts, -(r + jeu));

    // Partie solide du mur au niveau de la feuillure (pas creusée par la rainure)
    // rs=0 : anneau extérieur (pts → grooveOuter) ; rs=1 : anneau intérieur (grooveInner → innerPts)
    const topWallOuter = rs === 0 ? pts        : grooveInner;
    const topWallInner = rs === 0 ? grooveOuter : innerPts;
    const topWallShape = this._shape(topWallOuter);
    const topWallHole  = new THREE.Path();
    topWallInner.forEach((p, i) => i === 0 ? topWallHole.moveTo(p.x, p.y) : topWallHole.lineTo(p.x, p.y));
    topWallHole.closePath();
    topWallShape.holes = [topWallHole];
    const topWallMesh = this._mesh(
      new THREE.ExtrudeGeometry(topWallShape, { depth: rD, bevelEnabled: false }),
      this._mat(BOX_COLOR, { roughness: 0.7 })
    );
    topWallMesh.position.z = H - rD;
    // La rainure de feuillure (grooveOuter → grooveInner) reste vide : vraie marche, comme usinée

    // ── COUVERCLE — disposé comme à l'usinage (G-code, simulation) ──────────
    // À côté du corps (même règle que LidBox : à droite, ou au-dessus si la forme est
    // allongée), en miroir (x → W − x), posé à plat, ouverture vers le haut.
    // Cas 0 : couvercle réduit (inset wt−r) : la lèvre (largeur r) est la paroi du bac.
    // Cas 1 : couvercle plein (taille corps) : feuillure intérieure (inset r, profondeur rD)
    //         au-dessus de la cavité.
    const lidGap = 20;
    const useVertical = Math.max(W, 2 * D + lidGap) < Math.max(2 * W + lidGap, D);
    const dx = useVertical ? 0 : W + lidGap, dy = useVertical ? D + lidGap : 0;
    const assembled = this.lidLayout === 'assembled';

    // Couvercle tel qu'usiné (miroir x → W − x, posé à plat, ouverture vers le haut, z 0 → lidH),
    // construit dans un groupe qu'on place ensuite à plat ou assemblé.
    const mirror   = p2 => p2.map(p => ({ x: W - p.x, y: p.y }));
    const lidOuter = mirror(rs === 0 ? this._offsetPts(pts, -(wt - r)) : pts);
    const lidCav   = mirror(innerPts);
    const bodyMeshes = this.meshes.slice(firstBodyMesh);
    const lid = new THREE.Group();
    const wood = this._mat(BOX_COLOR, { roughness: 0.7 });   // opaque : X-Ray pour voir l'intérieur
    const add  = (geo, mat, z0 = 0) => { const m = this._mesh(geo, mat); m.position.z = z0; lid.add(m); };
    const ring = (outer, inner, z0, depth) => {
      if (depth <= 0.05) return;
      const s = this._shape(outer);
      s.holes = [this._path(inner)];
      add(new THREE.ExtrudeGeometry(s, { depth, bevelEnabled: false }), wood, z0);
    };

    add(new THREE.ExtrudeGeometry(this._shape(lidOuter), { depth: bFll, bevelEnabled: false }),
      this._mat(BOX_COLOR, { roughness: 0.85 }));                               // fond du couvercle
    if (rs === 0) {
      ring(lidOuter, lidCav, bFll, lidH - bFll);
    } else {
      const lidRab = mirror(this._offsetPts(pts, -r));
      ring(lidOuter, lidRab, bFll, lidH - bFll);       // bord extérieur, pleine hauteur
      ring(lidRab, lidCav, bFll, lidH - rD - bFll);    // sous la feuillure
    }
    add(new THREE.ShapeGeometry(this._shape(lidCav)),
      this._mat(BOX_COLOR, { roughness: 0.95, side: THREE.FrontSide }), bFll + 0.5);   // fond de cavité

    this.scene.add(lid);
    this.meshes.push(lid);
    if (assembled) {
      // Retourné gauche ↔ droite (annule le miroir de l'usinage : x → W − x) et posé sur le
      // corps, lèvre engagée de rD dans la feuillure : z → (H − rD + lidH) − z
      lid.rotation.y = Math.PI;
      lid.position.set(W, 0, H - rD + lidH);
      return { W, D, assembled: true, height: H - rD + lidH };
    }
    lid.position.set(dx, dy, 0);
    // Emprise totale corps + couvercle (caméra, grille, brut, repère Z0)
    return {
      W: Math.max(W, W + dx), D: Math.max(D, D + dy), assembled: false, height: Math.max(H, lidH),
      // Pièces séparées (hauteurs différentes → deux bruts) : de quoi placer chacune
      pieces: { W, D, dx, dy, H, lidH, bodyMeshes, lid },
    };
  }

  _buildStackable(pts, H, wt, bFl, rimH, gap) {
    const tongueInset = wt + gap;
    const innerPts    = this._offsetPts(pts, -wt);
    const plugPts     = this._offsetPts(pts, -tongueInset);

    // Construit une boîte creuse (fond + parois) à la position zBase
    const buildHollow = (zBase, phantom) => {
      // Boîte du dessous (illustration de l'empilement) : grise et translucide
      const mat = (col) => this._mat(phantom ? PHANTOM_COLOR : col, {
        roughness: 0.75,
        transparent: phantom,
        opacity: phantom ? 0.35 : 1.0
      });

      // Fond plein
      const bottomMesh = this._mesh(
        new THREE.ExtrudeGeometry(this._shape(pts), { depth: bFl, bevelEnabled: false }),
        mat(BOX_COLOR)
      );
      bottomMesh.position.z = zBase;

      // Parois creuses (outer minus inner)
      const wallShape = this._shape(pts);
      const wallHole  = new THREE.Path();
      innerPts.forEach((p, i) => i === 0 ? wallHole.moveTo(p.x, p.y) : wallHole.lineTo(p.x, p.y));
      wallHole.closePath();
      wallShape.holes = [wallHole];
      const wallMesh = this._mesh(
        new THREE.ExtrudeGeometry(wallShape, { depth: H - bFl, bevelEnabled: false }),
        mat(BOX_COLOR)
      );
      wallMesh.position.z = zBase + bFl;

      // Plancher intérieur visible de la cavité
      if (!phantom) {
        const floorMesh = this._mesh(
          new THREE.ShapeGeometry(this._shape(innerPts)),
          this._mat(BOX_COLOR, { roughness: 0.95, side: THREE.FrontSide })
        );
        floorMesh.position.z = zBase + bFl + 0.5;
      }
    };

    // 1. Corps principal (Z=0 → H)
    buildHollow(0, false);

    // 2. Plot — protrude vers le bas (Z=-rimH → 0)
    if (plugPts.length >= 3) {
      const plugMesh = this._mesh(
        new THREE.ExtrudeGeometry(this._shape(plugPts), { depth: rimH, bevelEnabled: false }),
        this._mat(BOX_COLOR, { roughness: 0.7 })
      );
      plugMesh.position.z = -rimH;
    }

    // 3. Boîte fantôme en dessous (Z=-(rimH+H) → -rimH), semi-transparente — même pièce,
    //    donc avec son plot (piètement) sous elle (Z=-(2·rimH+H) → -(rimH+H))
    buildHollow(-(rimH + H), true);
    if (plugPts.length >= 3) {
      const ghostPlug = this._mesh(
        new THREE.ExtrudeGeometry(this._shape(plugPts), { depth: rimH, bevelEnabled: false }),
        this._mat(PHANTOM_COLOR, { roughness: 0.75, transparent: true, opacity: 0.35 })
      );
      ghostPlug.position.z = -(2 * rimH + H);
    }
  }

  // ─── Helpers ──────────────────────────────────────────────────────────────

  /** Crée un THREE.Path (trou) depuis un tableau de {x, y}. */
  _path(pts) {
    const p = new THREE.Path();
    pts.forEach((q, i) => i === 0 ? p.moveTo(q.x, q.y) : p.lineTo(q.x, q.y));
    p.closePath();
    return p;
  }

  /** Compartiments des cloisons (plateau, corps de la boîte à couvercle), ou null. */
  _compartments(pts, bb, boxTypeKey, boxParams, machineParams) {
    const n = boxParams.partitions ?? 0;
    if (n <= 0 || (boxTypeKey !== 'open-tray' && boxTypeKey !== 'lid-box')) return null;
    const wt = boxParams.wallThickness ?? 6;
    return buildPartitionContours(bb.width, bb.height, wt, n,
      boxParams.partitionDir === 'horizontal' ? 'horizontal' : 'vertical', machineParams.toolDiameter ?? 3.175,
      { minX: bb.minX, minY: bb.minY, cavity: insetPolygon(pts, wt) });
  }

  /** Crée un THREE.Shape depuis un tableau de {x, y}. */
  _shape(pts) {
    const s = new THREE.Shape();
    pts.forEach((p, i) => i === 0 ? s.moveTo(p.x, p.y) : s.lineTo(p.x, p.y));
    s.closePath();
    return s;
  }

  /** Active/désactive le mode X-Ray (transparence) sur tous les meshes de boîte. */
  setXRay(enabled) {
    this._xray = enabled;
    this.meshes.forEach(m => {
      const mat = m.material;
      if (!mat) return;   // groupe (ex. couvercle) : ses maillages sont traités individuellement
      if (enabled) {
        mat.transparent = true;
        mat.opacity     = 0.22;
      } else {
        mat.transparent = mat._origTransparent;
        mat.opacity     = mat._origOpacity;
      }
      mat.needsUpdate = true;
    });
  }

  /** Crée et ajoute un Mesh à la scène. */
  _mesh(geo, mat) {
    // Sauvegarder les valeurs originales pour le mode X-Ray
    mat._origOpacity     = mat.opacity;
    mat._origTransparent = mat.transparent;
    if (this._xray) {
      mat.transparent = true;
      mat.opacity     = 0.22;
    }
    const m = new THREE.Mesh(geo, mat);
    m.castShadow    = true;
    m.receiveShadow = true;
    this.scene.add(m);
    this.meshes.push(m);
    return m;
  }

  /** MeshStandardMaterial avec defaults sombres/métalliques. */
  _mat(color, opts = {}) {
    return new THREE.MeshStandardMaterial({
      color,
      // Aspect mat (bois brut) : ni reflet métallique, ni lueur propre, rugosité maximale
      metalness:   opts.metalness   ?? 0,
      roughness:   1,
      side:        opts.side        ?? THREE.DoubleSide,
      transparent: opts.transparent ?? false,
      opacity:     opts.opacity     ?? 1.0
    });
  }

  /**
   * Décale un contour de `offset` mm (offset < 0 : vers l'intérieur).
   * Décalage Clipper, comme le G-code : quand le décalage dépasse un rayon de coin, le coin
   * devient vif au lieu de se retourner (l'ancien décalage sommet par sommet produisait
   * alors un contour qui se croise, et des triangles aberrants à l'extrusion).
   * Renvoie le plus grand morceau, ou [] si la forme disparaît.
   */
  _offsetPts(pts, offset) {
    if (Math.abs(offset) < 1e-9) return pts;
    return offsetPolygons(pts, offset)[0] ?? [];
  }

  // ─── Gizmo Z0 ─────────────────────────────────────────────────────────────

  /** Construit les axes XYZ et le plan Z0 à la position (XY + niveau Z) sélectionnée. */
  _buildZ0Gizmo(W, D, H, pos, level, zOffset = 0) {
    let ox, oy;
    switch (pos) {
      case 'front-left':  ox = 0; oy = 0; break;
      case 'front-right': ox = W; oy = 0; break;
      case 'back-left':   ox = 0; oy = D; break;
      case 'back-right':  ox = W; oy = D; break;
      default:            ox = W / 2; oy = D / 2; break; // 'center'
    }
    const oz = (level === 'top' ? H : 0) + zOffset;

    const origin = new THREE.Vector3(ox, oy, oz);
    const axLen  = Math.max(W, D) * 0.25;   // flèches, pointes et sphère suivent cette longueur
    const hLen   = axLen * 0.22;
    const hRad   = axLen * 0.08;

    // Axes : X rouge, Y vert, Z bleu (pointe toujours vers le +Z pour les deux niveaux)
    this._gizmo(new THREE.ArrowHelper(new THREE.Vector3(1, 0, 0), origin, axLen, 0xff3333, hLen, hRad));
    this._gizmo(new THREE.ArrowHelper(new THREE.Vector3(0, 1, 0), origin, axLen, 0x33cc44, hLen, hRad));
    this._gizmo(new THREE.ArrowHelper(new THREE.Vector3(0, 0, 1), origin, axLen, 0x3399ff, hLen, hRad));

    // Sphère à l'origine
    const sph = new THREE.Mesh(
      new THREE.SphereGeometry(axLen * 0.055, 12, 8),
      new THREE.MeshBasicMaterial({ color: 0xffffff })
    );
    sph.position.copy(origin);
    this._gizmo(sph);

  }

  // ─── Stock / brut ──────────────────────────────────────────────────────────

  /** Construit le volume brut (wireframe + solide transparent) autour de la boîte. */
  _buildStock(W, D, H, offset, side = 'top', zOffset = 0, ox = 0, oy = 0) {
    const off = Math.max(0, offset);
    const sw  = W + 2 * off;
    const sd  = D + 2 * off;
    const sh  = H + off;

    const cx = ox + W / 2, cy = oy + D / 2;
    // 'top'    : brut de Z=zOffset à Z=zOffset+H+off
    // 'bottom' : brut de Z=zOffset-off à Z=zOffset+H
    const cz = (side === 'bottom' ? (H - off) / 2 : sh / 2) + zOffset;

    // Wireframe des arêtes
    const bGeo  = new THREE.BoxGeometry(sw, sd, sh);
    const edges = new THREE.EdgesGeometry(bGeo);
    bGeo.dispose();
    const wire = new THREE.LineSegments(
      edges,
      new THREE.LineBasicMaterial({ color: 0xbbbb55 })
    );
    wire.position.set(cx, cy, cz);
    this._gizmo(wire);

    // Volume semi-transparent (face arrière pour ne pas masquer la boîte)
    const solid = new THREE.Mesh(
      new THREE.BoxGeometry(sw, sd, sh),
      new THREE.MeshBasicMaterial({
        color: 0x665533, transparent: true, opacity: 0.06,
        side: THREE.BackSide, depthWrite: false
      })
    );
    solid.position.set(cx, cy, cz);
    this._gizmo(solid);
  }

  // ─── Helpers gizmo ────────────────────────────────────────────────────────

  /** Ajoute un objet Three.js à la scène et le trace dans _gizmos. */
  _gizmo(obj) {
    this.scene.add(obj);
    this._gizmos.push(obj);
    return obj;
  }

  /** Supprime et libère tous les objets gizmo de la scène. */
  _clearGizmos() {
    for (const obj of this._gizmos) {
      this.scene.remove(obj);
      obj.traverse?.(child => {
        child.geometry?.dispose();
        child.material?.dispose();
      });
      obj.geometry?.dispose();
      obj.material?.dispose();
    }
    this._gizmos = [];
  }

  /** Supprime toutes les géométries/matériaux de la scène. */
  _clear() {
    for (const m of this.meshes) {
      this.scene.remove(m);
      m.geometry?.dispose();
      if (Array.isArray(m.material)) m.material.forEach(x => x.dispose());
      else m.material?.dispose();
    }
    this.meshes = [];
  }
}