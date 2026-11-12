/**
 * GCodeProgram.js — Lecture du G-code produit par BoxGenerator, pour la simulation.
 *
 * Gère le sous-ensemble émis par GCodeGenerator : G0/G1/G2/G3 (plan XY, I/J relatifs,
 * hélice avec Z), G83 (perçage, simulé en une seule descente) / G80, G4 (temporisation),
 * mots modaux (G, X, Y, Z, F omis s'ils ne changent pas) et sections « ; ─── … ─── ».
 *
 * Chaque mouvement est daté (t0 → t1, en secondes) à partir des avances du programme et
 * d'une vitesse de déplacement rapide supposée (rapidRate, mm/min).
 */

const MOTION_RE = /^G0?([0-3])(?![0-9.])/;
const WORD_RE   = /([A-Z])([-+]?\d*\.?\d+)/g;
const SECTION_RE = /^;\s*─{3,}\s*(.+?)\s*─{3,}/;
// Repère de retournement écrit par les boîtes usinées sur deux faces (ex. StackableBox)
const FACE2_RE   = /^;\s*FACE 2\b.*miroir ([XY]) autour de [XY]=([-+]?\d*\.?\d+)/i;

/** Classe une section d'après son libellé : 'pocket' | 'drill' | 'contour'. */
export function sectionKind(label) {
  const l = label.toLowerCase();
  if (/trou|perçage|percage|drill|goupille|pin\b|hole/.test(l)) return 'drill';
  if (/cavit|pocket|poche|feuillure|rabbet|compartiment|compartment|rainure|groove|rim/.test(l)) return 'pocket';
  return 'contour';
}

function words(code) {
  const w = {};
  for (const [, k, v] of code.matchAll(WORD_RE)) if (k !== 'G') w[k] = Number.parseFloat(v);
  return w;
}

/** Angle balayé par un arc (signé : + = anti-horaire G3, − = horaire G2). */
function arcSweep(x0, y0, x1, y1, cx, cy, g) {
  const a0 = Math.atan2(y0 - cy, x0 - cx);
  let sw = Math.atan2(y1 - cy, x1 - cx) - a0;
  if (g === 3 && sw <= 1e-9) sw += 2 * Math.PI;
  if (g === 2 && sw >= -1e-9) sw -= 2 * Math.PI;
  return { a0, sw };
}

/**
 * @param {string} code
 * @param {object} [opts]
 * @param {number} [opts.rapidRate=3000]  vitesse des G0 (mm/min)
 * @param {{x,y,z}} [opts.start]          position initiale (défaut : X0 Y0 au-dessus du brut)
 * @returns {{ moves: object[], sections: {label, kind, t0, face}[], totalTime: number,
 *             flip: {axis: 'x'|'y', c: number, t0: number} | null }}
 *   Chaque mouvement porte `face` (1, ou 2 après le repère de retournement) ; ses
 *   coordonnées restent celles du G-code (repère machine de sa face).
 */
export function parseProgram(code, { rapidRate = 3000, start = null } = {}) {
  const moves = [];
  const sections = [];
  let pos = start ? { ...start } : null;
  let gMode = 0, feed = 1000, t = 0, sec = -1, cycleReturnZ = null, face = 1, flip = null;

  const push = (type, to, extra = {}) => {
    if (!pos) { pos = { ...to }; return; }
    const from = pos;
    let len;
    if (type === 'arc') {
      const r = Math.hypot(from.x - extra.cx, from.y - extra.cy);
      len = Math.hypot(Math.abs(extra.sw) * r, to.z - from.z);
    } else {
      len = Math.hypot(to.x - from.x, to.y - from.y, to.z - from.z);
    }
    const rate = type === 'rapid' ? rapidRate : Math.max(1, extra.f ?? feed);
    const dt = len > 0 ? len / rate * 60 : 0;
    moves.push({ type, x0: from.x, y0: from.y, z0: from.z, x: to.x, y: to.y, z: to.z, t0: t, t1: t + dt, sec, face, len, ...extra });
    t += dt;
    pos = { ...to };
  };

  for (const raw of code.split('\n')) {
    const line = raw.trim();
    const sm = line.match(SECTION_RE);
    if (sm) { sections.push({ label: sm[1], kind: sectionKind(sm[1]), t0: t, face }); sec = sections.length - 1; continue; }
    const fm = line.match(FACE2_RE);
    if (fm) {
      face = 2;
      flip = { axis: fm[1].toLowerCase(), c: Number.parseFloat(fm[2]), t0: t };
      continue;   // les déplacements suivants sont dans le repère machine de la face 2
    }
    const semi = line.indexOf(';');
    const c = (semi >= 0 ? line.slice(0, semi) : line).trim().toUpperCase();
    if (!c) continue;

    if (/^G4(?![0-9.])/.test(c)) {           // temporisation (P en secondes)
      const w = words(c);
      if (w.P > 0) { moves.push({ type: 'dwell', x0: pos?.x, y0: pos?.y, z0: pos?.z, x: pos?.x, y: pos?.y, z: pos?.z, t0: t, t1: t + w.P, sec, len: 0 }); t += w.P; }
      continue;
    }
    if (/^G8[1-3](?![0-9.])/.test(c)) {      // cycle de perçage : XY rapide, R rapide, descente, retour
      const w = words(c);
      if (!pos) continue;
      if (w.F) feed = w.F;
      const zInit = cycleReturnZ ?? pos.z;
      cycleReturnZ = zInit;
      const x = w.X ?? pos.x, y = w.Y ?? pos.y, r = w.R ?? pos.z, z = w.Z ?? pos.z;
      push('rapid', { x, y, z: pos.z });
      push('rapid', { x, y, z: r });
      push('feed',  { x, y, z }, { f: feed });
      push('rapid', { x, y, z: zInit });
      continue;
    }
    if (/^G80(?![0-9.])/.test(c)) { cycleReturnZ = null; continue; }

    const m = c.match(MOTION_RE);
    const w = words(c);
    if (m) gMode = +m[1];
    else if (!('X' in w || 'Y' in w || 'Z' in w)) continue;   // ligne sans mouvement (M3, S…, G21…)
    if (w.F) feed = w.F;

    const to = { x: w.X ?? pos?.x ?? 0, y: w.Y ?? pos?.y ?? 0, z: w.Z ?? pos?.z ?? 0 };
    if (gMode === 0) push('rapid', to);
    else if (gMode === 1) push('feed', to, { f: feed });
    else if (pos) {
      const cx = pos.x + (w.I ?? 0), cy = pos.y + (w.J ?? 0);
      const { a0, sw } = arcSweep(pos.x, pos.y, to.x, to.y, cx, cy, gMode);
      push('arc', to, { f: feed, cx, cy, a0, sw, r: Math.hypot(pos.x - cx, pos.y - cy) });
    }
  }
  return { moves, sections, totalTime: t, flip };
}

/**
 * Passe un point du repère machine de sa face au repère du brut (face 1 = dessus).
 * Face 2 : miroir selon l'axe de retournement, et profondeur comptée depuis le dessous
 * (Z machine z → hauteur top + bottom − z dans le brut).
 */
export function toStockFrame(p, face, flip, top, bottom) {
  if (face !== 2 || !flip) return p;
  return {
    x: flip.axis === 'x' ? 2 * flip.c - p.x : p.x,
    y: flip.axis === 'y' ? 2 * flip.c - p.y : p.y,
    z: top + bottom - p.z,
  };
}

/** Position de l'outil à la fraction u ∈ [0,1] d'un mouvement. */
export function pointOnMove(mv, u) {
  if (mv.type === 'arc') {
    const a = mv.a0 + mv.sw * u;
    return { x: mv.cx + mv.r * Math.cos(a), y: mv.cy + mv.r * Math.sin(a), z: mv.z0 + (mv.z - mv.z0) * u };
  }
  return { x: mv.x0 + (mv.x - mv.x0) * u, y: mv.y0 + (mv.y - mv.y0) * u, z: mv.z0 + (mv.z - mv.z0) * u };
}

/** Indice du mouvement en cours au temps t (recherche dichotomique). */
export function moveIndexAt(moves, t) {
  let lo = 0, hi = moves.length - 1;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (moves[mid].t0 <= t) lo = mid; else hi = mid - 1;
  }
  return lo;
}

/** « 1 h 16 », « 12 min 05 s »… */
export function formatDuration(sec) {
  const s = Math.round(sec);
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), r = s % 60;
  if (h) return `${h} h ${String(m).padStart(2, '0')}`;
  if (m) return `${m} min ${String(r).padStart(2, '0')} s`;
  return `${r} s`;
}
