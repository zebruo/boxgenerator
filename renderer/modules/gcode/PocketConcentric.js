/**
 * PocketConcentric.js — Poche en anneaux à pas constant, du centre vers le bord.
 *
 * Chaque anneau est un vrai décalage (Clipper) du contour de la poche : l'écart entre deux
 * anneaux voisins est constant (60 % du diamètre), quelle que soit la forme. Si la forme se
 * scinde en îlots en rétrécissant, chaque îlot est usiné du centre vers son bord, avant
 * l'anneau qui l'englobe. Des boucles de reprise usinent les bandes fines que les anneaux
 * n'atteignent pas (crête centrale des formes allongées) : aucune matière n'est oubliée.
 */

import { offsetPolygons, differencePolygons } from './Offset.js';

const OVERLAP   = 0.4;    // recouvrement entre anneaux (pas = 60 % de Ø)
const ROUND     = { join: 'round', arcTol: 0.005 };

function _emitOvercut(gen, pts, td) {
  if (pts.length < 2) return;
  const dx = pts[1].x - pts[0].x, dy = pts[1].y - pts[0].y;
  const segLen = Math.hypot(dx, dy) || 1;
  const oc = Math.min(td * 0.5, segLen * 0.4);
  gen.lineTo(pts[0].x + (dx / segLen) * oc, pts[0].y + (dy / segLen) * oc);
}

function _pointInPolygon(p, poly) {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[i], b = poly[j];
    if ((a.y > p.y) !== (b.y > p.y) && p.x < (b.x - a.x) * (p.y - a.y) / (b.y - a.y) + a.x) inside = !inside;
  }
  return inside;
}

/**
 * Zones que ni l'anneau `ring` ni ses enfants n'atteignent. L'anneau couvre la matière
 * jusqu'à r vers l'intérieur ; chaque enfant couvre son intérieur (récursivement) plus
 * une bande r autour de lui. Le reste — là où la crête de la forme tombe entre deux
 * anneaux — est toujours une bande fine : suivre son contour suffit à l'usiner.
 * Les morceaux plus fins que 0,1 mm sont ignorés.
 */
function _residual(ring, children, r) {
  const need = offsetPolygons(ring, -r * 0.97, ROUND);
  if (!need.length) return [];
  const covered = children.flatMap(ch => offsetPolygons(ch.ring, r, ROUND));
  return differencePolygons(need, covered)
    .filter(piece => offsetPolygons(piece, -0.05, ROUND).length > 0);
}

/**
 * Construit l'arbre des anneaux : chaque nœud {ring, children, residual}, enfants = anneaux
 * du niveau suivant contenus dans le nœud, residual = boucles de reprise (voir _residual).
 */
function _buildRingTree(points, d0, step, r) {
  const build = (ring, level) => {
    const next = offsetPolygons(points, -(d0 + (level + 1) * step), ROUND)
      .filter(c => _pointInPolygon(c[0], ring));
    const children = next.map(c => build(c, level + 1));
    return { ring, children, residual: _residual(ring, children, r) };
  };
  return offsetPolygons(points, -d0, ROUND).map(c => build(c, 0));
}

/** Ordre d'usinage : îlots intérieurs d'abord (post-ordre), reprises, puis anneau englobant. */
function _flatten(node, out = []) {
  for (const ch of node.children) _flatten(ch, out);
  out.push(...node.residual, node.ring);
  return out;
}

/** Réordonne un anneau fermé pour qu'il commence au sommet le plus proche de p. */
function _startNear(ring, p) {
  if (!p) return ring;
  let best = 0, bd = Infinity;
  ring.forEach((q, i) => { const d = Math.hypot(q.x - p.x, q.y - p.y); if (d < bd) { bd = d; best = i; } });
  return [...ring.slice(best), ...ring.slice(0, best)];
}

/**
 * Usine tous les anneaux à la profondeur z. Liaison en G1 vers l'anneau suivant si elle
 * est courte (≤ maxLink), sinon remontée, déplacement rapide et nouvelle plongée.
 */
function _cutRings(gen, rings, z, depthStart, maxLink) {
  const m = gen.machine;
  let pos = null;
  rings.forEach((ring, ri) => {
    const start = ring[0];
    if (!pos || Math.hypot(start.x - pos.x, start.y - pos.y) > maxLink) {
      gen.rapidZ(m.safeZ);
      gen.rapidTo(start.x, start.y);
      if (depthStart > 0) gen.emit(`G0 Z${(-depthStart + m.zOffset).toFixed(3)}`);
      gen.plungeTo(z);
    } else {
      gen.lineTo(start.x, start.y);
    }
    for (let i = 1; i < ring.length; i++) gen.lineTo(ring[i].x, ring[i].y);
    gen.lineTo(start.x, start.y); // fermeture
    pos = start;
    if (ri === rings.length - 1) _emitOvercut(gen, ring, m.toolDiameter);
  });
}

export function pocketConcentric(gen, points, label = 'Pocket concentrique', depthStart = 0, finishAllowance = 0) {
  if (points.length < 3) return;

  const m        = gen.machine;
  const td       = m.toolDiameter;
  const r        = td / 2;
  const stepOver = td * (1 - OVERLAP);
  const remainDepth = m.materialThickness - depthStart;
  if (remainDepth <= 0) return;
  const passes      = Math.max(1, Math.ceil(remainDepth / m.depthPerPass));
  const stepZ       = remainDepth / passes;

  const trees = _buildRingTree(points, r + finishAllowance, stepOver, r);
  if (!trees.length) {
    gen.pocketShape(points, label, depthStart);
    return;
  }

  // Séquence d'anneaux (tous îlots), chacun démarrant près de la fin du précédent
  const rings = [];
  let last = null;
  for (const tree of trees) {
    for (const ring of _flatten(tree)) {
      const rr = _startNear(ring, last);
      rings.push(rr);
      last = rr[0];
    }
  }
  // Saut entre anneaux au-delà duquel on remonte plutôt que de couper en ligne droite
  const maxLink = stepOver * 1.5;

  const faLabel = finishAllowance > 0 ? `, finition +${finishAllowance}mm` : '';
  gen.comment(`─── ${label} — Pocket concentrique (${rings.length} anneaux centre→bord, pas ${stepOver.toFixed(2)}mm, ⌀${td}mm${faLabel}) ───`);

  // ── Passes en Z ──────────────────────────────────────────────────────────
  for (let pass = 1; pass <= passes; pass++) {
    const z = -(depthStart + stepZ * pass);
    gen.comment(`Passe ${pass}/${passes} — Z=${z.toFixed(3)}`);
    _cutRings(gen, rings, z, depthStart, maxLink);
    gen.rapidZ(m.safeZ);
  }

  // ── Passe de finition paroi ───────────────────────────────────────────────
  // Trace le contour exact (décalé de r) à la profondeur finale.
  if (finishAllowance > 0) {
    const fullZ = -(depthStart + remainDepth);
    gen.comment(`Passe finition paroi — Z=${fullZ.toFixed(3)}`);
    for (const fin of offsetPolygons(points, -r, ROUND)) {
      const toolPts = _startNear(fin, last);
      gen.rapidZ(m.safeZ);
      gen.rapidTo(toolPts[0].x, toolPts[0].y);
      gen.plungeTo(fullZ);
      for (let i = 1; i < toolPts.length; i++) gen.lineTo(toolPts[i].x, toolPts[i].y);
      gen.lineTo(toolPts[0].x, toolPts[0].y);
      _emitOvercut(gen, toolPts, td);
    }
    gen.rapidZ(m.safeZ);
  }

  gen.comment('');
}
