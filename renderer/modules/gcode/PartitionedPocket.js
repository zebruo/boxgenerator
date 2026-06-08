/**
 * Calcule les contours rectangulaires des sous-poches séparées par des cloisons.
 * Chaque cloison a la même épaisseur que wallThickness.
 * Les coins intérieurs sont naturellement arrondis au rayon de la fraise.
 *
 * @param {number} W             - largeur totale de la boîte (mm)
 * @param {number} D             - profondeur totale de la boîte (mm)
 * @param {number} wallThickness - épaisseur des parois et cloisons (mm)
 * @param {number} partitions    - nombre de cloisons (≥ 1)
 * @param {string} partitionDir  - 'vertical' (divise la largeur) | 'horizontal' (divise la profondeur)
 * @param {number} toolDiameter  - diamètre fraise (mm), pour validation min. cellule
 * @returns {{x,y}[][]|null}     tableau de contours, ou null si les cellules sont trop petites
 */
export function buildPartitionContours(W, D, wallThickness, partitions, partitionDir, toolDiameter) {
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
      const x0 = wt + col * (cellW + wt);
      const y0 = wt + row * (cellH + wt);
      contours.push([
        { x: x0,         y: y0 },
        { x: x0 + cellW, y: y0 },
        { x: x0 + cellW, y: y0 + cellH },
        { x: x0,         y: y0 + cellH }
      ]);
    }
  }
  return contours;
}
