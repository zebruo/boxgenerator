/**
 * Calcul des paramètres de coupe CNC.
 * Logique extraite de ParamCoupe/script/cnc.js — sans dépendance DOM.
 */

export const MATERIALS = [
  { id: '200',    label: 'Bois massif',      detail: 'Chêne, hêtre, noyer, bambou…',      vc: 200, color: '#6B3F1E' },
  { id: '150',    label: 'Bois exotique',    detail: 'Teck, iroko, merbau, padouk…',      vc: 150, color: '#3B1A08' },
  { id: '250',    label: 'Contreplaqué',     detail: 'CTP, pin, sapin, bois tendre…',     vc: 250, color: '#C4A265' },
  { id: '350',    label: 'MDF / Valcromat',  detail: 'Panneau de fibres, médium',          vc: 350, color: '#9B8B7A' },
  { id: '300',    label: 'PVC / Forex',      detail: 'PVC expansé, Komacel, Forex…',      vc: 300, color: '#E0E0E0' },
  { id: '201.01', label: 'PMMA / Acrylique', detail: 'Plexiglas, thermoplastiques',        vc: 200, color: '#A8D0E8' },
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

// coefficient ap = coeff × diamètre
const AP_COEFF = {
  '1':     { '150':0.2,'200':0.2,'250':0.5,'350':0.5,'300':0.5,'201.01':0.5,'120':0.2,'120.01':0.1 },
  '2':     { '150':0.2,'200':0.2,'250':0.5,'350':0.5,'300':0.5,'201.01':0.5,'120':0.2,'120.01':0.1 },
  '2.5':   { '150':0.2,'200':0.2,'250':0.5,'350':0.5,'300':0.5,'201.01':0.5,'120':0.2,'120.01':0.1 },
  '3':     { '150':0.3,'200':0.4,'250':0.5,'350':0.5,'300':0.5,'201.01':0.5,'120':0.4,'120.01':0.1 },
  '3.175': { '150':0.3,'200':0.4,'250':0.5,'350':0.5,'300':0.5,'201.01':0.5,'120':0.4,'120.01':0.1 },
  '4':     { '150':0.4,'200':0.5,'250':0.5,'350':0.5,'300':0.5,'201.01':0.5,'120':0.5,'120.01':0.2 },
  '5':     { '150':0.4,'200':0.5,'250':0.5,'350':0.5,'300':0.5,'201.01':0.5,'120':0.5,'120.01':0.25},
  '6':     { '150':0.4,'200':0.5,'250':0.5,'350':0.5,'300':0.5,'201.01':0.5,'120':0.5,'120.01':0.3 },
  '8':     { '150':0.4,'200':0.5,'250':0.5,'350':0.5,'300':0.5,'201.01':0.5,'120':0.5,'120.01':0.3 },
};

/**
 * Trouve la clé diamètre la plus proche dans les tables.
 * Ex : 3.2 → '3.175', 3.5 → '4'
 */
function nearestDiamKey(d) {
  const keys = Object.keys(FZ).map(Number);
  return String(keys.reduce((a, b) => Math.abs(b - d) < Math.abs(a - d) ? b : a));
}

/**
 * Retourne fz et ap calculés automatiquement (sans limites machine).
 */
export function getDefaults(matId, diameter) {
  const dk = nearestDiamKey(diameter);
  const fz = FZ[dk]?.[matId] ?? null;
  const ap = (AP_COEFF[dk]?.[matId] != null)
    ? +((AP_COEFF[dk][matId] * diameter).toFixed(2))
    : null;
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
 * @returns {{ n, vf, vfZ, ap, fz, vcEff, warnings[] }}
 */
export function calculate(p) {
  const dk  = nearestDiamKey(p.diameter);
  const fz  = (p.manualFz > 0) ? p.manualFz : (FZ[dk]?.[p.matId] ?? 0.01);
  const apRaw = (p.manualAp > 0) ? p.manualAp
              : +(((AP_COEFF[dk]?.[p.matId] ?? 0.3) * p.diameter).toFixed(2));

  const nTheo  = (1000 * p.vc) / (Math.PI * p.diameter);
  const n      = Math.min(nTheo, p.maxSpindle);
  const vcEff  = (Math.PI * p.diameter * n) / 1000;

  const vfTheo   = nTheo * fz * p.flutes;
  const vf       = Math.min(n * fz * p.flutes, p.maxFeed);
  const fzEff    = vf / (n * p.flutes);
  const vfZTarget = Math.round(vf / 2);
  const vfZ      = Math.min(vfZTarget, p.maxFeedZ);

  const vcPct        = Math.round((n / nTheo) * 100);
  const nLimited     = nTheo > p.maxSpindle;
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
    vfZ, vfZTarget,
    ap: apRaw, fz,
    vcEff: Math.round(vcEff), vcTarget: p.vc,
    vcPct,
    warnings,
  };
}
