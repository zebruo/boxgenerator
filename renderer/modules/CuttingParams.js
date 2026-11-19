/**
 * Calcul des paramètres de coupe CNC.
 * Logique extraite de ParamCoupe/script/cnc.js — sans dépendance DOM.
 */

// Vitesses de coupe (vc) : fiches fraises carbure du fournisseur (bois dur 300, contreplaqué 350,
// MDF et Valchromat 300, thermoplastiques 200, aluminium et non ferreux 120), identiques pour
// les diamètres 3,175 et 6 mm, avec ou sans revêtement.
export const MATERIALS = [
  { id: '200',    label: 'Bois massif',      detail: 'Chêne, hêtre, noyer, bambou…',      vc: 300, color: '#6B3F1E' },
  { id: '150',    label: 'Bois exotique',    detail: 'Teck, iroko, merbau, padouk…',      vc: 300, color: '#3B1A08' },
  { id: '250',    label: 'Contreplaqué',     detail: 'CTP, panneaux lamellés…',            vc: 350, color: '#C4A265' },
  { id: 'tendre', label: 'Bois tendre',      detail: 'Pin, sapin, peuplier…',              vc: 300, color: '#D9C08A' },
  { id: '350',    label: 'MDF / Valcromat',  detail: 'Panneau de fibres, médium',          vc: 300, color: '#9B8B7A' },
  { id: '300',    label: 'PVC / Forex',      detail: 'PVC expansé, Komacel, Forex…',      vc: 200, color: '#E0E0E0' },
  { id: 'hpl',     label: 'Compact HPL',      detail: 'Stratifié compact, Trespa…',         vc: 120, color: '#7A8A99' },
  { id: 'melamine', label: 'Mélaminé / Aggloméré', detail: 'Panneaux mélaminés, particules', vc: 200, color: '#D8CBB4' },
  { id: 'mousse', label: 'Mousses',          detail: 'Mousses synthétiques, PU, PE…',      vc: 250, color: '#E8DDA0' },
  { id: '201.01', label: 'PMMA / Acrylique', detail: 'Plexiglas, thermoplastiques',        vc: 200, color: '#A8D0E8' },
  { id: 'acetate', label: 'Acétate',         detail: 'Acétate de cellulose',               vc: 180, color: '#B5D6C9' },
  { id: '120',    label: 'Aluminium',        detail: '2017A, 5083, 6061…',                vc: 120, color: '#B0C0D0' },
  { id: '120.01', label: 'Cuivre / Laiton',  detail: 'Cuivre, laiton, bronze',            vc: 120, color: '#B87333' },
];

export const DIAMETERS = [1, 2, 2.5, 3, 3.175, 4, 5, 6, 8];

// fz (mm/dent) par diamètre × id matériau
const FZ = {
  '1':     { '150':0.003,'200':0.004,'250':0.005,'350':0.006,'300':0.008,'201.01':0.006,'120':0.004,'120.01':0.003 },
  '2':     { '150':0.010,'200':0.012,'250':0.012,'350':0.013,'300':0.028,'201.01':0.020,'120':0.008,'120.01':0.006 },
  '2.5':   { '150':0.010,'200':0.012,'250':0.012,'350':0.013,'300':0.028,'201.01':0.020,'120':0.008,'120.01':0.006 },
  '3':     { '150':0.013,'200':0.016,'250':0.016,'350':0.018,'300':0.038,'201.01':0.028,'120':0.013,'120.01':0.008 },
  '3.175': { '150':0.013,'200':0.016,'250':0.016,'350':0.018,'300':0.038,'201.01':0.028,'120':0.013,'120.01':0.008 },
  '4':     { '150':0.015,'200':0.018,'250':0.020,'350':0.020,'300':0.048,'201.01':0.035,'120':0.018,'120.01':0.013 },
  '5':     { '150':0.016,'200':0.020,'250':0.022,'350':0.024,'300':0.063,'201.01':0.045,'120':0.020,'120.01':0.015 },
  '6':     { '150':0.018,'200':0.022,'250':0.024,'350':0.027,'300':0.078,'201.01':0.055,'120':0.023,'120.01':0.018 },
  '8':     { '150':0.025,'200':0.031,'250':0.033,'350':0.040,'300':0.088,'201.01':0.065,'120':0.028,'120.01':0.023 },
};

// Coefficient k de profondeur de passe (ap = k × diamètre) : tableau du fournisseur, par plage de
// diamètre (colonnes ⌀ ≥ 2, 3, 4, 5, 6 mm) et famille de matière. Sous 2 mm le tableau indique « NC » :
// on garde les valeurs d'avant (AP_COEFF_SMALL). Les familles : tendre (bois tendre, contreplaqué,
// mousses), aluminium, et durs (tout le reste : bois durs, MDF, plastiques, HPL, mélaminé, cuivre…).
const AP_STEPS = [2, 3, 4, 5, 6];
const AP_K = {
  tendre: [0.5, 0.8, 1, 1, 1],
  durs:   [0.2, 0.4, 0.5, 0.6, 1],
  alu:    [0.1, 0.2, 0.25, 0.35, 0.35],
};
const AP_FAMILY = { '250': 'tendre', tendre: 'tendre', mousse: 'tendre', '120': 'alu' };
const AP_COEFF_SMALL = {
  '150':0.2, '200':0.2, '250':0.5, '350':0.5, '300':0.5, '201.01':0.5, '120':0.2, '120.01':0.1,
  tendre:0.5, acetate:0.5, hpl:0.2, melamine:0.5, mousse:0.5,
};

/** Coefficient k du tableau du fournisseur pour une matière et un diamètre (sans plafond machine). */
export function apCoefficient(matId, diameter) {
  if (!(diameter >= AP_STEPS[0])) return AP_COEFF_SMALL[matId] ?? null;
  let i = 0;
  while (i + 1 < AP_STEPS.length && diameter >= AP_STEPS[i + 1]) i++;
  return AP_K[AP_FAMILY[matId] ?? 'durs'][i];
}

// Bois tendre : même fz que le contreplaqué ; acétate : même que le PVC. Les fiches fournisseur
// (3,175 et 6 mm) donnent des valeurs identiques ; seule la vitesse de coupe diffère.
// Compact HPL, mélaminé/aggloméré et mousses : fz des fiches fournisseur (catalogue des fraises à
// 2 dents). Le 3 mm prend les valeurs du 3,175 et le 2,5 mm celles du 2 mm, comme les autres matières.
// Non fournis par les fiches, donc estimés : le 5 mm (milieu des 4 et 6 mm) et le 1 mm du mélaminé
// et des mousses (proportionnel au 1,5 mm).
const FZ_SPECIAL = {
  hpl:      { '1':0.005, '2':0.012, '2.5':0.012, '3':0.016, '3.175':0.016, '4':0.020, '5':0.022, '6':0.024, '8':0.033 },
  melamine: { '1':0.008, '2':0.024, '2.5':0.024, '3':0.036, '3.175':0.036, '4':0.048, '5':0.054, '6':0.060, '8':0.072 },
  mousse:   { '1':0.020, '2':0.060, '2.5':0.060, '3':0.090, '3.175':0.090, '4':0.120, '5':0.135, '6':0.150, '8':0.180 },
};
for (const dk of Object.keys(FZ)) {
  for (const [id, fzs] of Object.entries(FZ_SPECIAL)) FZ[dk][id] = fzs[dk];
}

for (const dk of Object.keys(FZ)) {
  FZ[dk].tendre = FZ[dk]['250'];
  FZ[dk].acetate = FZ[dk]['300'];
}

/**
 * Trouve la clé diamètre la plus proche dans les tables.
 * Ex : 3.2 → '3.175', 3.5 → '4'
 */
function nearestDiamKey(d) {
  const keys = Object.keys(FZ).map(Number);
  return String(keys.reduce((a, b) => Math.abs(b - d) < Math.abs(a - d) ? b : a, keys[0]));
}

/**
 * Retourne fz et ap calculés automatiquement (sans limites machine).
 */
export function getDefaults(matId, diameter) {
  const dk = nearestDiamKey(diameter);
  const fz = FZ[dk]?.[matId] ?? null;
  const k  = apCoefficient(matId, diameter);
  const ap = k != null ? +((k * diameter).toFixed(2)) : null;
  return { fz, ap };
}

/**
 * @param {object} p
 * @param {number} p.vc          vitesse de coupe (m/min)
 * @param {number} p.diameter    diamètre fraise (mm)
 * @param {number} p.flutes      nombre de dents
 * @param {number} p.matId       id matériau (string clé MATERIALS)
 * @param {number} p.maxSpindle  broche max machine (tr/min)
 * @param {number} p.maxFeed     avance XY max (mm/min)
 * @param {number} p.maxFeedZ    avance Z max (mm/min)
 * @param {number} [p.manualFz]  fz saisi manuellement (optionnel)
 * @param {number} [p.manualAp]  ap saisi manuellement (optionnel)
 * @param {number} [p.maxApK]    profondeur de passe max en fraction du diamètre (ap <= maxApK x diamètre), sinon tableau seul
 * @param {number} [p.spindle]   broche imposée (tr/min, plafonnée par maxSpindle) : sinon calculée depuis vc
 * @returns {{ n, vf, vfZ, ap, fz, vcEff, warnings[] }}
 */
export function calculate(p) {
  const dk  = nearestDiamKey(p.diameter);
  const fz  = (p.manualFz > 0) ? p.manualFz : (FZ[dk]?.[p.matId] ?? 0.01);
  // Profondeur de passe : tableau du fournisseur, plafonné par k max de la machine (maxApK)
  const kTable   = apCoefficient(p.matId, p.diameter) ?? 0.3;
  const kUsed    = p.maxApK > 0 ? Math.min(kTable, p.maxApK) : kTable;
  const apRaw    = (p.manualAp > 0) ? p.manualAp : +(kUsed * p.diameter).toFixed(2);
  const apCapped = !(p.manualAp > 0) && kUsed < kTable;

  const nTheo  = (1000 * p.vc) / (Math.PI * p.diameter);
  const fixedN = p.spindle > 0;
  const n      = Math.min(fixedN ? p.spindle : nTheo, p.maxSpindle);
  const vcEff  = (Math.PI * p.diameter * n) / 1000;

  const vfTheo   = nTheo * fz * p.flutes;
  const vf       = Math.min(n * fz * p.flutes, p.maxFeed);
  const fzEff    = vf / (n * p.flutes);
  const vfZTarget = Math.round(vf / 2);
  const vfZ      = Math.min(vfZTarget, p.maxFeedZ);

  const vcPct        = Math.round((n / nTheo) * 100);
  const nLimited     = !fixedN && nTheo > p.maxSpindle;
  const vfLimited    = (n * fz * p.flutes) > p.maxFeed;
  const zLimited     = vfZTarget > p.maxFeedZ;
  const doubleLimited = nLimited && vfLimited;
  const rubbingRisk  = vfLimited && (fzEff < fz * 0.5);
  const heavyCap     = nLimited && vcPct < 65;

  const warnings = [];
  if (nLimited)      warnings.push({ level: 'info', text: `Broche plafonnée — n cible : ${nTheo.toFixed(0)} tr/min, effectif : ${n.toFixed(0)} tr/min` });
  if (heavyCap)      warnings.push({ level: 'warn', text: `Broche très limitante (${vcPct}% de la vc optimale) — envisagez un diamètre plus grand ou une vc plus basse.` });
  if (vfLimited)     warnings.push({ level: 'info', text: `Avance max machine atteinte — fz effectif : ${fzEff.toFixed(3)} mm/dent au lieu de ${fz} mm/dent` });
  if (doubleLimited) warnings.push({ level: 'warn', text: `Double limitation machine — broche ET avance plafonnées simultanément, conditions de coupe fortement dégradées.` });
  if (rubbingRisk)   warnings.push({ level: 'warn', text: `Risque de frottement — fz effectif (${fzEff.toFixed(3)}) < 50% du recommandé.` });
  if (zLimited)      warnings.push({ level: 'info', text: `Avance Z plafonnée à ${p.maxFeedZ} mm/min (vf/2 cible : ${Math.round(vf / 2)} mm/min)` });

  return {
    n: Math.round(n), nTheo: Math.round(nTheo),
    vf: Math.round(vf), vfTheo: Math.round(vfTheo),
    vfCapped: vfLimited,   // l'avance calculée à la broche réellement utilisée dépasse l'avance max machine
    vfZ, vfZTarget,
    ap: apRaw, fz,
    apTable: +(kTable * p.diameter).toFixed(2), apCapped,   // valeur du tableau du fournisseur, et plafond machine appliqué
    vcEff: Math.round(vcEff), vcTarget: p.vc,
    vcPct,
    warnings,
  };
}
