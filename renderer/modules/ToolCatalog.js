/**
 * Catalogue de fraises : fraises dont les paramètres de coupe viennent de la fiche du fournisseur.
 *
 * Choisir une fraise fixe son diamètre et son nombre de dents, limite les matières à celles de la
 * fiche, et remplace la vitesse de coupe (vc) et l'avance par dent (fz) des tables génériques.
 * La profondeur de passe reste celle des tables (les fiches ne la donnent pas).
 *
 * `cutting` : identifiant de matière de CuttingParams → { vc en m/min, fz en mm/dent }.
 */
export const TOOLS = [
  {
    ref: 'FC2DH600',
    type: 'helical',                 // hélicoïdale positive, bout plat
    diameter: 6,
    flutes: 2,
    cuttingLength: 25,
    overallLength: 50,
    shank: 6,
    coating: false,
    url: 'https://www.cncfraises.fr/67-fc2dh600.html',
    cutting: {
      '200':    { vc: 300, fz: 0.022 },   // bois dur
      tendre:   { vc: 300, fz: 0.024 },
      '250':    { vc: 350, fz: 0.024 },   // contreplaqué
      '350':    { vc: 300, fz: 0.027 },   // MDF et Valchromat
      '300':    { vc: 200, fz: 0.078 },   // thermoplastiques, PVC
      acetate:  { vc: 180, fz: 0.078 },
    },
  },
];

export const findTool = ref => TOOLS.find(tool => tool.ref === ref) ?? null;
