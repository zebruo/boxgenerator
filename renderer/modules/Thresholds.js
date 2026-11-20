/**
 * Seuils d'avertissement de BoxGenerator, réunis ici pour être retrouvés et réglés facilement.
 *
 * Ils ne changent que les messages (champ en orange, info-bulle, note du panneau de coupe),
 * jamais le G-code. Les limites qui changent la géométrie usinée (épaisseur minimale des
 * cloisons, rayon de la lèvre, taille minimale des compartiments au calcul des poches)
 * restent dans leurs modules.
 */
export const WARN = {
  // ── Boîte à couvercle : feuillure ──
  rabbetFloorMin: 3,          // mm : matière minimale entre le fond de la feuillure et le fond du corps
  lidSinkMax: 1,              // mm : enfoncement toléré du dessus du couvercle sous le bord du corps (feuillure intérieure)

  // ── Cloisons ──
  partitionCellMinTools: 3,   // largeur minimale d'un compartiment, en diamètres de fraise

  // ── Boîte à encoches ──
  fingerWidthMinThick: 1.5,   // largeur d'un doigt : au moins 1,5 × l'épaisseur du panneau

  // ── Forme haricot ──
  beanRatioMin: 0.5,          // rapport largeur / longueur conseillé : minimum
  beanRatioMax: 1.5,          // … et maximum

  // ── Paramètres de coupe ──
  rubbingRatio: 0.6,          // fz réel / fz conseillé : en dessous, la fraise frotte (bois brûlé)
  heavyFeedRatio: 1.5,        // fz réel / fz conseillé : au-dessus, la fraise force (avance saisie à la main)
  spindleLimitRatio: 0.65,    // vitesse de coupe réelle / conseillée : en dessous, broche « très limitante »
};
