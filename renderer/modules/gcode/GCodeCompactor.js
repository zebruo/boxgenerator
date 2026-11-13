/**
 * GCodeCompactor.js — Post-traitement du G-code émis par GCodeGenerator.
 *
 * 1. Regroupement en arcs : les suites de G1 dans un même plan Z, à la même avance,
 *    dont les points suivent un cercle (écart ≤ tol), sont remplacées par un seul G2/G3.
 *    Garde-fou : la flèche de chaque segment doit aussi rester ≤ tol, pour qu'un polygone
 *    (polygone…) dont les sommets sont sur un cercle ne soit jamais transformé en cercle.
 * 2. Mots modaux : X, Y, Z et F ne sont écrits que lorsqu'ils changent.
 *
 * L'état modal et la position connue sont réinitialisés à chaque marqueur de section
 * (« ; ─── … ─── ») et à chaque ligne non-mouvement (M5, G83, G80…) : chaque section
 * reste autonome lorsque l'export n'en retient qu'une partie.
 */

const SECTION_RE = /^;\s*─{3,}/;
const MOTION_RE  = /^G0?([0-3])(?![0-9.])/;
const WORD_RE    = /([A-Z])([-+]?\d*\.?\d+)/g;
const EPS        = 1e-9;

function parseLine(line) {
  const semi    = line.indexOf(';');
  const code    = (semi >= 0 ? line.slice(0, semi) : line).trim();
  const comment = semi >= 0 ? line.slice(semi).trim() : '';
  if (!code) return { kind: 'text', line, section: SECTION_RE.test(line.trim()) };

  const m = code.match(MOTION_RE);
  if (!m) return { kind: 'raw', line, code };

  const words = {};
  for (const [, letter, num] of code.matchAll(WORD_RE)) {
    if (letter === 'G') continue;
    words[letter] = { tok: num, v: Number.parseFloat(num) };
  }
  return { kind: 'move', g: +m[1], words, comment };
}

/** Cercle passant par trois points, ou null s'ils sont alignés. */
function circle3(a, b, c) {
  const d = 2 * (a.x * (b.y - c.y) + b.x * (c.y - a.y) + c.x * (a.y - b.y));
  if (Math.abs(d) < 1e-9) return null;
  const a2 = a.x * a.x + a.y * a.y, b2 = b.x * b.x + b.y * b.y, c2 = c.x * c.x + c.y * c.y;
  const cx = (a2 * (b.y - c.y) + b2 * (c.y - a.y) + c2 * (a.y - b.y)) / d;
  const cy = (a2 * (c.x - b.x) + b2 * (a.x - c.x) + c2 * (b.x - a.x)) / d;
  return { cx, cy, r: Math.hypot(a.x - cx, a.y - cy) };
}

/**
 * Écart maxi entre un segment (corde) et l'arc qui le remplace. Les formes discrétisent
 * leurs arrondis assez grossièrement (Rectangle : 8 segments par quart → 0,05 mm à R10) ;
 * l'arc obtenu est alors plus proche de la forme dessinée que la polyligne. Au-delà de
 * cette limite, la polyligne est gardée : un polygone (même à 32 côtés, dès ~40 mm)
 * n'est jamais transformé en cercle.
 */
const SAG_MAX = 0.1;

/** Écart angulaire a − prev, ramené dans ]−π, π]. */
function angleStep(a, prev) {
  let d = a - prev;
  if (d > Math.PI) d -= 2 * Math.PI;
  if (d <= -Math.PI) d += 2 * Math.PI;
  return d;
}

/**
 * Parcourt les sommets autour du cercle c : renvoie { sweep, sign } (balayage total et sens),
 * ou null si un sommet s'écarte du cercle, si le sens change, ou si un segment est trop long
 * (plus d'un quart de tour, ou flèche segment / arc au-delà de SAG_MAX).
 */
function arcSweep(pts, c, tol) {
  let sweep = 0, sign = 0;
  let prevA = Math.atan2(pts[0].y - c.cy, pts[0].x - c.cx);
  for (let k = 1; k < pts.length; k++) {
    const p = pts[k];
    if (Math.abs(Math.hypot(p.x - c.cx, p.y - c.cy) - c.r) > tol) return null;
    const a = Math.atan2(p.y - c.cy, p.x - c.cx);
    const d = angleStep(a, prevA);
    prevA = a;
    if (Math.abs(d) < 1e-12) continue;
    const s = Math.sign(d);
    const reversed = sign && s !== sign;                                   // changement de sens
    const tooLong  = Math.abs(d) > Math.PI / 2 ||                          // segment trop long
                     c.r * (1 - Math.cos(Math.abs(d) / 2)) > SAG_MAX;      // flèche segment / arc
    if (reversed || tooLong) return null;
    sign = s;
    sweep += d;
  }
  return { sweep, sign };
}

/** Teste si la polyligne pts[0..n] est un arc : sommets à tol près du cercle. Renvoie {cx, cy, dir} ou null. */
function fitArc(pts, tol) {
  const n = pts.length - 1;
  const c = circle3(pts[0], pts[n >> 1], pts[n]);
  if (!c || c.r < 0.05 || c.r > 5000) return null;
  const arc = arcSweep(pts, c, tol);
  if (!arc?.sign || Math.abs(arc.sweep) > 1.9 * Math.PI) return null;
  return { cx: c.cx, cy: c.cy, dir: arc.sign > 0 ? 3 : 2 };
}

const MIN_SEGS = 4;   // un arc remplace au moins 4 segments G1
const UNKNOWN  = Object.freeze({ x: null, y: null, z: null });

// ── Passe 1 : position avant/après et avance de chaque mouvement ───────────
function resolvePositions(recs) {
  let pos = UNKNOWN, feed = null;
  for (const r of recs) {
    if (r.kind === 'raw' || (r.kind === 'text' && r.section)) {
      pos = UNKNOWN; feed = null;   // section ou cycle : position non garantie
      continue;
    }
    if (r.kind !== 'move') continue;
    const w = r.words;
    if (w.F) feed = w.F.v;
    r.from = pos;
    r.feed = feed;
    pos = { x: w.X?.v ?? pos.x, y: w.Y?.v ?? pos.y, z: w.Z?.v ?? pos.z };
    r.to = pos;
  }
}

// ── Passe 2 : regroupement des G1 en arcs ──────────────────────────────────
function isPlanarG1(r, z, f) {
  return r?.kind === 'move' && r.g === 1 && !r.comment &&
    r.from.x !== null && r.from.y !== null && r.from.z !== null &&
    r.to.z === r.from.z && Math.abs(r.from.z - z) < EPS && r.feed === f &&
    (r.words.X || r.words.Y) && !r.words.I && !r.words.J;
}

/** Plus long arc commençant à recs[i] : {end, fit} ou null. */
function longestArcFrom(recs, i, tol) {
  const r = recs[i], z = r.from.z, f = r.feed;
  const pts = [{ x: r.from.x, y: r.from.y }, { x: r.to.x, y: r.to.y }];
  let best = null;
  for (let j = i + 1; j < recs.length && isPlanarG1(recs[j], z, f); j++) {
    pts.push({ x: recs[j].to.x, y: recs[j].to.y });
    if (j - i + 1 < MIN_SEGS) continue;
    const fit = fitArc(pts, tol);
    if (fit) best = { end: j, fit };
    else if (best ? j - best.end > 2 : j - i > 8) break;
  }
  return best;
}

function fitArcs(recs, tol) {
  const out = [];
  let i = 0;
  while (i < recs.length) {
    const r = recs[i];
    const arc = r.kind === 'move' && r.g === 1 && r.from.z !== null && isPlanarG1(r, r.from.z, r.feed)
      ? longestArcFrom(recs, i, tol) : null;
    if (!arc) { out.push(r); i++; continue; }

    const e = recs[arc.end];
    out.push({
      kind: 'move', g: arc.fit.dir, comment: '',
      words: {
        X: { tok: e.to.x.toFixed(3), v: e.to.x },
        Y: { tok: e.to.y.toFixed(3), v: e.to.y },
        I: { tok: (arc.fit.cx - r.from.x).toFixed(3) },
        J: { tok: (arc.fit.cy - r.from.y).toFixed(3) },
        F: { tok: String(r.feed), v: r.feed },
      },
    });
    i = arc.end + 1;
  }
  return out;
}

// ── Passe 3 : émission, X/Y/Z/F seulement quand ils changent ───────────────
const differs = (a, b) => a === null || Math.abs(a - b) > EPS;

/** Mots X/Y/Z à écrire : sur un arc X et Y toujours (le point final définit l'arc), sinon seulement s'ils changent. */
function axisWords(w, isArc, st) {
  const parts = [];
  for (const k of ['X', 'Y', 'Z']) {
    if (!w[k]) continue;
    const key = k.toLowerCase();
    if ((isArc && k !== 'Z') || differs(st[key], w[k].v)) parts.push(k + w[k].tok);
    st[key] = w[k].v;
  }
  return parts;
}

function formatMove(r, st) {
  const w = r.words, isArc = r.g === 2 || r.g === 3;
  const axes   = axisWords(w, isArc, st);
  const centre = isArc ? ['I', 'J'].filter(k => w[k]).map(k => k + w[k].tok) : [];
  // mots inattendus : conservés tels quels
  const extras = Object.keys(w).filter(k => !'XYZIJF'.includes(k)).map(k => k + w[k].tok);
  if (axes.length === 0 && extras.length === 0 && !isArc) return r.comment || null;   // mouvement nul
  const parts = [`G${r.g}`, ...axes, ...centre, ...extras];
  if (w.F && differs(st.f, w.F.v)) { parts.push('F' + w.F.tok); st.f = w.F.v; }
  return r.comment ? `${parts.join(' ')}   ${r.comment}` : parts.join(' ');
}

function emit(recs) {
  const result = [];
  let st = { ...UNKNOWN, f: null };
  for (const r of recs) {
    if (r.kind === 'move') {
      const line = formatMove(r, st);
      if (line !== null) result.push(line);
      continue;
    }
    if (r.kind === 'raw' || r.section) {
      st = { ...UNKNOWN, f: null };
    }
    result.push(r.line);
  }
  return result;
}

/**
 * @param {string[]} lines          lignes brutes de GCodeGenerator
 * @param {object}   opts
 * @param {boolean}  opts.arcs      regroupement G2/G3 (défaut true)
 * @param {number}   opts.tol       tolérance mm (défaut 0.015)
 * @returns {string[]}
 */
export function compactGCode(lines, { arcs = true, tol = 0.015 } = {}) {
  const recs = lines.map(parseLine);
  resolvePositions(recs);
  return emit(arcs ? fitArcs(recs, tol) : recs);
}
