import { clipToRegion, insetPolygon } from './Offset.js';

/**
 * Calcule les contours des sous-poches séparées par des cloisons.
 * Chaque cloison a la même épaisseur que wallThickness.
 * Les coins intérieurs sont naturellement arrondis au rayon de la fraise.
 *
 * Les compartiments sont d'abord des rectangles répartis sur la boîte englobante, puis
 * découpés par la cavité (`opts.cavity`) : sur une forme ronde, ovale, polygonale ou à
 * coins arrondis, ils suivent ainsi la paroi au lieu de la traverser.
 *
 * @param {number} W             - largeur totale de la boîte (mm)
 * @param {number} D             - profondeur totale de la boîte (mm)
 * @param {number} wallThickness - épaisseur des parois et cloisons (mm)
 * @param {number} partitions    - nombre de cloisons (≥ 1)
 * @param {string} partitionDir  - 'vertical' (divise la largeur) | 'horizontal' (divise la profondeur)
 * @param {number} toolDiameter  - diamètre fraise (mm), pour validation min. cellule
 * @param {object} [opts]
 * @param {number} [opts.minX=0], [opts.minY=0]  coin de la boîte englobante de la forme
 * @param {{x,y}[]} [opts.cavity]  contour de la cavité (forme rétrécie de l'épaisseur de paroi)
 * @returns {{x,y}[][]|null}     tableau de contours, ou null si les cellules sont trop petites
 */
export function buildPartitionContours(W, D, wallThickness, partitions, partitionDir, toolDiameter, opts = {}) {
  const { minX = 0, minY = 0, cavity = null } = opts;
  const wt   = wallThickness;
  const cols  = partitionDir === 'vertical'   ? partitions + 1 : 1;
  const rows  = partitionDir === 'horizontal' ? partitions + 1 : 1;
  const cellW = (W - 2 * wt - (cols - 1) * wt) / cols;
  const cellH = (D - 2 * wt - (rows - 1) * wt) / rows;
  const minCell = 3 * toolDiameter;

  if (cellW < minCell || cellH < minCell) return null;

  const contours = [];
  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      const x0 = minX + wt + col * (cellW + wt);
      const y0 = minY + wt + row * (cellH + wt);
      contours.push([
        { x: x0,         y: y0 },
        { x: x0 + cellW, y: y0 },
        { x: x0 + cellW, y: y0 + cellH },
        { x: x0,         y: y0 + cellH }
      ]);
    }
  }
  if (!cavity || cavity.length < 3) return contours;

  // Découpe par la cavité ; on écarte les morceaux où la fraise ne passe pas
  const pieces = contours
    .flatMap(c => clipToRegion(c, cavity))
    .filter(p => insetPolygon(p, toolDiameter / 2).length > 2);
  return pieces.length ? pieces : null;
}
