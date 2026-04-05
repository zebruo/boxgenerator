/**
 * PocketConcentric.js — Spirale centre → bord par interpolation.
 *
 * Approche : au lieu d'insetter depuis le bord (qui s'arrête vite à cause
 * des coins), on génère les anneaux par interpolation entre le centroïde
 * et le contour extérieur. Chaque anneau est le contour original mis à
 * l'échelle (scale) autour du centroïde, de scale≈0 à scale=1.
 * Le dernier anneau est offset de -r vers l'intérieur (compensation outil).
 */

export function pocketConcentric(gen, points, label = 'Pocket concentrique', depthStart = 0) {
  if (points.length < 3) return;

  const m        = gen.machine;
  const td       = m.toolDiameter;
  const r        = td / 2;
  const overlap  = 0.4;
  const stepOver = td * (1 - overlap);
  const remainDepth = m.materialThickness - depthStart;
  const passes      = Math.max(1, Math.ceil(remainDepth / m.depthPerPass));
  const stepZ       = remainDepth / passes;

  // Contour outil = contour original insetté de r (compensation outil)
  const toolPts = gen._offsetContourDist(points, r);
  if (!toolPts || toolPts.length < 3) {
    gen.pocketShape(points, label);
    return;
  }

  // Centroïde du contour outil
  const cx = toolPts.reduce((s, p) => s + p.x, 0) / toolPts.length;
  const cy = toolPts.reduce((s, p) => s + p.y, 0) / toolPts.length;

  // Rayon moyen du contour outil (distance max centroïde → points)
  const rMax = Math.max(...toolPts.map(p => Math.hypot(p.x - cx, p.y - cy)));

  // Nombre d'anneaux nécessaires pour couvrir du centre au bord
  const nRings = Math.max(1, Math.ceil(rMax / stepOver));

  gen.comment(`─── ${label} — Pocket spirale (${nRings} anneaux centre→bord, ⌀${td}mm) ───`);

  // ── Passes en Z ──────────────────────────────────────────────────────────
  for (let pass = 1; pass <= passes; pass++) {
    const z = -(depthStart + stepZ * pass);

    gen.comment(`Passe ${pass}/${passes} — Z=${z.toFixed(3)}`);
    gen.rapidZ(m.safeZ);

    // Plongée au centroïde (rapide jusqu'au fond déjà usiné, puis coupe)
    gen.rapidTo(cx, cy);
    if (depthStart > 0) gen.emit(`G0 Z${(-depthStart + gen.machine.zOffset).toFixed(3)}`);
    gen.plungeTo(z);

    // Anneaux par interpolation scale 0→1 autour du centroïde
    for (let ri = 1; ri <= nRings; ri++) {
      const scale = ri / nRings;
      const ring  = toolPts.map(p => ({
        x: cx + (p.x - cx) * scale,
        y: cy + (p.y - cy) * scale,
      }));

      // Transition G1 directe (spirale continue, pas de relevé)
      gen.lineTo(ring[0].x, ring[0].y);
      for (let i = 1; i < ring.length; i++) gen.lineTo(ring[i].x, ring[i].y);
      gen.lineTo(ring[0].x, ring[0].y); // fermeture
    }

    gen.rapidZ(m.safeZ);
  }

  gen.comment('');
}
