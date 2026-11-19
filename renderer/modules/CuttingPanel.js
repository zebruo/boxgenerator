import { MATERIALS, DIAMETERS, calculate } from './CuttingParams.js';

/**
 * Réglages de coupe du panneau « Matière & Outil ».
 *
 * La matière, le diamètre, le nombre de dents et la broche déterminent l'avance XY, la
 * plongée et la profondeur par passe (mêmes tables et formules que la fenêtre de calcul).
 * Chaque valeur est « auto » (recalculée à chaque changement) ou « manuelle » (saisie par
 * l'utilisateur, conservée). Les champs du panneau (param-feedrate, param-plunge,
 * param-passes, param-spindle) restent la source du G-code : ce module ne fait que les remplir.
 *
 * Mode de broche : « fixe » (l'utilisateur règle les tr/min, les avances en découlent) ou
 * « auto » (tr/min calculés depuis la vitesse de coupe de la matière).
 * Limites machine (broche, avances) : mémorisées sur l'ordinateur, communes à toutes les pièces.
 */

const STORAGE_KEY = 'bg-cutting-panel';
const RUBBING_RATIO = 0.6;                 // fz réel / fz conseillé en dessous duquel on prévient
const FIELDS = {                       // clé d'état → champ du panneau
  feed:   'param-feedrate',
  plunge: 'param-plunge',
  passes: 'param-passes',
};

/** Clé i18n du libellé d'une matière (les points des identifiants ne conviennent pas aux clés). */
export const materialKey = id => `cut.mat_${id.replace('.', '')}`;

/**
 * @param {object}   o
 * @param {function} o.t            traduction
 * @param {function} o.lang         langue courante ('fr' | 'en')
 * @param {function} o.onChange     appelée après toute modification des valeurs du panneau
 */
export function initCuttingPanel({ t, lang, onChange }) {
  const $ = id => document.getElementById(id);
  const num = id => Number.parseFloat($(id).value);

  let saved = {};
  try { saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}'); } catch { /* stockage indisponible */ }

  const st = {
    matId:        MATERIALS.some(m => m.id === saved.matId) ? saved.matId : '200',
    flutes:       [1, 2, 3, 4].includes(saved.flutes) ? saved.flutes : 2,
    spindleFixed: saved.spindleFixed ?? true,
    manual:       { feed: false, plunge: false, passes: false },
    machine: {                         // TTC450 Pro : 12 000 tr/min, 750 mm/min ($110/$111)
      spindle: saved.machine?.spindle > 0 ? saved.machine.spindle : 12000,
      feed:    saved.machine?.feed    > 0 ? saved.machine.feed    : 750,
      feedZ:   saved.machine?.feedZ   > 0 ? saved.machine.feedZ   : 750,
    },
  };

  const fmt = (v, d = 0) => v.toLocaleString(lang() === 'fr' ? 'fr-FR' : 'en-US', { minimumFractionDigits: d, maximumFractionDigits: d });

  function savePrefs() {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify({ matId: st.matId, flutes: st.flutes, spindleFixed: st.spindleFixed, machine: st.machine })); }
    catch { /* stockage indisponible */ }
  }

  /** Résultat du calculateur pour l'état courant (null si le diamètre n'est pas saisi). */
  function compute() {
    const diameter = num('param-tool-diameter');
    if (!(diameter > 0)) return null;
    const mat = MATERIALS.find(m => m.id === st.matId);
    const spindle = num('param-spindle');
    const r = calculate({
      vc: mat.vc, diameter, flutes: st.flutes, matId: st.matId,
      maxSpindle: st.machine.spindle, maxFeed: st.machine.feed, maxFeedZ: st.machine.feedZ,
      spindle: st.spindleFixed && spindle > 0 ? spindle : 0,
    });
    return { ...r, mat, diameter };
  }

  function setPill(btn, manual) {
    btn.classList.toggle('manual', manual);
    btn.textContent = manual ? t('cut.reset') : t('cut.auto');
    btn.title = manual ? t('cut.tip_manual') : t('cut.tip_auto');
    btn.disabled = !manual;
  }

  function render() {
    const r = compute();
    if (r) {
      if (!st.manual.feed) $(FIELDS.feed).value = r.vf;
      if (!st.manual.plunge) $(FIELDS.plunge).value = Math.min(Math.round(num(FIELDS.feed) / 2), st.machine.feedZ);
      if (!st.manual.passes) $(FIELDS.passes).value = r.ap;
      if (!st.spindleFixed) $('param-spindle').value = r.n;
    }
    // état des champs
    for (const [key, id] of Object.entries(FIELDS)) {
      $(id).classList.toggle('auto-val', !st.manual[key]);
      setPill($(`cut-state-${key}`), st.manual[key]);
    }
    const spindle = $('param-spindle');
    spindle.readOnly = !st.spindleFixed;
    spindle.classList.toggle('auto-val', !st.spindleFixed);
    const mode = $('cut-spindle-mode');
    mode.textContent = st.spindleFixed ? t('cut.fixed') : t('cut.auto');
    mode.title = t(st.spindleFixed ? 'cut.tip_spindle_fixed' : 'cut.tip_spindle_auto');
    $('cut-machine-sum').textContent = `${fmt(st.machine.spindle)} ${t('cut.u_rpm')} · ${fmt(st.machine.feed)} ${t('cut.u_feed')}`;
    renderSummary(r);
  }

  function renderSummary(r) {
    const sum = $('cut-summary'), notes = $('cut-notes');
    notes.textContent = '';
    if (!r) { sum.textContent = ''; return; }
    const vf = num(FIELDS.feed), n = r.n;
    const fzEff = n > 0 && vf > 0 ? vf / (n * st.flutes) : 0;
    const ratio = r.fz > 0 ? fzEff / r.fz : 1;
    sum.textContent = t('cut.summary', {
      mat: t(materialKey(st.matId)), z: st.flutes, vc: fmt(r.vcEff), target: r.mat.vc, fz: fmt(fzEff, 3),
    });
    const add = (warn, text) => {
      const div = document.createElement('div');
      div.className = `cut-note${warn ? ' warn' : ''}`;
      div.textContent = text;
      notes.appendChild(div);
    };
    // Sous 60 % de l'avance par dent conseillée, la fraise frotte au lieu de couper (bois brûlé)
    if (ratio < RUBBING_RATIO)
      add(true, t('cut.w_rubbing', { fz: fmt(fzEff, 3), pct: Math.round(ratio * 100), rec: fmt(r.fz, 3) }));
    else if (st.manual.feed && ratio > 1.5)
      add(true, t('cut.w_heavy', { fz: fmt(fzEff, 3), pct: Math.round(ratio * 100) }));
    if (!st.manual.feed && r.vfCapped)
      add(false, t('cut.i_feed_cap', { feed: fmt(st.machine.feed) }));
    if (st.spindleFixed && num('param-spindle') > st.machine.spindle)
      add(false, t('cut.i_spindle_cap', { n: fmt(st.machine.spindle) }));
    if (!st.spindleFixed && r.nTheo > st.machine.spindle && st.machine.spindle / r.nTheo < 0.65)
      add(true, t('cut.w_spindle', { pct: Math.round(100 * st.machine.spindle / r.nTheo) }));
    if (num(FIELDS.passes) > r.diameter) add(true, t('cut.w_depth'));
  }

  /** Écrit les valeurs, met à jour l'affichage, prévient l'application. */
  function update() { render(); onChange?.(); }

  // ── Matière, dents ──────────────────────────────────────────────────────────
  const sel = $('param-material');
  sel.textContent = '';
  for (const m of MATERIALS) {
    const o = document.createElement('option');
    o.value = m.id; o.dataset.key = materialKey(m.id); o.textContent = t(o.dataset.key);
    sel.appendChild(o);
  }
  sel.value = st.matId;
  sel.addEventListener('change', () => {
    st.matId = sel.value;
    st.manual = { feed: false, plunge: false, passes: false };   // nouvelle matière : tout se recalcule
    savePrefs(); update();
  });

  const fluteBtns = [...document.querySelectorAll('#param-flutes button')];
  const showFlutes = () => fluteBtns.forEach(b => {
    const on = Number(b.dataset.n) === st.flutes;
    b.classList.toggle('active', on); b.setAttribute('aria-pressed', String(on));
  });
  fluteBtns.forEach(b => b.addEventListener('click', () => {
    st.flutes = Number(b.dataset.n); showFlutes(); savePrefs(); update();
  }));
  showFlutes();

  // ── Champs du panneau ───────────────────────────────────────────────────────
  // Un événement « input » vient toujours de l'utilisateur (les valeurs écrites par le code n'en émettent pas)
  $('param-tool-diameter').addEventListener('input', () => { st.manual.passes = false; render(); });
  for (const [key, id] of Object.entries(FIELDS)) {
    $(id).addEventListener('input', () => { st.manual[key] = true; render(); });
    $(`cut-state-${key}`).addEventListener('click', () => { st.manual[key] = false; update(); });
  }
  $('param-spindle').addEventListener('input', () => {
    if (!st.spindleFixed) return;
    st.manual.feed = false; st.manual.plunge = false; render();
  });
  $('cut-spindle-mode').addEventListener('click', () => {
    st.spindleFixed = !st.spindleFixed;
    st.manual.feed = false; st.manual.plunge = false;
    savePrefs(); update();
  });

  // ── Limites machine ─────────────────────────────────────────────────────────
  const mach = { spindle: $('cut-max-spindle'), feed: $('cut-max-feed'), feedZ: $('cut-max-feedz') };
  for (const [key, el] of Object.entries(mach)) {
    el.value = st.machine[key];
    el.addEventListener('input', () => {
      const v = Number.parseFloat(el.value);
      if (v > 0) { st.machine[key] = v; savePrefs(); update(); }
    });
  }

  render();

  return {
    /** État propre à la pièce, enregistré dans la session. */
    getState: () => ({ matId: st.matId, flutes: st.flutes, spindleFixed: st.spindleFixed, manual: { ...st.manual } }),

    /**
     * Restaure l'état d'une session. Sans état (ancienne session), toutes les valeurs du
     * fichier sont gardées telles quelles (manuelles), la broche reste celle du fichier.
     */
    setState(s) {
      if (s) {
        if (MATERIALS.some(m => m.id === s.matId)) st.matId = s.matId;
        if ([1, 2, 3, 4].includes(s.flutes)) st.flutes = s.flutes;
        st.spindleFixed = s.spindleFixed ?? true;
        st.manual = { feed: !!s.manual?.feed, plunge: !!s.manual?.plunge, passes: !!s.manual?.passes };
      } else {
        st.spindleFixed = true;
        st.manual = { feed: true, plunge: true, passes: true };
      }
      sel.value = st.matId; showFlutes(); savePrefs(); render();
    },

    /** Réglages choisis dans la fenêtre « Détails du calcul » : matière, dents, valeurs de coupe. */
    applyDetails({ matId, flutes, diameter, vf, vfZ, ap, manual }) {
      if (MATERIALS.some(m => m.id === matId)) { st.matId = matId; sel.value = matId; }
      if ([1, 2, 3, 4].includes(flutes)) { st.flutes = flutes; showFlutes(); }
      if (diameter > 0 && nearestKey(num('param-tool-diameter')) !== diameter) $('param-tool-diameter').value = diameter;
      // Seules les valeurs réglées à la main dans la fenêtre (vc, fz, profondeur) sont gardées ;
      // le reste se calcule avec la broche du panneau (la fenêtre suppose la broche calculée)
      st.manual = { feed: !!manual?.feed, plunge: !!manual?.feed, passes: !!manual?.passes };
      if (st.manual.feed) { $(FIELDS.feed).value = vf; $(FIELDS.plunge).value = vfZ; }
      if (st.manual.passes) $(FIELDS.passes).value = ap;
      savePrefs(); update();
    },

    /** Réglages à transmettre à la fenêtre « Détails du calcul ». */
    modalOptions: () => ({ matId: st.matId, flutes: st.flutes, maxSpindle: st.machine.spindle, maxFeed: st.machine.feed, maxFeedZ: st.machine.feedZ }),

    /** Retraduit les libellés dynamiques (changement de langue). */
    refresh() {
      for (const o of sel.options) o.textContent = t(o.dataset.key);
      render();
    },
  };
}

// Diamètre de la liste de la fenêtre de calcul le plus proche (elle n'accepte que ceux-là)
function nearestKey(d) {
  return DIAMETERS.reduce((a, b) => Math.abs(b - d) < Math.abs(a - d) ? b : a, DIAMETERS[0]);
}
