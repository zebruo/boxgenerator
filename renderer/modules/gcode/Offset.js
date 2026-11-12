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

  const path = points.map(p => ({ X: Math.round(p.x * SCALE), Y: Math.round(p.y * SCALE) }));
  const co = new C.ClipperOffset(miterLimit, arcTol * SCALE);
  co.AddPath(path, join === 'round' ? C.JoinType.jtRound : C.JoinType.jtMiter, C.EndType.etClosedPolygon);
  const solution = new C.Paths();
  co.Execute(solution, delta * SCALE);

  return solution
    .filter(p => p.length >= 3 && C.Clipper.Orientation(p))   // contours extérieurs seulement
    .map(p => {
      const q = p.map(v => ({ x: v.X / SCALE, y: v.Y / SCALE }));
      if (Math.sign(signedArea(q)) !== sign) q.reverse();
      return q;
    })
    .sort((a, b) => Math.abs(signedArea(b)) - Math.abs(signedArea(a)));
}

/** Rétrécit un contour de d mm ; renvoie le plus grand contour obtenu, ou [] s'il disparaît. */
export function insetPolygon(points, d, opts) {
  return offsetPolygons(points, -d, opts)[0] ?? [];
}
