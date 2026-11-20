import { MATERIALS, calculate, getDefaults } from './CuttingParams.js';

/**
 * Ouvre la modale de calcul des paramètres de coupe.
 * @param {number}   toolDiameter  diamètre pré-sélectionné depuis BoxGenerator
 * @param {function} onApply       callback(result) — reçoit le résultat complet de calculate() + diameter, matId, flutes
 * @param {object}   [opts]        matière, dents, limites machine (dont maxApK) et fraise du catalogue (tool) du panneau ;
 *                                 sinon dernières valeurs mémorisées
 */
export function showCuttingParamsModal(toolDiameter = 3.175, onApply, opts = {}) {

  // ── État interne ───────────────────────────────────────────────────────────
  const STORAGE_KEY = 'bg-cutting-params';
  const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');

  const tool     = opts.tool ?? null;          // fraise du catalogue : diamètre, dents et matières imposés, valeurs de la fiche
  let selMatId   = opts.matId      ?? saved.matId     ?? '200';
  if (tool && !tool.cutting[selMatId]) selMatId = Object.keys(tool.cutting)[0];
  let selDiam    = toolDiameter > 0 ? toolDiameter : 3.175;     // diamètre libre (les tables prennent le diamètre le plus proche)
  let selFlutes  = tool ? tool.flutes : (opts.flutes ?? saved.flutes ?? 2);
  let manualFz   = null;
  const man      = { vc: false, fz: false, ap: false };   // champ saisi à la main (sinon valeur calculée, pastille « auto »)
  let manualAp   = null;
  let maxFeed    = opts.maxFeed     ?? saved.maxFeed    ?? 750;
  let maxFeedZ   = opts.maxFeedZ    ?? saved.maxFeedZ   ?? 750;
  let maxSpindle = opts.maxSpindle  ?? saved.maxSpindle ?? 12000;
  let maxApK     = opts.maxApK      ?? saved.maxApK     ?? 0.4;     // profondeur de passe max, en fraction du diamètre
  let lastResult = null;

  function savePrefs() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ matId: selMatId, flutes: selFlutes, maxFeed, maxFeedZ, maxSpindle, maxApK }));
  }

  // ── DOM ───────────────────────────────────────────────────────────────────
  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay cp-overlay';   // sans flou : le panneau de gauche reste lisible

  const modal = document.createElement('div');
  modal.className = 'cp-modal';
  modal.innerHTML = `
    <div class="cp-header">
      <span class="cp-title">Paramètres de coupe</span>
      <button class="cp-close" title="Fermer">✕</button>
    </div>

    <div class="cp-body">

      <!-- ÉTAPE 1 : Matériau -->
      <div class="cp-step">
        <div class="cp-step-label">1 — Matériau</div>
        <div class="cp-mat-grid" id="cp-mat-grid"></div>
        <div class="cp-manual-row">
          <span class="cp-muted">Vc (m/min)</span>
          <input type="number" id="cp-vc-manual" class="cp-input-sm" min="10" max="1000" step="1">
          <button type="button" class="cut-state" data-for="cp-vc-manual">auto</button>
        </div>
      </div>

      <!-- ÉTAPE 2 : Fraise -->
      <div class="cp-step">
        <div class="cp-step-label">2 — Fraise</div>
        ${tool ? `<div class="cp-muted" style="margin-bottom:6px">Fraise du catalogue ${tool.ref} : diamètre, dents et valeurs de la fiche du fournisseur.</div>` : ''}
        <div class="cp-row-label">Diamètre (mm)</div>
        <div class="cp-manual-row" style="margin-top:0">
          <input type="number" id="cp-diam" class="cp-input-sm" min="0.5" max="25" step="0.1" value="${selDiam}"${tool ? ' readonly' : ''}>
        </div>
        <div class="cp-row-label" style="margin-top:8px">Nombre de dents</div>
        <div class="cp-pills" id="cp-flutes-pills">
          ${[1,2,3,4].map(n => `<button class="cp-pill${n===selFlutes?' active':''}" data-val="${n}"${tool ? ' disabled' : ''}>${n}</button>`).join('')}
        </div>
        <div class="cp-defaults-row" style="margin-top:10px">
          <div class="cp-default-item">
            <span class="cp-muted">fz (mm/dent)</span>
            <input type="number" id="cp-fz-manual" class="cp-input-sm" min="0.001" max="1" step="0.001">
          <button type="button" class="cut-state" data-for="cp-fz-manual">auto</button>
          </div>
          <div class="cp-default-item">
            <span class="cp-muted">ap (mm)</span>
            <input type="number" id="cp-ap-manual" class="cp-input-sm" min="0.1" max="50" step="0.1">
          <button type="button" class="cut-state" data-for="cp-ap-manual">auto</button>
          </div>
        </div>
      </div>

      <!-- ÉTAPE 3 : Machine -->
      <div class="cp-step">
        <div class="cp-step-label">3 — Limites machine</div>
        <div class="cp-slider-row">
          <label>Avance XY max</label>
          <input type="range" id="cp-sl-feed" min="200" max="5000" step="100" value="${maxFeed}">
          <span id="cp-sl-feed-val">${maxFeed}</span><span class="cp-muted">mm/min</span>
        </div>
        <div class="cp-slider-row">
          <label>Avance Z max</label>
          <input type="range" id="cp-sl-feedz" min="50" max="2000" step="50" value="${maxFeedZ}">
          <span id="cp-sl-feedz-val">${maxFeedZ}</span><span class="cp-muted">mm/min</span>
        </div>
        <div class="cp-slider-row">
          <label>Broche max</label>
          <input type="range" id="cp-sl-spindle" min="5000" max="30000" step="1000" value="${maxSpindle}">
          <span id="cp-sl-spindle-val">${maxSpindle}</span><span class="cp-muted">tr/min</span>
        </div>
        <div class="cp-slider-row">
          <label>Prof. max</label>
          <input type="range" id="cp-sl-apk" min="0.1" max="1" step="0.05" value="${maxApK}">
          <span id="cp-sl-apk-val">${maxApK}</span><span class="cp-muted">× ⌀</span>
        </div>
        <div class="cp-muted">Prof. max : profondeur de passe maximale en fraction du diamètre. Repères du fournisseur en rainurage : 0,3 en finition, 0,6 en ébauche ; 1 revient au tableau du fournisseur sans plafond. À baisser si la machine manque de rigidité.</div>
      </div>

      <!-- RÉSULTATS -->
      <div id="cp-results" class="cp-results hidden">

        <div class="cp-step-label">4 — Conditions de coupe</div>

        <!-- Cartes résultats principaux -->
        <div class="cp-result-grid">
          <div class="cp-result-card">
            <div class="cp-result-val" id="cp-res-n">—</div>
            <div class="cp-result-unit">tr/min</div>
            <div class="cp-result-name">Broche (n)</div>
          </div>
          <div class="cp-result-card">
            <div class="cp-result-val" id="cp-res-vf">—</div>
            <div class="cp-result-unit">mm/min</div>
            <div class="cp-result-name">Avance XY (vf)</div>
          </div>
          <div class="cp-result-card">
            <div class="cp-result-val" id="cp-res-vfz">—</div>
            <div class="cp-result-unit">mm/min</div>
            <div class="cp-result-name">Avance Z</div>
          </div>
          <div class="cp-result-card">
            <div class="cp-result-val" id="cp-res-ap">—</div>
            <div class="cp-result-unit">mm</div>
            <div class="cp-result-name">Prof. /passe (ap)</div>
          </div>
        </div>

        <!-- Tableau cible vs effectif -->
        <table class="cp-res-table">
          <thead>
            <tr>
              <th></th>
              <th>Cible (sans limite)</th>
              <th>Effectif (machine réelle)</th>
            </tr>
          </thead>
          <tbody>
            <tr class="cp-res-group"><td colspan="3">Vitesse</td></tr>
            <tr>
              <td>Broche (n)</td>
              <td id="cp-tbl-n-theo" class="cp-res-val">—</td>
              <td id="cp-tbl-n"      class="cp-res-val">—</td>
            </tr>
            <tr>
              <td>Vitesse de coupe (vc)</td>
              <td id="cp-tbl-vc-theo" class="cp-res-val">—</td>
              <td id="cp-tbl-vc"      class="cp-res-val">—</td>
            </tr>
            <tr>
              <td>Efficacité de coupe</td>
              <td class="cp-res-val cp-muted">—</td>
              <td id="cp-tbl-eff"    class="cp-res-val">—</td>
            </tr>
            <tr class="cp-res-group"><td colspan="3">Avance</td></tr>
            <tr>
              <td>Avance XY (vf)</td>
              <td id="cp-tbl-vf-theo" class="cp-res-val">—</td>
              <td id="cp-tbl-vf"      class="cp-res-val">—</td>
            </tr>
            <tr>
              <td>Avance Z</td>
              <td id="cp-tbl-vfz-theo" class="cp-res-val">—</td>
              <td id="cp-tbl-vfz"      class="cp-res-val">—</td>
            </tr>
          </tbody>
        </table>

        <!-- Récap paramètres -->
        <div class="cp-res-summary">
          Ø&ensp;<strong id="cp-res-diam">—</strong>&ensp;mm
          &emsp;·&emsp;
          fz&ensp;<strong id="cp-res-fz">—</strong>&ensp;mm/dent
          &emsp;·&emsp;
          Z&ensp;<strong id="cp-res-z">—</strong>&ensp;dents
        </div>

        <div id="cp-warnings"></div>
      </div>

    </div><!-- /cp-body -->

    <div class="cp-footer">
      <button class="btn btn-ghost" id="cp-btn-reset" title="Remettre les valeurs par défaut">↺ Réinitialiser</button>
      <button class="btn btn-secondary cp-btn-cancel">Annuler</button>
      <button class="btn btn-primary" id="cp-btn-apply" disabled>Appliquer</button>
    </div>
  `;

  overlay.appendChild(modal);
  document.body.appendChild(overlay);

  // ── Badges fz / ap live ───────────────────────────────────────────────────
  function updateDefaultBadges() {
    const mat = MATERIALS.find(m => m.id === selMatId);
    const fiche = tool?.cutting[selMatId];                       // valeurs de la fiche fournisseur, si fraise du catalogue
    const vc  = fiche ? fiche.vc : mat?.vc;
    const def = getDefaults(selMatId, selDiam);
    const fz = fiche ? fiche.fz : def.fz;
    const ap = def.ap != null ? Math.min(def.ap, +(maxApK * selDiam).toFixed(2)) : null;   // tableau du fournisseur plafonné par Prof. max
    // Un champ non saisi à la main affiche la valeur calculée
    const auto = { vc, fz: fz != null ? +fz.toFixed(3) : null, ap };
    for (const k of ['vc', 'fz', 'ap'])
      if (!man[k]) modal.querySelector(`#cp-${k}-manual`).value = auto[k] ?? '';
    syncAutoPills();
  }

  // ── Matériaux ─────────────────────────────────────────────────────────────
  const matGrid = modal.querySelector('#cp-mat-grid');
  MATERIALS.filter(m => !tool || tool.cutting[m.id]).forEach(m => {
    const card = document.createElement('button');
    card.className = 'cp-mat-card' + (m.id === selMatId ? ' active' : '');
    card.dataset.id = m.id;
    card.innerHTML = `
      <span class="cp-mat-dot" style="background:${m.color}"></span>
      <span class="cp-mat-name">${m.label}</span>
      <span class="cp-mat-detail">${m.detail}</span>
      <span class="cp-mat-vc">vc ${tool ? tool.cutting[m.id].vc : m.vc} m/min</span>
    `;
    card.addEventListener('click', () => {
      matGrid.querySelectorAll('.cp-mat-card').forEach(c => c.classList.remove('active'));
      card.classList.add('active');
      selMatId = m.id;
      man.vc = false;
      updateDefaultBadges();
      savePrefs();
    });
    matGrid.appendChild(card);
  });

  // ── Diamètres ─────────────────────────────────────────────────────────────
  modal.querySelector('#cp-diam').addEventListener('input', e => {
    const v = Number.parseFloat(e.target.value);
    if (v > 0) { selDiam = v; updateDefaultBadges(); }
  });

  // ── Dents ─────────────────────────────────────────────────────────────────
  modal.querySelector('#cp-flutes-pills').addEventListener('click', e => {
    const btn = e.target.closest('.cp-pill');
    if (!btn) return;
    modal.querySelectorAll('#cp-flutes-pills .cp-pill').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    selFlutes = +btn.dataset.val;
    savePrefs();
  });

  // ── Sliders ───────────────────────────────────────────────────────────────
  const bindSlider = (id, valId, setter) => {
    const sl = modal.querySelector(`#${id}`);
    const lbl = modal.querySelector(`#${valId}`);
    sl.addEventListener('input', () => { lbl.textContent = sl.value; setter(+sl.value); savePrefs(); });
  };
  bindSlider('cp-sl-feed',   'cp-sl-feed-val',   v => maxFeed    = v);
  bindSlider('cp-sl-feedz',  'cp-sl-feedz-val',  v => maxFeedZ   = v);
  bindSlider('cp-sl-spindle','cp-sl-spindle-val', v => maxSpindle = v);
  bindSlider('cp-sl-apk',    'cp-sl-apk-val',    v => { maxApK = v; updateDefaultBadges(); });

  // ── Inputs manuels ────────────────────────────────────────────────────────

  // Pastilles « auto » comme dans le panneau : « ↺ auto » dès qu'une valeur est saisie, un clic revient à la valeur calculée
  function syncAutoPills() {
    modal.querySelectorAll('.cut-state[data-for]').forEach(btn => {
      const manual = man[btn.dataset.for.split('-')[1]];
      btn.classList.toggle('manual', manual);
      btn.textContent = manual ? '↺ auto' : 'auto';
      btn.title = manual ? 'Valeur saisie à la main : cliquer pour revenir à la valeur calculée' : 'Valeur calculée automatiquement';
    });
  }
  modal.querySelectorAll('.cut-state[data-for]').forEach(btn => {
    const input = modal.querySelector('#' + btn.dataset.for);
    const k = btn.dataset.for.split('-')[1];
    const sync = () => {
      manualFz = man.fz ? Number.parseFloat(modal.querySelector('#cp-fz-manual').value) || null : null;
      manualAp = man.ap ? Number.parseFloat(modal.querySelector('#cp-ap-manual').value) || null : null;
      man.fz = manualFz != null; man.ap = manualAp != null;
    };
    input.addEventListener('input', () => {
      man[k] = input.value !== '';                // une saisie passe le champ en manuel, un champ vidé revient à auto
      sync(); updateDefaultBadges();
    });
    btn.addEventListener('click', () => { man[k] = false; sync(); updateDefaultBadges(); btn.blur(); });
  });

  // ── Calcul : refait à chaque modification, les résultats et « Appliquer » sont toujours à jour ──
  function calcNow() {
    const vcManual = man.vc ? Number.parseFloat(modal.querySelector('#cp-vc-manual').value) : Number.NaN;
    const mat      = MATERIALS.find(m => m.id === selMatId);
    const fiche    = tool?.cutting[selMatId];
    const vc       = (vcManual > 0) ? vcManual : (fiche?.vc ?? mat.vc);

    lastResult = { diameter: selDiam, matId: selMatId, flutes: selFlutes, toolRef: tool?.ref ?? '',
      machine: { spindle: maxSpindle, feed: maxFeed, feedZ: maxFeedZ, apK: maxApK },   // limites machine réglées dans la fenêtre
      vcManual: vcManual > 0 ? vcManual : null,                                     // vitesse de coupe cible réglée à la main (gardée par le panneau)
      manual: { feed: manualFz != null, passes: manualAp != null },                 // avance par dent et profondeur réglées à la main
      ...calculate({
      vc, diameter: selDiam, flutes: selFlutes,
      matId: selMatId, maxSpindle, maxFeed, maxFeedZ, maxApK,
      manualFz: manualFz ?? fiche?.fz, manualAp,
    }) };

    const r = lastResult;
    const fmt = n => n.toLocaleString('fr-FR');

    // Cartes principales (valeurs effectifs)
    modal.querySelector('#cp-res-n').textContent   = fmt(r.n);
    modal.querySelector('#cp-res-vf').textContent  = fmt(r.vf);
    modal.querySelector('#cp-res-vfz').textContent = fmt(r.vfZ);
    modal.querySelector('#cp-res-ap').textContent  = r.ap.toFixed(2);

    // Tableau cible / effectif
    modal.querySelector('#cp-tbl-n-theo').textContent   = `${fmt(r.nTheo)} tr/min`;
    modal.querySelector('#cp-tbl-n').textContent        = `${fmt(r.n)} tr/min`;
    modal.querySelector('#cp-tbl-vc-theo').textContent  = `${r.vcTarget} m/min`;
    modal.querySelector('#cp-tbl-vc').textContent       = `${r.vcEff} m/min`;
    modal.querySelector('#cp-tbl-eff').textContent      = `${r.vcPct} %`;
    modal.querySelector('#cp-tbl-vf-theo').textContent  = `${fmt(r.vfTheo)} mm/min`;
    modal.querySelector('#cp-tbl-vf').textContent       = `${fmt(r.vf)} mm/min`;
    modal.querySelector('#cp-tbl-vfz-theo').textContent = `${fmt(r.vfZTarget)} mm/min`;
    modal.querySelector('#cp-tbl-vfz').textContent      = `${fmt(r.vfZ)} mm/min`;

    // Récap paramètres
    modal.querySelector('#cp-res-diam').textContent = selDiam;
    modal.querySelector('#cp-res-fz').textContent   = r.fz.toFixed(3);
    modal.querySelector('#cp-res-z').textContent    = selFlutes;

    // Mise en évidence valeurs plafonnées dans le tableau
    ['#cp-tbl-n','#cp-tbl-vc','#cp-tbl-vf','#cp-tbl-vfz'].forEach(id =>
      modal.querySelector(id).classList.remove('cp-val-limited')
    );
    if (r.nTheo    !== r.n)     modal.querySelector('#cp-tbl-n').classList.add('cp-val-limited');
    if (r.vcTarget !== r.vcEff) modal.querySelector('#cp-tbl-vc').classList.add('cp-val-limited');
    if (r.vfTheo   !== r.vf)    modal.querySelector('#cp-tbl-vf').classList.add('cp-val-limited');
    if (r.vfZTarget !== r.vfZ)  modal.querySelector('#cp-tbl-vfz').classList.add('cp-val-limited');

    const warnDiv = modal.querySelector('#cp-warnings');
    warnDiv.innerHTML = lastResult.warnings.map(w =>
      `<div class="cp-warn cp-warn-${w.level}">${w.text}</div>`
    ).join('');

    modal.querySelector('#cp-results').classList.remove('hidden');
    modal.querySelector('#cp-btn-apply').disabled = false;
  }
  modal.querySelector('.cp-body').addEventListener('input', calcNow);
  modal.querySelector('.cp-body').addEventListener('click', calcNow);   // cartes matière, pastilles dents et auto (après leurs propres gestionnaires)

  // ── Appliquer ─────────────────────────────────────────────────────────────
  modal.querySelector('#cp-btn-apply').addEventListener('click', () => {
    if (lastResult && onApply) onApply(lastResult);
    close();
  });

  // ── Fermeture ─────────────────────────────────────────────────────────────
  function close() { overlay.remove(); }

  // ── Réinitialiser ─────────────────────────────────────────────────────────
  function resetAll() {
    selMatId  = tool ? Object.keys(tool.cutting)[0] : '200';
    selDiam   = toolDiameter > 0 ? toolDiameter : 3.175;
    selFlutes = tool ? tool.flutes : 2;
    manualFz  = null;
    manualAp  = null;
    maxFeed   = 750;        // TTC450 Pro ($110 à $112)
    maxFeedZ  = 750;
    maxSpindle = 12000;
    maxApK    = 0.4;

    // Matériau
    modal.querySelectorAll('.cp-mat-card').forEach(c => c.classList.toggle('active', c.dataset.id === selMatId));
    // Diamètre
    modal.querySelector('#cp-diam').value = selDiam;
    // Dents
    modal.querySelectorAll('#cp-flutes-pills .cp-pill').forEach(b => b.classList.toggle('active', +b.dataset.val === selFlutes));
    // vc, fz, ap : retour aux valeurs calculées
    man.vc = man.fz = man.ap = false;
    // Sliders
    modal.querySelector('#cp-sl-feed').value    = maxFeed;    modal.querySelector('#cp-sl-feed-val').textContent    = maxFeed;
    modal.querySelector('#cp-sl-feedz').value   = maxFeedZ;   modal.querySelector('#cp-sl-feedz-val').textContent   = maxFeedZ;
    modal.querySelector('#cp-sl-spindle').value = maxSpindle; modal.querySelector('#cp-sl-spindle-val').textContent = maxSpindle;
    modal.querySelector('#cp-sl-apk').value     = maxApK;      modal.querySelector('#cp-sl-apk-val').textContent     = maxApK;

    savePrefs();
    updateDefaultBadges();
    calcNow();
  }

  modal.querySelector('#cp-btn-reset').addEventListener('click', resetAll);
  modal.querySelector('.cp-close').addEventListener('click', close);
  modal.querySelector('.cp-btn-cancel').addEventListener('click', close);
  overlay.addEventListener('click', e => { if (e.target === overlay) close(); });

  // Initialisation badges + calcul automatique à l'ouverture
  if (opts.vc > 0) { man.vc = true; modal.querySelector('#cp-vc-manual').value = opts.vc; }   // vitesse de coupe déjà réglée dans le panneau
  updateDefaultBadges();
  calcNow();
}
