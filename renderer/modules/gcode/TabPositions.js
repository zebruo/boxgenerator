/**
 * Positions des tabs placés à la main.
 *
 * Un tab est mémorisé par une fraction du périmètre du contour de la forme (0 = premier point
 * du contour, sens du contour). La fraction suit un changement de dimensions, et chaque pièce la
 * convertit en point dans son propre repère (couvercle et face 2 de l'empilable : en miroir).
 * Le générateur projette ensuite ce point sur le trajet d'outil réel (contour décalé).
 */

/** Longueurs des segments d'un contour fermé et périmètre. */
export function contourLengths(pts) {
  const seg = [];
  let P = 0;
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i], b = pts[(i + 1) % pts.length];
    const l = Math.hypot(b.x - a.x, b.y - a.y);
    seg.push(l);
    P += l;
  }
  return { seg, P };
}

/** Point (et direction du contour en ce point) à la fraction f du périmètre. */
export function pointAtFraction(pts, f) {
  const { seg, P } = contourLengths(pts);
  let d = (((f % 1) + 1) % 1) * P;
  for (let i = 0; i < pts.length; i++) {
    if (d <= seg[i] || i === pts.length - 1) {
      const a = pts[i], b = pts[(i + 1) % pts.length], l = seg[i] || 1;
      const t = Math.min(1, d / l);
      return { x: a.x + t * (b.x - a.x), y: a.y + t * (b.y - a.y), dx: (b.x - a.x) / l, dy: (b.y - a.y) / l };
    }
    d -= seg[i];
  }
  return { ...pts[0], dx: 1, dy: 0 };
}

/** Point du contour le plus proche de p : abscisse curviligne s, distance, point. */
export function nearestOnContour(pts, p) {
  let best = { s: 0, dist: Infinity, x: pts[0].x, y: pts[0].y };
  let cum = 0;
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i], b = pts[(i + 1) % pts.length];
    const vx = b.x - a.x, vy = b.y - a.y, l2 = vx * vx + vy * vy;
    const t = l2 > 0 ? Math.max(0, Math.min(1, ((p.x - a.x) * vx + (p.y - a.y) * vy) / l2)) : 0;
    const x = a.x + t * vx, y = a.y + t * vy, dist = Math.hypot(p.x - x, p.y - y);
    const l = Math.sqrt(l2);
    if (dist < best.dist) best = { s: cum + t * l, dist, x, y };
    cum += l;
  }
  return best;
}

/** Fraction du périmètre du point du contour le plus proche de p. */
export function fractionOfPoint(pts, p) {
  const { P } = contourLengths(pts);
  return P > 0 ? nearestOnContour(pts, p).s / P : 0;
}

/**
 * Options de tabs d'une pièce : avec des tabs placés à la main (`fractions`), ajoute leurs points
 * dans le repère de la pièce. `refPts` = contour de la forme ; `map` = passage au repère de la pièce
 * (miroir du couvercle, face 2 de l'empilable). Sans placement à la main : options inchangées.
 */
export function withManualTabs(tabOpts, refPts, map = p => p) {
  if (!tabOpts?.fractions?.length || !refPts?.length) return tabOpts;
  return { ...tabOpts, points: tabOpts.fractions.map(f => map(pointAtFraction(refPts, f))) };
}
