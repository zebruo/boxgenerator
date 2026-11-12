/**
 * Export SVG de fabrication : mêmes contours que le G-code et la simulation (getDrawing),
 * en millimètres, axe Y retourné (le SVG compte Y vers le bas), sans fond.
 * Trois calques Inkscape, couleurs distinctes pour les logiciels laser (LightBurn…) :
 *   - Découpe            (rouge) : contours qui détachent les pièces du brut
 *   - Usinages           (bleu)  : poches, cavités, cloisons, face 2 — non traversants
 *   - Repères            (noir)  : noms des pièces, à masquer avant découpe
 * La face 2 (boîte empilable, pièce retournée) est dessinée à côté de la face 1.
 */

const GAP = 20;      // écart entre face 1 et face 2 (mm)
const MARGIN = 2;    // marge autour du dessin (mm)

/**
 * @param {{pts:{x,y}[], face?:number, outer?:boolean, part?:string, label?:string}[]} drawing
 * @param {(key:string)=>string} t  traduction
 * @returns {string} document SVG
 */
export function buildFabricationSVG(drawing, t) {
  const items = drawing.filter(d => d.pts?.length > 2);
  if (!items.length) return null;

  // Face 2 décalée à droite de la face 1
  const ext = list => {
    const xs = list.flatMap(d => d.pts.map(p => p.x)), ys = list.flatMap(d => d.pts.map(p => p.y));
    return { minX: Math.min(...xs), minY: Math.min(...ys), maxX: Math.max(...xs), maxY: Math.max(...ys) };
  };
  const f1 = items.filter(d => (d.face ?? 1) === 1), f2 = items.filter(d => d.face === 2);
  const dx2 = f1.length && f2.length ? ext(f1).maxX - ext(f2).minX + GAP : 0;
  const placed = items.map(d => d.face === 2 ? { ...d, pts: d.pts.map(p => ({ x: p.x + dx2, y: p.y })) } : d);

  const bb = ext(placed);
  const W = bb.maxX - bb.minX + 2 * MARGIN, H = bb.maxY - bb.minY + 2 * MARGIN;
  // Repère SVG : origine en haut à gauche, Y vers le bas
  const X = x => (x - bb.minX + MARGIN).toFixed(3);
  const Y = y => (bb.maxY - y + MARGIN).toFixed(3);
  const path = pts => 'M' + pts.map(p => `${X(p.x)},${Y(p.y)}`).join(' L') + ' Z';

  const label = d => {
    if (d.label) return t(d.label);
    if (d.face === 2) return t('svg.face2');
    if (d.part === 'lid') return t('panel.top');
    if (d.part === 'body') return t('svg.body');
    return f2.length ? t('svg.face1') : t('svg.body');
  };
  // Un nom par pièce, au centre de son contour extérieur (ou du premier contour de chaque face)
  const named = placed.filter(d => d.outer);
  for (const face of [1, 2]) {
    const ofFace = placed.filter(d => (d.face ?? 1) === face);
    if (ofFace.length && !ofFace.some(d => d.outer)) named.push(ofFace[0]);
  }
  const texts = named.map(d => {
    const e = ext([d]);
    const size = Math.max(3, Math.min(8, (e.maxX - e.minX) / 12));
    return `    <text x="${X((e.minX + e.maxX) / 2)}" y="${Y((e.minY + e.maxY) / 2)}" font-size="${size.toFixed(1)}">${esc(label(d))}</text>`;
  });

  const layer = (id, name, style, body) =>
    `  <g id="${id}" inkscape:groupmode="layer" inkscape:label="${esc(name)}" ${style}>\n${body.join('\n')}\n  </g>`;
  const paths = list => list.map(d => `    <path d="${path(d.pts)}"/>`);

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" xmlns:inkscape="http://www.inkscape.org/namespaces/inkscape"
     width="${W.toFixed(3)}mm" height="${H.toFixed(3)}mm" viewBox="0 0 ${W.toFixed(3)} ${H.toFixed(3)}">
${layer('usinages', t('svg.layer_pockets'), 'fill="none" stroke="#0000ff" stroke-width="0.1"', paths(placed.filter(d => !d.outer)))}
${layer('decoupe', t('svg.layer_cut'), 'fill="none" stroke="#ff0000" stroke-width="0.1"', paths(placed.filter(d => d.outer)))}
${layer('reperes', t('svg.layer_labels'), 'fill="#000000" stroke="none" font-family="sans-serif" text-anchor="middle" dominant-baseline="middle"', texts)}
</svg>
`;
}

const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
