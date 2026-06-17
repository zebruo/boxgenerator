import { MATERIALS, DIAMETERS, calculate, getDefaults } from './CuttingParams.js';

/**
 * Ouvre la modale de calcul des paramètres de coupe.
 * @param {number}   toolDiameter  diamètre pré-sélectionné depuis BoxGenerator
 * @param {function} onApply       callback(result) — reçoit le résultat complet de calculate() + diameter
 */
export function showCuttingParamsModal(toolDiameter = 3.175, onApply) {

  // ── État interne ───────────────────────────────────────────────────────────
  const STORAGE_KEY = 'bg-cutting-params';
  const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');

  let selMatId   = saved.matId     ?? '200';
  let selDiam    = DIAMETERS.reduce((a, b) => Math.abs(b - toolDiameter) < Math.abs(a - toolDiameter) ? b : a);
  let selFlutes  = saved.flutes    ?? 2;
  let manualFz   = null;
  let manualAp   = null;
  let maxFeed    = saved.maxFeed    ?? 800;
  let maxFeedZ   = saved.maxFeedZ   ?? 300;
  let maxSpindle = saved.maxSpindle ?? 12000;
  let lastResult = null;

  function savePrefs() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ matId: selMatId, flutes: selFlutes, maxFeed, maxFeedZ, maxSpindle }));
  }

  // ── DOM ───────────────────────────────────────────────────────────────────
  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';

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
          <span class="cp-default-badge" id="cp-vc-badge">—</span>
          <input type="number" id="cp-vc-manual" class="cp-input-sm" min="10" max="1000" step="1"
                 placeholder="Saisie manuelle">
        </div>
      </div>

      <!-- ÉTAPE 2 : Fraise -->
      <div class="cp-step">
        <div class="cp-step-label">2 — Fraise</div>
        <div class="cp-row-label">Diamètre (mm)</div>
        <div class="cp-pills" id="cp-diam-pills"></div>
        <div class="cp-row-label" style="margin-top:8px">Nombre de dents</div>
        <div class="cp-pills" id="cp-flutes-pills">
          ${[1,2,3,4].map(n => `<button class="cp-pill${n===selFlutes?' active':''}" data-val="${n}">${n}</button>`).join('')}
        </div>
        <div class="cp-defaults-row" style="margin-top:10px">
          <div class="cp-default-item">
            <span class="cp-muted">fz (mm/dent)</span>
            <span class="cp-default-badge" id="cp-fz-badge">—</span>
            <input type="number" id="cp-fz-manual" class="cp-input-sm" min="0.001" max="1" step="0.001" placeholder="Saisie manuelle">
          </div>
          <div class="cp-default-item">
            <span class="cp-muted">ap (mm)</span>
            <span class="cp-default-badge" id="cp-ap-badge">—</span>
            <input type="number" id="cp-ap-manual" class="cp-input-sm" min="0.1" max="50" step="0.1" placeholder="Saisie manuelle">
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
      <button class="btn btn-secondary cp-btn-cancel">Annuler</button>
      <button class="btn btn-ghost" id="cp-btn-reset" title="Remettre les valeurs par défaut">↺ Réinitialiser</button>
      <button class="btn btn-secondary" id="cp-btn-calc">Calculer</button>
      <button class="btn btn-primary" id="cp-btn-apply" disabled>Appliquer</button>
    </div>
  `;

  overlay.appendChild(modal);
  document.body.appendChild(overlay);

  // ── Badges fz / ap live ───────────────────────────────────────────────────
  function updateDefaultBadges() {
    const mat = MATERIALS.find(m => m.id === selMatId);
    modal.querySelector('#cp-vc-badge').textContent = mat ? mat.vc : '—';
    const { fz, ap } = getDefaults(selMatId, selDiam);
    modal.querySelector('#cp-fz-badge').textContent = fz != null ? fz.toFixed(3) : '—';
    modal.querySelector('#cp-ap-badge').textContent = ap != null ? ap            : '—';
  }

  // ── Matériaux ─────────────────────────────────────────────────────────────
  const matGrid = modal.querySelector('#cp-mat-grid');
  MATERIALS.forEach(m => {
    const card = document.createElement('button');
    card.className = 'cp-mat-card' + (m.id === selMatId ? ' active' : '');
    card.dataset.id = m.id;
    card.innerHTML = `
      <span class="cp-mat-dot" style="background:${m.color}"></span>
      <span class="cp-mat-name">${m.label}</span>
      <span class="cp-mat-detail">${m.detail}</span>
      <span class="cp-mat-vc">vc ${m.vc} m/min</span>
    `;
    card.addEventListener('click', () => {
      matGrid.querySelectorAll('.cp-mat-card').forEach(c => c.classList.remove('active'));
      card.classList.add('active');
      selMatId = m.id;
      modal.querySelector('#cp-vc-manual').value = '';
      updateDefaultBadges();
      savePrefs();
    });
    matGrid.appendChild(card);
  });

  // ── Diamètres ─────────────────────────────────────────────────────────────
  const diamPills = modal.querySelector('#cp-diam-pills');
  DIAMETERS.forEach(d => {
    const btn = document.createElement('button');
    btn.className = 'cp-pill' + (d === selDiam ? ' active' : '');
    btn.textContent = d;
    btn.addEventListener('click', () => {
      diamPills.querySelectorAll('.cp-pill').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      selDiam = d;
      updateDefaultBadges();
    });
    diamPills.appendChild(btn);
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

  // ── Inputs manuels ────────────────────────────────────────────────────────
  modal.querySelector('#cp-fz-manual').addEventListener('input', e => { manualFz = parseFloat(e.target.value) || null; });
  modal.querySelector('#cp-ap-manual').addEventListener('input', e => { manualAp = parseFloat(e.target.value) || null; });

  // ── Calculer ──────────────────────────────────────────────────────────────
  modal.querySelector('#cp-btn-calc').addEventListener('click', () => {
    const vcManual = parseFloat(modal.querySelector('#cp-vc-manual').value);
    const mat      = MATERIALS.find(m => m.id === selMatId);
    const vc       = (vcManual > 0) ? vcManual : mat.vc;

    lastResult = { diameter: selDiam, ...calculate({
      vc, diameter: selDiam, flutes: selFlutes,
      matId: selMatId, maxSpindle, maxFeed, maxFeedZ,
      manualFz, manualAp,
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
  });

  // ── Appliquer ─────────────────────────────────────────────────────────────
  modal.querySelector('#cp-btn-apply').addEventListener('click', () => {
    if (lastResult && onApply) onApply(lastResult);
    close();
  });

  // ── Fermeture ─────────────────────────────────────────────────────────────
  function close() { overlay.remove(); }
  function resetResults() {
    modal.querySelector('#cp-results').classList.add('hidden');
    modal.querySelector('#cp-btn-apply').disabled = true;
    lastResult = null;
  }

  // ── Réinitialiser ─────────────────────────────────────────────────────────
  function resetAll() {
    selMatId  = '200';
    selDiam   = DIAMETERS.reduce((a, b) => Math.abs(b - toolDiameter) < Math.abs(a - toolDiameter) ? b : a);
    selFlutes = 2;
    manualFz  = null;
    manualAp  = null;
    maxFeed   = 800;
    maxFeedZ  = 300;
    maxSpindle = 12000;

    // Matériau
    modal.querySelectorAll('.cp-mat-card').forEach(c => c.classList.toggle('active', c.dataset.id === selMatId));
    // Diamètre
    modal.querySelectorAll('#cp-diam-pills .cp-pill').forEach(b => b.classList.toggle('active', +b.textContent === selDiam));
    // Dents
    modal.querySelectorAll('#cp-flutes-pills .cp-pill').forEach(b => b.classList.toggle('active', +b.dataset.val === selFlutes));
    // Vc manuel
    modal.querySelector('#cp-vc-manual').value = '';
    // fz / ap manuels
    modal.querySelector('#cp-fz-manual').value = '';
    modal.querySelector('#cp-ap-manual').value = '';
    // Sliders
    modal.querySelector('#cp-sl-feed').value    = maxFeed;    modal.querySelector('#cp-sl-feed-val').textContent    = maxFeed;
    modal.querySelector('#cp-sl-feedz').value   = maxFeedZ;   modal.querySelector('#cp-sl-feedz-val').textContent   = maxFeedZ;
    modal.querySelector('#cp-sl-spindle').value = maxSpindle; modal.querySelector('#cp-sl-spindle-val').textContent = maxSpindle;

    savePrefs();
    updateDefaultBadges();
    resetResults();
    modal.querySelector('#cp-btn-calc').click();
  }

  modal.querySelector('#cp-btn-reset').addEventListener('click', resetAll);
  modal.querySelector('.cp-close').addEventListener('click', close);
  modal.querySelector('.cp-btn-cancel').addEventListener('click', close);
  overlay.addEventListener('click', e => { if (e.target === overlay) close(); });

  // Initialisation badges + calcul automatique à l'ouverture
  updateDefaultBadges();
  modal.querySelector('#cp-btn-calc').click();
}
