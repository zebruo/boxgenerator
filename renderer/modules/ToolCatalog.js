/**
 * Catalogue de fraises : fraises dont les paramètres de coupe viennent de la fiche du fournisseur.
 *
 * Choisir une fraise fixe son diamètre et son nombre de dents, limite les matières à celles de la
 * fiche, et remplace la vitesse de coupe (vc) et l'avance par dent (fz) des tables génériques.
 * La profondeur de passe reste celle des tables (les fiches ne la donnent pas).
 *
 * `nose` (optionnel) : bout autre que plat, par exemple 'fishtail'.
 * `type` : 'helical' (hélicoïdale positive), 'straight' (droite) ou 'compression' ; `coating` : false ou nom du revêtement.
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
  {
    ref: 'FC2DD617EB',
    type: 'straight',
    diameter: 6,
    flutes: 2,
    cuttingLength: 17,
    overallLength: 50,
    shank: 6,
    coating: 'TiXCo3',
    url: 'https://www.cncfraises.fr/463-fraise-2-dents-droites-carbure-diametre-de-coupe-6-mm-longueur-utile-17-mm-queue-6-mm-evoblack.html',
    cutting: {
      '200':    { vc: 300, fz: 0.022 },   // bois dur
      tendre:   { vc: 300, fz: 0.024 },
      '250':    { vc: 350, fz: 0.024 },   // contreplaqué
      '350':    { vc: 300, fz: 0.027 },   // MDF et Valchromat
      melamine: { vc: 200, fz: 0.06 },
      mousse:   { vc: 250, fz: 0.15 },
    },
  },
  {
    ref: 'FC2DH317XL',               // version longue de la FC2DH317, mêmes valeurs de coupe
    type: 'helical',
    diameter: 3.175,
    flutes: 2,
    cuttingLength: 33,
    overallLength: 60,
    shank: 3.175,
    coating: false,
    url: 'https://www.cncfraises.fr/127-fraise-2-dents-317-mm-carbure-helicoidale-xl.html',
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
    ref: 'FC2DD417EB',               // version courte de la FC2DD425EB, mêmes valeurs de coupe
    type: 'straight',
    diameter: 4,
    flutes: 2,
    cuttingLength: 17,
    overallLength: 40,
    shank: 4,
    coating: 'TiXCo3',
    url: 'https://www.cncfraises.fr/460-fraise-2-dents-droites-carbure-diametre-de-coupe-4-mm-longueur-utile-17-mm-queue-4-mm.html',
    cutting: {
      '200':    { vc: 300, fz: 0.018 },   // bois dur
      tendre:   { vc: 300, fz: 0.02 },
      '250':    { vc: 350, fz: 0.02 },    // contreplaqué
      '350':    { vc: 300, fz: 0.02 },    // MDF et Valchromat
      melamine: { vc: 200, fz: 0.048 },
      mousse:   { vc: 250, fz: 0.12 },
    },
  },
  {
    ref: 'FCCOMP422EB',
    type: 'compression',             // hélices inversées : chants nets sur les deux faces
    diameter: 4,
    flutes: 2,
    cuttingLength: 22,
    overallLength: 55,
    shank: 4,
    coating: 'TiXCo3',
    url: 'https://www.cncfraises.fr/493-fraise-2-dents-compression-4-mm-longueur-utile-22mm.html',
    cutting: {
      '200':    { vc: 300, fz: 0.018 },   // bois dur
      tendre:   { vc: 300, fz: 0.02 },
      '250':    { vc: 350, fz: 0.02 },    // contreplaqué
      '350':    { vc: 300, fz: 0.02 },    // MDF et Valchromat
      melamine: { vc: 200, fz: 0.048 },
      hpl:      { vc: 120, fz: 0.02 },    // compacts HPL
    },
  },
  {
    ref: 'FC2DD317_17EB',
    type: 'straight',
    diameter: 3.175,
    flutes: 2,
    cuttingLength: 17,
    overallLength: 38,
    shank: 3.175,
    coating: 'TiXCo3',
    url: 'https://www.cncfraises.fr/456-fraise-2-dents-droites-carbure-diametre-coupe-3-175-mm-longueur-utile-17-mm-queue-3-175-mm-evoblackhtml.html',
    cutting: {
      '200':    { vc: 300, fz: 0.016 },   // bois dur
      tendre:   { vc: 300, fz: 0.016 },
      '250':    { vc: 350, fz: 0.016 },   // contreplaqué
      '350':    { vc: 300, fz: 0.018 },   // MDF et Valchromat
      melamine: { vc: 200, fz: 0.036 },
      mousse:   { vc: 250, fz: 0.09 },
    },
  },
  {
    ref: 'FC2D3012FTEVO',
    type: 'helical',
    nose: 'fishtail',                // bout fishtail (les autres fraises du catalogue sont à bout plat)
    diameter: 3.175,
    flutes: 2,
    cuttingLength: 12,
    overallLength: 38,
    shank: 3.175,
    coating: false,
    url: 'https://www.cncfraises.fr/227-fraise-2-levres-fishtail-carbure-queue-3-175-diametre-coupe-3-17-mm-longueur-utile-12-mm-gamme-evo.html',
    cutting: {
      '200':    { vc: 300, fz: 0.016 },   // bois dur
      tendre:   { vc: 300, fz: 0.016 },
      '250':    { vc: 350, fz: 0.016 },   // contreplaqué
      '350':    { vc: 300, fz: 0.018 },   // MDF et Valchromat
      hpl:      { vc: 120, fz: 0.016 },   // compacts HPL
      '300':    { vc: 200, fz: 0.038 },   // thermoplastiques, PVC
      acetate:  { vc: 180, fz: 0.038 },
    },
  },
  {
    ref: 'FC2D3012FTEB',             // version revêtue Evoblack de la FC2D3012FTEVO, mêmes valeurs de coupe
    type: 'helical',
    nose: 'fishtail',
    diameter: 3.175,
    flutes: 2,
    cuttingLength: 12,
    overallLength: 38,
    shank: 3.175,
    coating: 'TiXCo3',
    url: 'https://www.cncfraises.fr/391-fraise-2-dents-fishtail-carbure-queue-3-175-diametre-coupe-3-17-mm-longueur-utile-12-mm-evoblack.html',
    cutting: {
      '200':    { vc: 300, fz: 0.016 },   // bois dur
      tendre:   { vc: 300, fz: 0.016 },
      '250':    { vc: 350, fz: 0.016 },   // contreplaqué
      '350':    { vc: 300, fz: 0.018 },   // MDF et Valchromat
      hpl:      { vc: 120, fz: 0.016 },   // compacts HPL
      '300':    { vc: 200, fz: 0.038 },   // thermoplastiques, PVC
      acetate:  { vc: 180, fz: 0.038 },
    },
  },
];

export const findTool = ref => TOOLS.find(tool => tool.ref === ref) ?? null;
