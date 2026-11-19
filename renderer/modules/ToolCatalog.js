/**
 * Catalogue de fraises : fraises dont les paramètres de coupe viennent de la fiche du fournisseur.
 *
 * Choisir une fraise fixe son diamètre et son nombre de dents, limite les matières à celles de la
 * fiche, et remplace la vitesse de coupe (vc) et l'avance par dent (fz) des tables génériques.
 * La profondeur de passe reste celle des tables (les fiches ne la donnent pas).
 *
 * `type` : 'helical' (hélicoïdale positive) ou 'straight' (droite) ; `coating` : false ou nom du revêtement.
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
  {
    ref: 'FC2DH317',
    type: 'helical',
    diameter: 3.175,
    flutes: 2,
    cuttingLength: 15,
    overallLength: 38,
    shank: 3.175,
    coating: false,
    url: 'https://www.cncfraises.fr/66-fc2dh317.html',
    cutting: {
      '200':    { vc: 300, fz: 0.016 },   // bois dur
      tendre:   { vc: 300, fz: 0.016 },
      '250':    { vc: 350, fz: 0.016 },   // contreplaqué
      '350':    { vc: 300, fz: 0.018 },   // MDF et Valchromat
      '300':    { vc: 200, fz: 0.038 },   // thermoplastiques, PVC
      acetate:  { vc: 180, fz: 0.038 },
    },
  },
  {
    ref: 'FC2DD425EB',
    type: 'straight',                // droite (hélice nulle), bout plat, revêtement Evoblack
    diameter: 4,
    flutes: 2,
    cuttingLength: 25,
    overallLength: 50,
    shank: 4,
    coating: 'TiXCo3',
    url: 'https://www.cncfraises.fr/458-fraise-2-dents-droites-carbure-diametre-de-coupe-4-mm-longueur-utile-25-mm-queue-4-mm.html',
    cutting: {
      '200':    { vc: 300, fz: 0.018 },   // bois dur
      tendre:   { vc: 300, fz: 0.02 },
      '250':    { vc: 350, fz: 0.02 },    // contreplaqué
      '350':    { vc: 300, fz: 0.02 },    // MDF et Valchromat
      melamine: { vc: 200, fz: 0.048 },
      mousse:   { vc: 250, fz: 0.12 },
    },
  },
];

export const findTool = ref => TOOLS.find(tool => tool.ref === ref) ?? null;
