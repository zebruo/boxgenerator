/**
 * PocketConcentric.js — Spirale centre → bord par interpolation.
 *
 * Approche : au lieu d'insetter depuis le bord (qui s'arrête vite à cause
 * des coins), on génère les anneaux par interpolation entre le centroïde
 * et le contour extérieur. Chaque anneau est le contour original mis à
 * l'échelle (scale) autour du centroïde, de scale≈0 à scale=1.
 * Le dernier anneau est offset de -r vers l'intérieur (compensation outil).
 */

function _emitOvercut(gen, pts, td) {
  if (pts.length < 2) return;
  const dx = pts[1].x - pts[0].x, dy = pts[1].y - pts[0].y;
  const segLen = Math.hypot(dx, dy) || 1;
  const oc = Math.min(td * 0.5, segLen * 0.4);
  gen.lineTo(pts[0].x + (dx / segLen) * oc, pts[0].y + (dy / segLen) * oc);
}

export function pocketConcentric(gen, points, label = 'Pocket concentrique', depthStart = 0, finishAllowance = 0) {
  if (points.length < 3) return;

  const m        = gen.machine;
  const td       = m.toolDiameter;
  const r        = td / 2;
  const overlap  = 0.4;
  const stepOver = td * (1 - overlap);
  const remainDepth = m.materialThickness - depthStart;
  if (remainDepth <= 0) return;
  const passes      = Math.max(1, Math.ceil(remainDepth / m.depthPerPass));
  const stepZ       = remainDepth / passes;

  // Contour outil exact (passe de finition paroi)
  const toolPtsRaw      = gen._offsetContourDist(points, r);
  const toolPtsForRings = finishAllowance > 0
    ? gen._offsetContourDist(points, r + finishAllowance)
    : toolPtsRaw;

  if (!toolPtsRaw || toolPtsRaw.length < 3 || !toolPtsForRings || toolPtsForRings.length < 3) {
    gen.pocketShape(points, label);
    return;
  }

  // Centroïde du contour outil
  const cx = toolPtsRaw.reduce((s, p) => s + p.x, 0) / toolPtsRaw.length;
  const cy = toolPtsRaw.reduce((s, p) => s + p.y, 0) / toolPtsRaw.length;

  // Réordonner pour démarrer au milieu du côté le plus long (évite les transitions entre anneaux aux angles)
  const entryIdx  = gen._maxSegIdx(toolPtsForRings);
  const orderedRings = gen._reorderAt(toolPtsForRings, entryIdx);
  const toolPts      = gen._reorderAt(toolPtsRaw, entryIdx);

  // Rayon moyen du contour de travail (anneaux)
  const rMax = Math.max(...toolPtsForRings.map(p => Math.hypot(p.x - cx, p.y - cy)));

  // Nombre d'anneaux nécessaires pour couvrir du centre au bord
  const nRings = Math.max(1, Math.ceil(rMax / stepOver));

  const faLabel = finishAllowance > 0 ? `, finition +${finishAllowance}mm` : '';
  gen.comment(`─── ${label} — Pocket spirale (${nRings} anneaux centre→bord, ⌀${td}mm${faLabel}) ───`);

  // ── Passes en Z ──────────────────────────────────────────────────────────
  for (let pass = 1; pass <= passes; pass++) {
    const z = -(depthStart + stepZ * pass);

    gen.comment(`Passe ${pass}/${passes} — Z=${z.toFixed(3)}`);
    gen.rapidZ(m.safeZ);

    gen.rapidTo(cx, cy);
    if (depthStart > 0) gen.emit(`G0 Z${(-depthStart + gen.machine.zOffset).toFixed(3)}`);
    gen.plungeTo(z);

    // Anneaux par interpolation scale 0→1 autour du centroïde.
    for (let ri = 1; ri <= nRings; ri++) {
      const scale = ri / nRings;
      const ring  = orderedRings.map(p => ({
        x: cx + (p.x - cx) * scale,
        y: cy + (p.y - cy) * scale,
      }));

      gen.lineTo(ring[0].x, ring[0].y);
      for (let i = 1; i < ring.length; i++) gen.lineTo(ring[i].x, ring[i].y);
      gen.lineTo(ring[0].x, ring[0].y); // fermeture

      if (ri === nRings) _emitOvercut(gen, ring, td);
    }

    gen.rapidZ(m.safeZ);
  }

  // ── Passe de finition paroi ───────────────────────────────────────────────
  // Trace le contour exact (inset r) à la profondeur finale pour nettoyer les
  // marques d'angle laissées par les décélérations dans les anneaux.
  if (finishAllowance > 0) {
    const fullZ = -(depthStart + remainDepth);
    gen.comment(`Passe finition paroi — Z=${fullZ.toFixed(3)}`);
    gen.rapidZ(m.safeZ);
    gen.rapidTo(toolPts[0].x, toolPts[0].y);
    gen.plungeTo(fullZ);
    for (let i = 1; i < toolPts.length; i++) gen.lineTo(toolPts[i].x, toolPts[i].y);
    gen.lineTo(toolPts[0].x, toolPts[0].y);
    _emitOvercut(gen, toolPts, td);
    gen.rapidZ(m.safeZ);
  }

  gen.comment('');
}
