import { clipToRegion, insetPolygon } from './Offset.js';

/**
 * Lit une répartition saisie (« 60/40 », « 1/2/1 », virgule décimale acceptée) pour `count`
 * compartiments. Renvoie null si le champ est vide, { error: 'invalid' | 'count' } si la
 * saisie est inutilisable, sinon { fractions } (somme = 1).
 */
export function parseSplit(text, count) {
  if (typeof text !== 'string' || !text.trim()) return null;
  const vals = text.split('/').map(v => v.trim().replace(',', '.'));
  if (vals.some(v => !/^\d*\.?\d+$/.test(v))) return { error: 'invalid' };
  const nums = vals.map(Number);
  if (nums.some(v => !(v > 0))) return { error: 'invalid' };
  if (nums.length !== count) return { error: 'count' };
  const sum = nums.reduce((a, b) => a + b, 0);
  return { fractions: nums.map(v => v / sum) };
}

/**
 * Largeurs des compartiments (mm) dans la direction divisée : l'espace utile (cavité moins
 * l'épaisseur des cloisons) est réparti selon `split`, ou en parts égales si `split` est vide
 * ou inutilisable (`error` dit alors pourquoi).
 */
export function partitionSizes(W, D, wallThickness, partitions, partitionDir, split = '') {
  const n = partitions + 1, wt = wallThickness;
  const usable = (partitionDir === 'vertical' ? W : D) - 2 * wt - partitions * wt;
  const parsed = parseSplit(split, n);
  const sizes = parsed?.fractions ? parsed.fractions.map(f => usable * f) : Array(n).fill(usable / n);
  return { sizes, error: parsed?.error ?? null };
}

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
 * @param {string}  [opts.split]   répartition des compartiments (« 60/40 »), parts égales si vide
 * @returns {{x,y}[][]|null}     tableau de contours, ou null si les cellules sont trop petites
 */
export function buildPartitionContours(W, D, wallThickness, partitions, partitionDir, toolDiameter, opts = {}) {
  const { minX = 0, minY = 0, cavity = null, split = '' } = opts;
  const wt = wallThickness;
  const vertical = partitionDir === 'vertical';
  const { sizes } = partitionSizes(W, D, wt, partitions, partitionDir, split);
  const across = (vertical ? D : W) - 2 * wt;          // dimension non divisée
  const minCell = 3 * toolDiameter;

  if (Math.min(...sizes) < minCell || across < minCell) return null;

  const contours = [];
  let pos = wt;
  for (const [k, size] of sizes.entries()) {
    if (!split) pos = wt + k * (size + wt);   // parts égales : même calcul qu'avant (G-code inchangé)
    const [x0, y0, cw, ch] = vertical
      ? [minX + pos, minY + wt, size, across]
      : [minX + wt, minY + pos, across, size];
    contours.push([
      { x: x0,      y: y0 },
      { x: x0 + cw, y: y0 },
      { x: x0 + cw, y: y0 + ch },
      { x: x0,      y: y0 + ch }
    ]);
    pos += size + wt;
  }
  if (!cavity || cavity.length < 3) return contours;

  // Découpe par la cavité ; on écarte les morceaux où la fraise ne passe pas
  const pieces = contours
    .flatMap(c => clipToRegion(c, cavity))
    .filter(p => insetPolygon(p, toolDiameter / 2).length > 2);
  return pieces.length ? pieces : null;
}
