/**
 * Offset.js — Décalage robuste de polygones fermés (Clipper 6.4.2, renderer/lib/clipper.js).
 *
 * Contrairement au décalage sommet par sommet (GCodeGenerator._offsetContourDist), Clipper
 * gère correctement les cas où le décalage dépasse un rayon de coin (le coin devient vif
 * au lieu de se retourner), les boucles, et les formes qui se scindent en plusieurs îlots.
 *
 * Convention : delta > 0 agrandit, delta < 0 rétrécit. Les contours renvoyés gardent
 * le sens de parcours du contour d'origine.
 */

const SCALE = 10000;   // Clipper travaille en entiers : 0,1 µm

function clipper() {
  const C = globalThis.ClipperLib;
  if (!C) throw new Error('ClipperLib non chargé (renderer/lib/clipper.js)');
  return C;
}

export function signedArea(pts) {
  let a = 0;
  for (let i = 0, n = pts.length; i < n; i++) {
    const p = pts[i], q = pts[(i + 1) % n];
    a += p.x * q.y - q.x * p.y;
  }
  return a / 2;
}

/**
 * Décale un contour fermé. Renvoie tous les contours extérieurs obtenus,
 * du plus grand au plus petit (tableau vide si la forme disparaît).
 *
 * @param {{x,y}[]} points
 * @param {number}  delta               mm (> 0 agrandit, < 0 rétrécit)
 * @param {object}  [opts]
 * @param {'miter'|'round'} [opts.join] jonction des coins saillants du décalage (défaut miter)
 * @param {number}  [opts.miterLimit]   distance maxi d'un coin en multiples de |delta| (défaut 2)
 * @param {number}  [opts.arcTol]       tolérance des jonctions arrondies, mm (défaut 0,005)
 * @returns {{x,y}[][]}
 */
export function offsetPolygons(points, delta, { join = 'miter', miterLimit = 2, arcTol = 0.005 } = {}) {
  if (!points || points.length < 3) return [];
  const C = clipper();
  const sign = Math.sign(signedArea(points));
  if (!sign) return [];

  const co = new C.ClipperOffset(miterLimit, arcTol * SCALE);
  co.AddPath(toPath(points), join === 'round' ? C.JoinType.jtRound : C.JoinType.jtMiter, C.EndType.etClosedPolygon);
  const solution = new C.Paths();
  co.Execute(solution, delta * SCALE);

  return solution
    .filter(p => p.length >= 3 && C.Clipper.Orientation(p))   // contours extérieurs seulement
    .map(p => {
      const q = fromPath(p);
      if (Math.sign(signedArea(q)) !== sign) q.reverse();
      return q;
    })
    .sort((a, b) => Math.abs(signedArea(b)) - Math.abs(signedArea(a)));
}

const toPath   = pts => pts.map(p => ({ X: Math.round(p.x * SCALE), Y: Math.round(p.y * SCALE) }));
const fromPath = p => p.map(v => ({ x: v.X / SCALE, y: v.Y / SCALE }));

/**
 * Différence booléenne : zones couvertes par `subject` et non par `clip`.
 * Renvoie tous les contours du résultat (extérieurs et trous), chacun fermé.
 */
export function differencePolygons(subject, clip) {
  const subj = subject.filter(p => p.length >= 3);
  if (!subj.length) return [];
  const C = clipper();
  const c = new C.Clipper();
  c.AddPaths(subj.map(toPath), C.PolyType.ptSubject, true);
  const cl = clip.filter(p => p.length >= 3);
  if (cl.length) c.AddPaths(cl.map(toPath), C.PolyType.ptClip, true);
  const solution = new C.Paths();
  c.Execute(C.ClipType.ctDifference, solution, C.PolyFillType.pftNonZero, C.PolyFillType.pftNonZero);
  return solution.filter(p => p.length >= 3).map(fromPath);
}

/**
 * Partie de `poly` située dans `region` (intersection). Renvoie les contours extérieurs
 * obtenus (plusieurs si `region` est concave), dans le sens de parcours de `region`.
 */
export function clipToRegion(poly, region) {
  if (poly.length < 3 || region.length < 3) return [];
  const C = clipper();
  const c = new C.Clipper();
  c.AddPath(toPath(poly), C.PolyType.ptSubject, true);
  c.AddPath(toPath(region), C.PolyType.ptClip, true);
  const solution = new C.Paths();
  c.Execute(C.ClipType.ctIntersection, solution, C.PolyFillType.pftNonZero, C.PolyFillType.pftNonZero);
  const sign = Math.sign(signedArea(region));
  return solution
    .filter(p => p.length >= 3 && C.Clipper.Orientation(p))
    .map(p => {
      const q = fromPath(p);
      if (Math.sign(signedArea(q)) !== sign) q.reverse();
      return q;
    });
}

/** Rétrécit un contour de d mm ; renvoie le plus grand contour obtenu, ou [] s'il disparaît. */
export function insetPolygon(points, d, opts) {
  return offsetPolygons(points, -d, opts)[0] ?? [];
}

/** Réunion de deux contours fermés : renvoie le plus grand contour extérieur, dans le sens de `a`. */
export function unionPolygons(a, b) {
  if (a.length < 3) return b;
  if (b.length < 3) return a;
  const C = clipper();
  const c = new C.Clipper();
  c.AddPath(toPath(a), C.PolyType.ptSubject, true);
  c.AddPath(toPath(b), C.PolyType.ptClip, true);
  const solution = new C.Paths();
  c.Execute(C.ClipType.ctUnion, solution, C.PolyFillType.pftNonZero, C.PolyFillType.pftNonZero);
  const sign = Math.sign(signedArea(a));
  return solution
    .filter(p => p.length >= 3 && C.Clipper.Orientation(p))
    .map(p => {
      const q = fromPath(p);
      if (Math.sign(signedArea(q)) !== sign) q.reverse();
      return q;
    })
    .sort((p, q) => Math.abs(signedArea(q)) - Math.abs(signedArea(p)))[0] ?? [];
}

/** Distance d'un point au contour fermé `poly` (segment le plus proche). */
export function distToPolygon(p, poly) {
  let best = Infinity;
  for (let i = 0, n = poly.length; i < n; i++) {
    const a = poly[i], b = poly[(i + 1) % n];
    const dx = b.x - a.x, dy = b.y - a.y, l2 = dx * dx + dy * dy;
    const t = l2 > 0 ? Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / l2)) : 0;
    best = Math.min(best, Math.hypot(p.x - a.x - t * dx, p.y - a.y - t * dy));
  }
  return best;
}

/**
 * Impose un rayon de coin minimum `rho` aux coins saillants d'un contour (ouverture
 * morphologique : rétrécir de rho puis agrandir de rho, jonctions arrondies). Les coins déjà
 * assez ronds, les courbes et les segments ne bougent pas : si aucun sommet du contour n'est
 * déplacé de plus de `tol` mm, le tableau d'origine est renvoyé tel quel (même référence).
 */
export function roundCorners(points, rho, tol = 0.03) {
  if (!points || points.length < 3 || !(rho > 0)) return points;
  const eroded = offsetPolygons(points, -rho, { join: 'round' })[0];
  if (!eroded) return points;
  const opened = offsetPolygons(eroded, rho, { join: 'round' })[0];
  if (!opened) return points;
  return points.some(p => distToPolygon(p, opened) > tol) ? opened : points;
}
