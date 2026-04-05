import * as THREE from '../../lib/three.module.js';
import { OrbitControls } from '../../lib/jsm/controls/OrbitControls.js';

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
    this.renderer.setClearColor(0x0f0f1a);

    // Scène
    this.scene = new THREE.Scene();

    // Caméra Z-up
    this.camera = new THREE.PerspectiveCamera(50, 1, 0.1, 50000);
    this.camera.up.set(0, 0, 1);
    this.camera.position.set(300, -300, 250);

    // Lumières
    const ambient = new THREE.AmbientLight(0x334466, 3);
    this.scene.add(ambient);

    const sun = new THREE.DirectionalLight(0xffffff, 3);
    sun.position.set(300, -200, 500);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    const sc = sun.shadow.camera;
    sc.near = 1; sc.far = 3000;
    sc.left = -400; sc.right = 400; sc.top = 400; sc.bottom = -400;
    this.scene.add(sun);

    const fill = new THREE.DirectionalLight(0x4466ff, 1.2);
    fill.position.set(-300, 300, 100);
    this.scene.add(fill);

    const rim = new THREE.DirectionalLight(0x00ffaa, 0.5);
    rim.position.set(0, 0, -300);
    this.scene.add(rim);

    // Grille horizontale (plan XY, Z-up)
    this.grid = new THREE.GridHelper(2000, 60, 0x252540, 0x1a1a30);
    this.grid.rotation.x = Math.PI / 2;
    this.scene.add(this.grid);

    // Contrôles orbitaux
    this.controls = new OrbitControls(this.camera, this.canvas);
    this.controls.enableDamping  = true;
    this.controls.dampingFactor  = 0.07;
    this.controls.zoomSpeed      = 1.2;
    this.controls.rotateSpeed    = 0.7;

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
      this.renderer.setClearColor(0xc4c4d4);
      this.scene.remove(this.grid);
      this.grid = new THREE.GridHelper(2000, 60, 0x9898B8, 0xB0B0CC);
      this.grid.rotation.x = Math.PI / 2;
      this.scene.add(this.grid);
    } else {
      this.renderer.setClearColor(0x0f0f1a);
      this.scene.remove(this.grid);
      this.grid = new THREE.GridHelper(2000, 60, 0x252540, 0x1a1a30);
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
    switch (boxTypeKey) {
      case 'open-tray':    this._buildOpenTray(shapePts, W, D, H, wt, bFl);   break;
      case 'finger-joint': this._buildFingerBox(shapePts, H, boxParams);        break;
      case 'lid-box': { const _r = boxParams.rabbet ?? 3; const _bFll = boxParams.lidBottomThickness ?? bFl; this._buildLidBox(shapePts, H, boxParams.lidHeight ?? 15, boxParams.wallThickness ?? 6, _r, boxParams.rabbetDepth ?? 4, boxParams.rabbetSide ?? 0, boxParams.clearance ?? 0, bFl, _bFll); break; }
      case 'stackable': {
        const _gap = boxParams.clearance ?? 0.3;
        this._buildStackable(shapePts, H, wt, bFl, _rimH, _gap);
        break;
      }
    }

    // Positionner la caméra au centre de la géométrie visible
    let visH, visZCenter;
    if (boxTypeKey === 'lid-box') {
      visH = H + (boxParams.lidHeight ?? 15) + 2;
      visZCenter = visH / 2;
    } else if (boxTypeKey === 'stackable') {
      visH = 2 * H + _rimH;
      visZCenter = H / 2 - _rimH;
    } else {
      visH = H;
      visZCenter = H / 2;
    }
    const maxDim = Math.max(W, D, visH);
    const dist   = maxDim * 1.9;
    this.camera.position.set(W / 2 + dist * 0.7, D / 2 - dist * 0.7, visZCenter + dist * 0.55);
    this.controls.target.set(W / 2, D / 2, visZCenter);
    this.controls.update();

    // Grille sous la boîte (Z=0 = sol, grille à Z=-1)
    const gridZ = boxTypeKey === 'stackable' ? -(H + _rimH) - 1 : -1;
    this.grid.position.set(W / 2, D / 2, gridZ);

    // Gizmo Z0 et brut — top par défaut au sommet de la boîte (Z=H)
    const machH = boxTypeKey === 'stackable' ? H + _rimH : H;
    const zOff  = boxTypeKey === 'stackable' ? -_rimH : 0;
    this._buildZ0Gizmo(W, D, machH, this.z0Pos, this.z0Level, zOff);
    this._buildStock(W, D, machH, this.stockOffset, this.stockSide, zOff);
  }

  dispose() {
    cancelAnimationFrame(this.rafId);
    this._clear();
    this._clearGizmos();
    this.controls.dispose();
    this.renderer.dispose();
  }

  // ─── Construction des géométries ──────────────────────────────────────────

  _buildOpenTray(pts, W, D, H, wt, bt) {
    // Fond (forme réelle, épaisseur bt)
    const bottomShape = this._shape(pts);
    const bottomGeo = new THREE.ExtrudeGeometry(bottomShape, { depth: bt, bevelEnabled: false });
    this._mesh(bottomGeo, this._mat(0x7a4a1a, { roughness: 0.85 }));

    // Parois : forme avec trou (outer - inner) extrudée de bt à H
    const wallShape = this._shape(pts);
    const innerPts  = this._offsetPts(pts, -wt);  // offset négatif = vers l'intérieur (CCW)
    const hole = new THREE.Path();
    innerPts.forEach((p, i) => i === 0 ? hole.moveTo(p.x, p.y) : hole.lineTo(p.x, p.y));
    hole.closePath();
    wallShape.holes = [hole];

    const wallGeo = new THREE.ExtrudeGeometry(wallShape, { depth: H - bt, bevelEnabled: false });
    const wallMesh = this._mesh(wallGeo, this._mat(0xb06030, { roughness: 0.75 }));
    wallMesh.position.z = bt;

    // Plancher intérieur (ShapeGeometry, légèrement au-dessus du fond)
    const floorShape = this._shape(innerPts);
    const floorGeo   = new THREE.ShapeGeometry(floorShape);
    const floorMesh  = this._mesh(floorGeo, this._mat(0x1a0f08, { roughness: 0.95, side: THREE.FrontSide }));
    floorMesh.position.z = bt + 0.5;
  }

  _buildFingerBox(pts, H, boxParams = {}) {
    const t       = boxParams.thickness ?? 6;
    const withLid = boxParams.withLid   ?? true;
    const col     = 0xb04a10;

    // Fond
    this._mesh(
      new THREE.ExtrudeGeometry(this._shape(pts), { depth: t, bevelEnabled: false }),
      this._mat(col, { roughness: 0.7 })
    );

    // Parois creuses (outer − inner)
    const innerPts  = this._offsetPts(pts, -t);
    const wallShape = this._shape(pts);
    const hole = new THREE.Path();
    innerPts.forEach((p, i) => i === 0 ? hole.moveTo(p.x, p.y) : hole.lineTo(p.x, p.y));
    hole.closePath();
    wallShape.holes = [hole];
    const wallMesh = this._mesh(
      new THREE.ExtrudeGeometry(wallShape, { depth: H - (withLid ? 2 * t : t), bevelEnabled: false }),
      this._mat(col, { roughness: 0.7 })
    );
    wallMesh.position.z = t;

    // Plancher intérieur visible
    const floorMesh = this._mesh(
      new THREE.ShapeGeometry(this._shape(innerPts)),
      this._mat(0x1a0f08, { roughness: 0.95, side: THREE.FrontSide })
    );
    floorMesh.position.z = t + 0.5;

    // Couvercle (semi-transparent pour voir l'intérieur)
    if (withLid) {
      const lidMesh = this._mesh(
        new THREE.ExtrudeGeometry(this._shape(pts), { depth: t, bevelEnabled: false }),
        this._mat(col, { roughness: 0.7, transparent: true, opacity: 0.55 })
      );
      lidMesh.position.z = H - t;
    }
  }

  _buildLidBox(pts, H, lidH, wt, r, rD, rs, jeu = 0, bFl = 6, bFll = 6) {
    const gap = 2; // espace visuel corps ↔ couvercle

    // ── CORPS (z : 0 → H) ──────────────────────────────────────────────────
    const innerPts = this._offsetPts(pts, -wt);

    // Fond (pleine forme, épaisseur bFl)
    this._mesh(
      new THREE.ExtrudeGeometry(this._shape(pts), { depth: bFl, bevelEnabled: false }),
      this._mat(0x8a3a0a, { roughness: 0.85 })
    );

    // Parois creuses : de bFl à H-rD (s'arrête avant la rainure pour éviter le Z-fighting)
    const wallShape = this._shape(pts);
    const wallHole  = new THREE.Path();
    innerPts.forEach((p, i) => i === 0 ? wallHole.moveTo(p.x, p.y) : wallHole.lineTo(p.x, p.y));
    wallHole.closePath();
    wallShape.holes = [wallHole];
    const wallMesh = this._mesh(
      new THREE.ExtrudeGeometry(wallShape, { depth: Math.max(0.1, H - rD - bFl), bevelEnabled: false }),
      this._mat(0xb04a10, { roughness: 0.7 })
    );
    wallMesh.position.z = bFl;

    // Face intérieure du fond (visuel cavité)
    const floorMesh = this._mesh(
      new THREE.ShapeGeometry(this._shape(innerPts)),
      this._mat(0x080f25, { roughness: 0.95, side: THREE.FrontSide })
    );
    floorMesh.position.z = bFl + 0.5;

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
      this._mat(0xb04a10, { roughness: 0.7 })
    );
    topWallMesh.position.z = H - rD;
    const grooveShape = this._shape(grooveOuter);
    const grooveHole  = new THREE.Path();
    grooveInner.forEach((p, i) => i === 0 ? grooveHole.moveTo(p.x, p.y) : grooveHole.lineTo(p.x, p.y));
    grooveHole.closePath();
    grooveShape.holes = [grooveHole];
    const grooveMesh = this._mesh(
      new THREE.ExtrudeGeometry(grooveShape, { depth: rD, bevelEnabled: false }),
      this._mat(0x1e1e35, { roughness: 0.95 })
    );
    grooveMesh.position.z = H - rD;

    // ── COUVERCLE (z : H+gap → H+gap+lidH) ─────────────────────────────────
    // Taille nominale — la lèvre r s'emboîte dans la rainure r+jeu (jeu = dans la rainure corps)
    // Cas 0 : couvercle réduit (inset wt-r) — lèvre largeur r, profondeur rD
    // Cas 1 : couvercle plein (taille corps) — lèvre largeur r, profondeur rD
    const lidZ      = H + gap;
    const lidOuter  = rs === 0 ? this._offsetPts(pts, -(wt - r)) : pts;
    const lidInner  = rs === 0 ? innerPts                         : this._offsetPts(pts, -r);

    // Cavité intérieure du couvercle = même espace que le corps
    const lidInnerWall = innerPts;

    // Parois creuses couvercle (lidOuter − lidInnerWall) de rD à lidH−bFll
    const wallDepthLid = lidH - rD - bFll;
    if (wallDepthLid > 0.5) {
      const lidWallShape = this._shape(lidOuter);
      const lidWallHole  = new THREE.Path();
      lidInnerWall.forEach((p, i) => i === 0 ? lidWallHole.moveTo(p.x, p.y) : lidWallHole.lineTo(p.x, p.y));
      lidWallHole.closePath();
      lidWallShape.holes = [lidWallHole];
      const lidWallMesh = this._mesh(
        new THREE.ExtrudeGeometry(lidWallShape, { depth: wallDepthLid, bevelEnabled: false }),
        this._mat(0x20c080, { roughness: 0.6, transparent: true, opacity: 0.82 })
      );
      lidWallMesh.position.z = lidZ + rD;

      // Face intérieure du plafond (fond de cavité visible)
      const lidFloorMesh = this._mesh(
        new THREE.ShapeGeometry(this._shape(lidInnerWall)),
        this._mat(0x050e08, { roughness: 0.95, side: THREE.FrontSide })
      );
      lidFloorMesh.position.z = lidZ + rD + wallDepthLid + 0.5;
    }
    // Plafond couvercle (solid, épaisseur bFll)
    const ceilMesh = this._mesh(
      new THREE.ExtrudeGeometry(this._shape(lidOuter), { depth: bFll, bevelEnabled: false }),
      this._mat(0x20c080, { roughness: 0.6, transparent: true, opacity: 0.82 })
    );
    ceilMesh.position.z = lidZ + lidH - bFll;

    // Lèvres (anneau lidOuter − trou lidInner), profondeur rD → s'emboîtent dans les rainures
    const lipShape = this._shape(lidOuter);
    const lipHole  = new THREE.Path();
    lidInner.forEach((p, i) => i === 0 ? lipHole.moveTo(p.x, p.y) : lipHole.lineTo(p.x, p.y));
    lipHole.closePath();
    lipShape.holes = [lipHole];
    const lipMesh = this._mesh(
      new THREE.ExtrudeGeometry(lipShape, { depth: rD, bevelEnabled: false }),
      this._mat(0x18a070, { roughness: 0.6, transparent: true, opacity: 0.9 })
    );
    lipMesh.position.z = lidZ;
  }

  _buildStackable(pts, H, wt, bFl, rimH, gap) {
    const tongueInset = wt + gap;
    const innerPts    = this._offsetPts(pts, -wt);
    const plugPts     = this._offsetPts(pts, -tongueInset);

    // Construit une boîte creuse (fond + parois) à la position zBase
    const buildHollow = (zBase, phantom) => {
      const mat = (col) => this._mat(col, {
        roughness: 0.75,
        transparent: phantom,
        opacity: phantom ? 0.35 : 1.0
      });

      // Fond plein
      const bottomMesh = this._mesh(
        new THREE.ExtrudeGeometry(this._shape(pts), { depth: bFl, bevelEnabled: false }),
        mat(phantom ? 0x1a4060 : 0x18a060)
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
        mat(phantom ? 0x204880 : 0x20c080)
      );
      wallMesh.position.z = zBase + bFl;

      // Plancher intérieur visible de la cavité
      if (!phantom) {
        const floorMesh = this._mesh(
          new THREE.ShapeGeometry(this._shape(innerPts)),
          this._mat(0x080f25, { roughness: 0.95, side: THREE.FrontSide })
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
        this._mat(0x0e7040, { roughness: 0.7 })
      );
      plugMesh.position.z = -rimH;
    }

    // 3. Boîte fantôme en dessous (Z=-(rimH+H) → -rimH), semi-transparente
    buildHollow(-(rimH + H), true);
  }

  // ─── Helpers ──────────────────────────────────────────────────────────────

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
      emissive:    new THREE.Color(color).multiplyScalar(0.08),
      metalness:   opts.metalness   ?? 0.12,
      roughness:   opts.roughness   ?? 0.78,
      side:        opts.side        ?? THREE.DoubleSide,
      transparent: opts.transparent ?? false,
      opacity:     opts.opacity     ?? 1.0
    });
  }

  /**
   * Décale un contour de `offset` mm par bisectrice en chaque sommet.
   * offset < 0 → vers l'intérieur pour formes CCW (coordonnées math Y-up).
   */
  _offsetPts(pts, offset) {
    const n = pts.length;
    return pts.map((curr, i) => {
      const prev = pts[(i - 1 + n) % n];
      const next = pts[(i + 1) % n];

      const t1x = curr.x - prev.x, t1y = curr.y - prev.y;
      const t2x = next.x - curr.x, t2y = next.y - curr.y;
      const l1  = Math.hypot(t1x, t1y) || 1;
      const l2  = Math.hypot(t2x, t2y) || 1;

      // Normale droite (outward pour CCW)
      const n1x =  t1y / l1, n1y = -t1x / l1;
      const n2x =  t2y / l2, n2y = -t2x / l2;

      let bx = n1x + n2x, by = n1y + n2y;
      const bl = Math.hypot(bx, by) || 1;
      bx /= bl; by /= bl;

      const dot   = n1x * bx + n1y * by;
      const miter = Math.min(Math.abs(dot) > 0.01 ? 1 / dot : 1, 3);

      return { x: curr.x + offset * miter * bx, y: curr.y + offset * miter * by };
    });
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
    const axLen  = Math.max(W, D) * 0.35;
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
  _buildStock(W, D, H, offset, side = 'top', zOffset = 0) {
    const off = Math.max(0, offset);
    const sw  = W + 2 * off;
    const sd  = D + 2 * off;
    const sh  = H + off;

    const cx = W / 2, cy = D / 2;
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