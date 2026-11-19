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
// Valeurs de coupe communes à plusieurs fraises (mêmes fiches fournisseur d'un diamètre à l'autre).
// Identifiants de matière de CuttingParams : 200 bois dur, tendre, 250 contreplaqué, 350 MDF et Valchromat,
// 300 thermoplastiques/PVC, acetate, melamine, mousse, hpl (compacts).
const WOOD_317 = { '200': { vc: 300, fz: 0.016 }, tendre: { vc: 300, fz: 0.016 }, '250': { vc: 350, fz: 0.016 }, '350': { vc: 300, fz: 0.018 } };
const WOOD_4   = { '200': { vc: 300, fz: 0.018 }, tendre: { vc: 300, fz: 0.02 },  '250': { vc: 350, fz: 0.02 },  '350': { vc: 300, fz: 0.02 },  melamine: { vc: 200, fz: 0.048 } };
const WOOD_6   = { '200': { vc: 300, fz: 0.022 }, tendre: { vc: 300, fz: 0.024 }, '250': { vc: 350, fz: 0.024 }, '350': { vc: 300, fz: 0.027 } };
const PLASTIC_317 = { '300': { vc: 200, fz: 0.038 }, acetate: { vc: 180, fz: 0.038 } };
const HELICAL_317 = { ...WOOD_317, ...PLASTIC_317 };
const HELICAL_317_HPL = { ...HELICAL_317, hpl: { vc: 120, fz: 0.016 } };

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
    cutting: { ...WOOD_6, '300': { vc: 200, fz: 0.078 }, acetate: { vc: 180, fz: 0.078 } },
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
    cutting: HELICAL_317,
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
    cutting: { ...WOOD_4, mousse: { vc: 250, fz: 0.12 } },
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
    cutting: { ...WOOD_6, melamine: { vc: 200, fz: 0.06 }, mousse: { vc: 250, fz: 0.15 } },
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
    cutting: HELICAL_317,
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
    cutting: { ...WOOD_4, mousse: { vc: 250, fz: 0.12 } },
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
    cutting: { ...WOOD_4, hpl: { vc: 120, fz: 0.02 } },
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
    cutting: { ...WOOD_317, melamine: { vc: 200, fz: 0.036 }, mousse: { vc: 250, fz: 0.09 } },
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
    cutting: HELICAL_317_HPL,
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
    cutting: HELICAL_317_HPL,
  },
];

export const findTool = ref => TOOLS.find(tool => tool.ref === ref) ?? null;
