// ─── Imports ──────────────────────────────────────────────────────────────
import { t, setLang, currentLang } from './modules/i18n.js';
import { ThreePreview }   from './modules/preview/ThreePreview.js';
import { TechnicalView }  from './modules/preview/TechnicalView.js';
import { buildFabricationSVG } from './modules/export/SvgExport.js';
import { stockHeaderLines, autoTabFractions } from './modules/gcode/GCodeGenerator.js';
import { contourLengths } from './modules/gcode/TabPositions.js';
import { partitionSizes } from './modules/gcode/PartitionedPocket.js';
import { Rectangle }      from './modules/shapes/Rectangle.js';
import { Circle }         from './modules/shapes/Circle.js';
import { Oval }           from './modules/shapes/Oval.js';
import { Polygon }        from './modules/shapes/Polygon.js';
import { Bean }           from './modules/shapes/Bean.js';
import { OpenTray }       from './modules/boxes/OpenTray.js';
import { FingerJointBox } from './modules/boxes/FingerJointBox.js';
import { LidBox, lidPartitionThickness, lidGapOf } from './modules/boxes/LidBox.js';
import { StackableBox }   from './modules/boxes/StackableBox.js';
import { showHelpModal }         from './modules/HelpModal.js';
import { showCuttingParamsModal } from './modules/CuttingParamsModal.js';
import { WARN, LIMITS } from './modules/Thresholds.js';
import { initCuttingPanel } from './modules/CuttingPanel.js';
import { rampAngleFor, entryModeFor } from './modules/CuttingParams.js';

// ─── Tooltip global (réutilisé dans les modales) ────────────────────────────
let _tipEl  = null;
let _tipTmr = null;

/** Attache un tooltip custom sur un élément avec un texte donné (string ou fonction). */
function attachTooltip(el, text, delayMs = 500) {
  if (!_tipEl) {
    _tipEl = document.getElementById('param-tooltip') || (() => {
      const d = document.createElement('div');
      d.id = 'param-tooltip';
      document.body.appendChild(d);
      return d;
    })();
  }
  el.removeAttribute('title'); // désactive le tooltip natif du navigateur
  el.addEventListener('mouseenter', () => {
    _tipTmr = setTimeout(() => {
      _tipEl.textContent = typeof text === 'function' ? text() : text;
      _tipEl.classList.add('visible');
      const r = el.getBoundingClientRect();
      _tipEl.style.left = Math.min(r.left, window.innerWidth - _tipEl.offsetWidth - 8) + 'px';
      _tipEl.style.top  = (r.top - _tipEl.offsetHeight - 6) + 'px';
    }, delayMs);
  });
  el.addEventListener('mouseleave', () => {
    clearTimeout(_tipTmr);
    _tipEl.classList.remove('visible');
  });
}

// ─── Registres ─────────────────────────────────────────────────────────────
const SHAPES = {
  rectangle: Rectangle,
  circle:    Circle,
  oval:      Oval,
  polygon:   Polygon,
  bean:      Bean
};

const BOX_TYPES = {
  'open-tray':    OpenTray,
  'finger-joint': FingerJointBox,
  'lid-box':      LidBox,
  'stackable':    StackableBox
};

// ─── State ─────────────────────────────────────────────────────────────────
const state = {
  shapeKey:   'rectangle',
  boxTypeKey: 'open-tray',
  shape:      null,
  boxType:    null,
  boxParams:  { height: 30, wallThickness: 6 },
  view:       '3d', // '3d' | 'tech'
  exportOpts: null  // options de la fenêtre d'export (initialisées après EXPORT_OPTS_DEFAULT)
};
let cuttingPanel = null;   // réglages de coupe du panneau « Matière & Outil » (voir CuttingPanel.js)

let threePreview   = null;  // instancié à la première ouverture de la vue 3D
let technicalView  = null;  // instancié à la première ouverture de la vue technique

// ─── DOM refs ──────────────────────────────────────────────────────────────
const canvas2d    = document.getElementById('canvas-2d');  // Three.js 3D (WebGL)
const canvas3d    = document.getElementById('canvas-3d');  // TechnicalView 2D
const paramsContainer = document.getElementById('params-container');
const gcodeOutput = document.getElementById('gcode-output');
const gcodeStats  = document.getElementById('gcode-stats');
const infoDims    = document.getElementById('info-dims');
const infoArea    = document.getElementById('info-area');
const infoSheet   = document.getElementById('info-sheet');

// ─── Thème jour/nuit ────────────────────────────────────────────────────────
function applyTheme(light) {
  document.documentElement.dataset.theme = light ? 'light' : 'dark';
  const toggle = document.getElementById('theme-toggle');
  if (toggle) toggle.checked = light;
  localStorage.setItem('theme', light ? 'light' : 'dark');
  if (threePreview)   threePreview.setTheme(light);
  if (technicalView)  technicalView.setTheme(light);
}

// ─── Barres d'outils : boutons à état, fenêtres Z0 / Brut ───────────────────
// Un seul bouton actif parmi ceux du sélecteur (classe .active pour le style, aria-pressed pour l'accessibilité)
function setPressed(selector, active) {
  document.querySelectorAll(selector).forEach(b => {
    b.classList.toggle('active', b === active);
    b.setAttribute('aria-pressed', String(b === active));
  });
}

const TOOLBAR_POPS = [['btn-z0', 'pop-z0'], ['btn-stock', 'pop-stock'], ['btn-tabs', 'pop-tabs']];

function closeToolbarPops() {
  for (const [b, p] of TOOLBAR_POPS) {
    document.getElementById(p).hidden = true;
    document.getElementById(b).setAttribute('aria-expanded', 'false');
  }
}

// Fenêtre sous son bouton, sans sortir de l'écran
function placeToolbarPop(btn, pop) {
  const r = btn.getBoundingClientRect();
  pop.style.top  = `${r.bottom + 6}px`;
  pop.style.left = `${Math.max(8, Math.min(r.left, window.innerWidth - pop.offsetWidth - 8))}px`;
}

function initToolbarPopovers() {
  for (const [b, p] of TOOLBAR_POPS) {
    const btn = document.getElementById(b), pop = document.getElementById(p);
    btn.addEventListener('click', e => {
      e.stopPropagation();
      const wasClosed = pop.hidden;
      closeToolbarPops();
      if (!wasClosed) return;
      pop.hidden = false;
      btn.setAttribute('aria-expanded', 'true');
      placeToolbarPop(btn, pop);
    });
  }
  document.addEventListener('click', e => { if (!e.target.closest('.tb-pop')) closeToolbarPops(); });
  document.addEventListener('keydown', e => { if (e.key === 'Escape') closeToolbarPops(); });
  // Fenêtre redimensionnée : la barre se réorganise, la fenêtre ouverte suit son bouton
  window.addEventListener('resize', () => {
    for (const [b, p] of TOOLBAR_POPS) {
      const pop = document.getElementById(p);
      if (!pop.hidden) placeToolbarPop(document.getElementById(b), pop);
    }
  });
}

// Résumé de l'état sur les boutons Z0 et Brut (lisible sans ouvrir la fenêtre)
function updateToolbarSummaries() {
  syncMachiningUI();   // rappel des tabs de l'onglet « Stratégie »
  const z0 = getZ0Settings();
  const zs = document.getElementById('z0-summary');
  if (zs) zs.textContent = `${t(`tip.z0_${z0.pos.replace('-', '_')}`)} · ${t(z0.level === 'top' ? 'ui.z0_top_short' : 'ui.z0_bottom_short')}`;
  const ss = document.getElementById('stock-summary');
  if (ss) {
    const so = stockOffsets(), f = v => +v.toFixed(1);
    ss.textContent = so.two ? `+${f(so.body)} / +${f(so.lid)} mm` : `+${f(so.body)} mm`;
  }
  const ts = document.getElementById('tabs-summary');
  if (ts) {
    const o = state.exportOpts;
    const n = manualTabsActive() ? o.tabsManual.length : o.tabCount;
    ts.textContent = o.tabsOn
      ? `${n} × ${String(o.tabWidth).replace('.', ',')} mm`
      : t('ui.tabs_none');
  }
}

/** Fenêtre « Tabs » : champs remplis depuis les options mémorisées (au démarrage, à l'ouverture d'une session). */
function syncTabsUI() {
  const o = state.exportOpts;
  const on = document.getElementById('tabs-on');
  if (!on) return;
  on.checked = !!o.tabsOn;
  document.getElementById('tab-count').value  = o.tabCount;
  document.getElementById('tab-width').value  = o.tabWidth;
  document.getElementById('tab-height').value = o.tabHeight;
  document.getElementById('tabs-fields').classList.toggle('disabled', !o.tabsOn);
  // Placement à la main : le nombre vient des tabs placés ; boîte à encoches : automatique seulement
  const manual = manualTabsActive(), fj = state.boxTypeKey === 'finger-joint';
  document.getElementById('tab-count').disabled = manual;
  if (manual) document.getElementById('tab-count').value = o.tabsManual.length;
  document.getElementById('tabs-place-status').textContent = fj ? t('ui.tabs_status_fj')
    : manual ? t('ui.tabs_status_manual', { n: o.tabsManual.length }) : t('ui.tabs_status_auto');
  document.getElementById('tabs-place-hand').disabled = fj || !o.tabsOn;
  // Pastille comme dans le panneau de gauche : « auto » grisé, « ↺ auto » quand les tabs sont placés à la main (clic : retour à l'auto)
  const pill = document.getElementById('tabs-place-auto');
  pill.classList.toggle('manual', manual);
  pill.textContent = t(manual ? 'cut.reset' : 'cut.auto');
  pill.title = t(manual ? 'ui.tabs_auto_tip_manual' : 'ui.tabs_auto_tip_auto');
}

// ── Placement des tabs à la main (vue 2D) ─────────────────────────────────────
let tabEditBar = null;

/** Réglages du mode d'édition de la vue 2D pour des tabs de départ donnés. */
function tabEditConfig(fractions) {
  return {
    fractions,
    tabWidth: state.exportOpts.tabWidth,
    onChange: fr => {
      // Positions identiques à la répartition automatique : on reste en « auto » (pas de flèche ↺)
      saveExportOpts({ ...state.exportOpts, tabsManual: sameAsAuto(fr) ? null : fr });
      syncTabsUI();
      updateToolbarSummaries();
      updateTabEditBar();
    },
  };
}

/** Pastille « ↺ auto » du bandeau : les tabs reprennent leur répartition automatique, on reste dans la vue de placement. */
function resetTabsInEdit() {
  if (!manualTabsActive()) return;
  saveExportOpts({ ...state.exportOpts, tabsManual: null });
  technicalView?.setTabEdit(tabEditConfig(autoTabsFor(state.exportOpts.tabCount)));
  syncTabsUI();
  updateToolbarSummaries();
  updateTabEditBar();
}

/** Répartition automatique de `n` tabs sur le contour de la forme (fractions du périmètre). */
function autoTabsFor(n) {
  const o = state.exportOpts, td = getMachineParams().toolDiameter ?? 3.175;
  return autoTabFractions(state.shape.getContourPoints(), n, o.tabWidth + td);
}

/** Les positions données sont celles de la répartition automatique (à 0,5 mm près sur le contour) ? */
function sameAsAuto(fractions) {
  const auto = autoTabsFor(fractions.length).sort((a, b) => a - b);
  const mine = [...fractions].sort((a, b) => a - b);
  const { P } = contourLengths(state.shape.getContourPoints());
  const tol = 0.5 / (P || 1);
  return auto.length === mine.length && auto.every((f, i) => Math.abs(f - mine[i]) < tol);
}

function startTabEdit() {
  if (!state.shape || state.boxTypeKey === 'finger-joint') return;
  closeToolbarPops();
  const o = state.exportOpts;
  // Point de départ : les tabs déjà placés, sinon la répartition automatique actuelle (rien n'est
  // enregistré tant que rien n'est déplacé : la pastille reste sur « auto »)
  const start = manualTabsActive() ? o.tabsManual : autoTabsFor(o.tabCount);
  if (!o.tabsOn) saveExportOpts({ ...o, tabsOn: true });
  if (state.view !== 'tech') document.querySelector('.view-btn[data-view="tech"]').click();
  if (!technicalView) return;
  technicalView.setTabEdit(tabEditConfig(start));
  if (!tabEditBar) {
    tabEditBar = document.createElement('div');
    tabEditBar.className = 'tab-edit-bar';
    tabEditBar.innerHTML = '<span id="tab-edit-count"></span>'
      + '<button type="button" class="cut-state" id="tab-edit-auto"></button>'
      + '<button class="btn btn-secondary" id="tab-edit-done"></button>';
    document.querySelector('.preview-area').appendChild(tabEditBar);
    tabEditBar.querySelector('#tab-edit-auto').addEventListener('click', resetTabsInEdit);
    tabEditBar.querySelector('#tab-edit-done').addEventListener('click', finishTabEdit);
  }
  tabEditBar.hidden = false;
  updateTabEditBar();
  syncTabsUI();
  updateToolbarSummaries();
}

function updateTabEditBar() {
  if (!tabEditBar) return;
  const manual = manualTabsActive();
  const n = technicalView?.tabEdit?.fractions.length ?? 0;
  tabEditBar.querySelector('#tab-edit-count').textContent = t(manual ? 'ui.tabs_status_manual' : 'ui.tabs_edit_auto', { n });
  const pill = tabEditBar.querySelector('#tab-edit-auto');
  pill.classList.toggle('manual', manual);
  pill.textContent = t(manual ? 'cut.reset' : 'cut.auto');
  pill.title = t(manual ? 'ui.tabs_auto_tip_manual' : 'ui.tabs_auto_tip_auto');
  tabEditBar.querySelector('#tab-edit-done').textContent = t('ui.tabs_edit_done');
}

/** « Terminer » / Échap : sortie du placement et retour à la vue 3D (le bouton de vue arrête l'édition). */
function finishTabEdit() {
  document.querySelector('.view-btn[data-view="3d"]').click();
}

function stopTabEdit() {
  if (technicalView?.tabEdit) technicalView.setTabEdit(null);
  if (tabEditBar) tabEditBar.hidden = true;
}

/** Répartition automatique : les tabs placés à la main sont oubliés (sans effet s'ils sont déjà automatiques). */
function resetTabsAuto() {
  if (!manualTabsActive()) return;
  saveExportOpts({ ...state.exportOpts, tabsManual: null });
  stopTabEdit();
  syncTabsUI();
  updateToolbarSummaries();
  updatePreview();
}

/** Tabs réglés dans la fenêtre « Tabs » : mémorisés (session et réglages par défaut). */
function bindTabsUI() {
  const read = () => {
    const fin = (v, def) => (Number.isFinite(v) && v > 0 ? v : def);
    const o = state.exportOpts;
    saveExportOpts({
      ...o,
      tabsOn:    document.getElementById('tabs-on').checked,
      tabCount:  Math.round(fin(Number.parseFloat(document.getElementById('tab-count').value), o.tabCount)),
      tabWidth:  fin(Number.parseFloat(document.getElementById('tab-width').value), o.tabWidth),
      tabHeight: fin(Number.parseFloat(document.getElementById('tab-height').value), o.tabHeight),
    });
    document.getElementById('tabs-fields').classList.toggle('disabled', !state.exportOpts.tabsOn);
    updateToolbarSummaries();
  };
  for (const id of ['tabs-on', 'tab-count', 'tab-width', 'tab-height']) {
    document.getElementById(id).addEventListener('input', read);
    document.getElementById(id).addEventListener('change', read);
  }
  document.getElementById('tabs-place-hand').addEventListener('click', startTabEdit);
  document.getElementById('tabs-place-auto').addEventListener('click', resetTabsAuto);
  document.addEventListener('keydown', e => { if (e.key === 'Escape' && technicalView?.tabEdit) finishTabEdit(); });
  syncTabsUI();
}

// ── Onglet « Stratégie » du panneau de gauche : entrée outil, lead-in, finition, poche ──
/** Boutons segmentés : bouton actif selon la valeur. */
function setSeg(id, v) {
  document.querySelectorAll(`#${id} > button`).forEach(b => {
    b.classList.toggle('active', b.dataset.v === v);
    b.setAttribute('aria-pressed', String(b.dataset.v === v));
  });
}

/** Rappel des tabs (réglés dans la barre Usinage), comme dans la fenêtre d'export. */
function tabsSummaryText() {
  const o = state.exportOpts;
  if (!o.tabsOn) return t('modal.tabs_off');
  const manual = manualTabsActive();
  return t(manual ? 'modal.tabs_summary_manual' : 'modal.tabs_summary',
    { n: manual ? o.tabsManual.length : o.tabCount, w: String(o.tabWidth).replace('.', ','), h: String(o.tabHeight).replace('.', ',') });
}

/** Onglet « Stratégie » rempli depuis les options mémorisées ; les valeurs par défaut suivent le ⌀ de la fraise. */
function syncMachiningUI() {
  if (!document.getElementById('mach-entry')) return;
  const o = state.exportOpts;
  const d = exportToolDefaults(getMachineParams().toolDiameter || 3.175);
  const $ = id => document.getElementById(id);
  const val = (id, v) => { if (document.activeElement !== $(id)) $(id).value = v; };
  // Pastilles « auto / ↺ auto » : mode selon la matière, longueurs et rayons selon le ⌀ de la fraise
  const pill = (id, manual, tipKey) => {
    const b = $(id);
    b.classList.toggle('manual', manual);
    b.textContent = t(manual ? 'cut.reset' : 'cut.auto');
    b.title = t(`${tipKey}_${manual ? 'manual' : 'auto'}`);
    b.disabled = !manual;
  };
  pill('mach-state-entry', !o.entryAuto, 'ui.mach_entry');
  pill('mach-state-ramp', o.rampLen != null, 'ui.mach_size');
  pill('mach-state-helix', o.helixR != null, 'ui.mach_size');
  pill('mach-state-leadin', o.leadInR != null, 'ui.mach_size');
  const entry = currentEntryMode();
  setSeg('mach-entry', entry);
  setSeg('mach-pocket', o.pocketConc ? 'conc' : 'raster');
  val('mach-ramp-len', o.rampLen ?? d.ramp);
  val('mach-helix-r', o.helixR ?? d.helixR);
  val('mach-helix-turns', o.helixTurns);
  val('mach-leadin-r', o.leadInR ?? d.leadR);
  val('mach-finish', o.finishAllowance);
  $('mach-leadin-on').checked = !!o.leadInOn;
  $('mach-finish-on').checked = !!o.finishOn;
  $('mach-row-ramp').hidden = entry !== 'ramp';
  $('mach-row-helix-r').hidden = $('mach-row-helix-t').hidden = entry !== 'helix';
  $('mach-leadin-r').disabled = !o.leadInOn;
  $('mach-finish').disabled = !o.finishOn;
  $('mach-tabs-note').textContent = tabsSummaryText();
}

/** Onglet « Stratégie » : chaque réglage est mémorisé (session et réglages par défaut). */
function bindMachiningUI() {
  const $ = id => document.getElementById(id);
  const save = patch => { saveExportOpts({ ...state.exportOpts, ...patch }); syncMachiningUI(); };
  const read = () => {
    const d = exportToolDefaults(getMachineParams().toolDiameter || 3.175);
    const num = id => Number.parseFloat($(id).value);
    // null = valeur par défaut calculée depuis le diamètre d'outil (suit un changement de fraise)
    const orDefault = (v, def, cur) => (Number.isFinite(v) && v > 0 ? (Math.abs(v - def) > 1e-9 ? v : null) : cur);
    const fin = (v, cur) => (Number.isFinite(v) && v > 0 ? v : cur);
    const o = state.exportOpts;
    save({
      rampLen:         orDefault(num('mach-ramp-len'), d.ramp, o.rampLen),
      helixR:          orDefault(num('mach-helix-r'), d.helixR, o.helixR),
      helixTurns:      Math.round(fin(num('mach-helix-turns'), o.helixTurns)),
      leadInOn:        $('mach-leadin-on').checked,
      leadInR:         orDefault(num('mach-leadin-r'), d.leadR, o.leadInR),
      finishOn:        $('mach-finish-on').checked,
      finishAllowance: fin(num('mach-finish'), o.finishAllowance),
    });
  };
  for (const id of ['mach-ramp-len', 'mach-helix-r', 'mach-helix-turns', 'mach-leadin-on', 'mach-leadin-r', 'mach-finish-on', 'mach-finish']) {
    $(id).addEventListener('input', read);
    $(id).addEventListener('change', read);
  }
  // Un mode cliqué devient un choix à la main ; la pastille revient au mode proposé selon la matière
  // (cliquer le mode proposé reste en auto, comme une valeur saisie égale au calcul)
  document.querySelectorAll('#mach-entry > button').forEach(b => b.addEventListener('click', () => save({
    entry: b.dataset.v, entryAuto: b.dataset.v === entryModeFor(document.getElementById('param-material').value),
  })));
  const reset = (id, patch) => $(id).addEventListener('click', e => { save(patch); e.currentTarget.blur(); });
  reset('mach-state-entry', { entryAuto: true });
  reset('mach-state-ramp', { rampLen: null });
  reset('mach-state-helix', { helixR: null });
  reset('mach-state-leadin', { leadInR: null });
  document.querySelectorAll('#mach-pocket > button').forEach(b => b.addEventListener('click', () => save({ pocketConc: b.dataset.v === 'conc' })));
  // Infobulles : les valeurs par défaut citées suivent le ⌀ de la fraise
  const tipVal = { 'modal.tip_ramp_len': td => (td * 2).toFixed(1), 'modal.tip_helix_r': td => (td * 0.6).toFixed(2),
    'modal.tip_leadin_r': td => (td * 0.4).toFixed(2) };
  document.querySelectorAll('#ppane-mach [data-mtip]').forEach(el => {
    const key = el.dataset.mtip;
    attachTooltip(el, () => t(key, { val: tipVal[key]?.(getMachineParams().toolDiameter || 3.175) }), 600);
  });
  syncMachiningUI();
}

/** Affiche l'onglet `pane` ('cut' : Matière & Outil, 'mach' : Stratégie). */
function showPanelTab(pane) {
  document.querySelectorAll('.panel-tab').forEach(b => {
    const on = b.dataset.pane === pane;
    b.classList.toggle('active', on);
    b.setAttribute('aria-selected', String(on));
    document.getElementById(`ppane-${b.dataset.pane}`).hidden = !on;
  });
  if (pane === 'mach') syncMachiningUI();
  updatePanelTabWarn();
}

/** Point orange sur « Matière & Outil » quand un avertissement s'y affiche alors que l'onglet est caché. */
function updatePanelTabWarn() {
  const pane = document.getElementById('ppane-cut'), tab = document.getElementById('ptab-cut');
  if (!pane || !tab) return;
  const warn = pane.hidden && !!pane.querySelector('.cut-note.warn, .input-warn');
  tab.classList.toggle('has-warn', warn);
  tab.title = warn ? t('ui.tab_warn') : '';
}

/** Onglets « Matière & Outil » / « Stratégie » : ouverture sur « Matière & Outil » (où s'affichent les
 *  avertissements de coupe), au démarrage comme à l'ouverture d'une session. */
function bindPanelTabs() {
  document.querySelectorAll('.panel-tab').forEach(b => b.addEventListener('click', () => showPanelTab(b.dataset.pane)));
  // Avertissements de l'onglet : notes orange et champs en avertissement, quel que soit le code qui les pose
  const pane = document.getElementById('ppane-cut');
  new MutationObserver(updatePanelTabWarn).observe(pane, { subtree: true, childList: true, attributes: true, attributeFilter: ['class'] });
  showPanelTab('cut');
}

// ─── i18n — mise à jour des éléments statiques du DOM ──────────────────────
function updateI18n() {
  document.querySelectorAll('[data-i18n]').forEach(el => {
    el.textContent = t(el.dataset.i18n);
  });
  document.querySelectorAll('[data-i18n-title]').forEach(el => {
    el.title = t(el.dataset.i18nTitle);
  });
  document.querySelectorAll('[data-i18n-aria]').forEach(el => {
    el.setAttribute('aria-label', t(el.dataset.i18nAria));
  });
  // Sync le sélecteur de langue avec la langue courante
  const switcher = document.getElementById('lang-switcher');
  if (switcher) switcher.value = currentLang();
  updateToolbarSummaries();
  cuttingPanel?.refresh();
}

// ─── Init ──────────────────────────────────────────────────────────────────
function init() {
  applyTheme(localStorage.getItem('theme') !== 'dark');
  selectShape('rectangle');
  selectBoxType('open-tray');
  bindEvents();
  initToolbarPopovers();
  bindTabsUI();
  bindMachiningUI();
  bindPanelTabs();
  updateI18n();
  resizeCanvases();
  updatePreview();
  const v = window.electronAPI?.version;
  if (v) { appTitle = `Box Generator - CNC v${v}`; showSessionName(sessionName); }
  blankSnapshot = sessionSnapshot();   // session sans fichier : sert à savoir si elle a été modifiée
}

function bindEvents() {
  // Shape buttons
  document.querySelectorAll('.shape-btn').forEach(btn => {
    btn.addEventListener('click', () => selectShape(btn.dataset.shape));
  });

  // Box type buttons
  document.querySelectorAll('.box-type-btn').forEach(btn => {
    btn.addEventListener('click', () => selectBoxType(btn.dataset.type));
  });

  // View toggle
  document.querySelectorAll('.view-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      setPressed('.view-btn', btn);
      state.view = btn.dataset.view;
      if (state.view !== 'tech') stopTabEdit();
      canvas2d.classList.toggle('hidden', state.view !== '3d');
      canvas3d.classList.toggle('hidden', state.view !== 'tech');
      document.getElementById('toolbar-3d').classList.toggle('hidden', state.view !== '3d');
      closeToolbarPops();
      updateBoxNameOverlay();
      updatePreview();
    });
  });

  // Z0 position (XY)
  document.querySelectorAll('.z0-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      setPressed('.z0-btn', btn);
      updateToolbarSummaries();
      if (threePreview) { threePreview.z0Pos = btn.dataset.pos; updatePreview(); }
    });
  });

  // Z0 niveau (bas / haut)
  document.querySelectorAll('.z0-lvl-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      setPressed('.z0-lvl-btn', btn);
      updateToolbarSummaries();
      if (threePreview) { threePreview.z0Level = btn.dataset.level; updatePreview(); }
    });
  });

  // Boîte à couvercle : à plat (comme usinée) / assemblée
  document.querySelectorAll('.lid-layout-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      setPressed('.lid-layout-btn', btn);
      if (threePreview) { threePreview.lidLayout = btn.dataset.layout; updatePreview(); }
    });
  });

  // Mode X-Ray
  document.getElementById('xray-toggle').addEventListener('change', e => {
    if (threePreview) threePreview.setXRay(e.target.checked);
  });

  // Offset brut
  for (const id of ['stock-offset', 'stock-offset-lid']) document.getElementById(id).addEventListener('input', () => {
    updateToolbarSummaries();
    updatePreview();
  });

  // Écart entre corps et couvercle (deux planches)
  document.getElementById('lid-gap').addEventListener('input', e => {
    const v = Number.parseFloat(e.target.value);
    if (!(v >= 5)) return;                     // saisie en cours (« 2 » de « 25 ») ou valeur trop faible
    state.boxParams.lidGap = v;
    updatePreview();
  });

  // Côté offset brut (haut / bas)
  document.querySelectorAll('.stock-side-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      setPressed('.stock-side-btn', btn);
      if (threePreview) { threePreview.stockSide = btn.dataset.side; updatePreview(); }
    });
  });

  // Generate G-code
  document.getElementById('btn-generate').addEventListener('click', generateGCode);

  // Simulation d'usinage (fichier exporté, avec les options d'export mémorisées)
  document.getElementById('btn-simulate').addEventListener('click', () => {
    openSimulation().catch(err => { console.error(err); showNotif(`Simulation : ${err.message}`); });
  });

  // Session save / load (une erreur inattendue est affichée au lieu d'être perdue)
  const sessionError = err => { console.error(err); showNotif(t('notif.session_failed', { error: err.message })); };
  document.getElementById('btn-save-session').addEventListener('click', e => saveSession(e.shiftKey).catch(sessionError));   // Maj+clic : Enregistrer sous
  document.getElementById('btn-load-session').addEventListener('click', () => loadSession().catch(sessionError));
  document.getElementById('btn-new-session').addEventListener('click', () => newSession().catch(sessionError));
  document.getElementById('btn-save-as-session').addEventListener('click', () => saveSession(true).catch(sessionError));
  // Raccourcis : Ctrl+S enregistrer, Ctrl+Maj+S enregistrer sous, Ctrl+O ouvrir, Ctrl+N nouvelle session
  document.addEventListener('keydown', e => {
    if (!(e.ctrlKey || e.metaKey) || e.altKey) return;
    const k = e.key.toLowerCase();
    if (k === 's') { e.preventDefault(); saveSession(e.shiftKey).catch(sessionError); }
    else if (k === 'o' && !e.shiftKey) { e.preventDefault(); loadSession().catch(sessionError); }
    else if (k === 'n' && !e.shiftKey) { e.preventDefault(); newSession().catch(sessionError); }
  });

  // Export G-code
  document.getElementById('btn-export-gcode').addEventListener('click', exportGCode);

  // Export SVG
  document.getElementById('btn-export-svg').addEventListener('click', exportSVG);

  // Aide export G-code
  document.getElementById('btn-gcode-help').addEventListener('click', () => showHelpModal(getMachineParams()));

  // Calcul paramètres de coupe
  document.getElementById('btn-cutting-params').addEventListener('click', () => {
    const td = Number.parseFloat(document.getElementById('param-tool-diameter').value) || 3.175;
    showCuttingParamsModal(td, result => cuttingPanel.applyDetails(result), cuttingPanel.modalOptions());
  });

  // Bouton paramètres ⚙ — ouvre/ferme le panel
  const btnSettings  = document.getElementById('btn-settings');
  const settingsPanel = document.getElementById('settings-panel');
  btnSettings.addEventListener('click', e => {
    e.stopPropagation();
    const open = settingsPanel.classList.toggle('hidden') === false;
    btnSettings.classList.toggle('open', open);
  });
  document.addEventListener('click', e => {
    if (!settingsPanel.contains(e.target) && e.target !== btnSettings) {
      settingsPanel.classList.add('hidden');
      btnSettings.classList.remove('open');
    }
  });

  // Toggle thème jour/nuit
  document.getElementById('theme-toggle').addEventListener('change', e => {
    applyTheme(e.target.checked);
  });

  // Sélecteur de langue
  document.getElementById('lang-switcher').addEventListener('change', e => {
    setLang(e.target.value);
    updateI18n();
    renderShapeParams();
    updateBoxNameOverlay();
    updatePreview();
  });

  // Réglages de coupe : doit s'enregistrer avant les écouteurs ci-dessous, pour que les valeurs
  // calculées soient à jour quand l'aperçu se reconstruit
  cuttingPanel = initCuttingPanel({
    t, lang: currentLang,
    onChange: () => { updateRabbetToolWarning(); updatePartitionWarning(); updatePreview(); },
  });

  // Machine params — live update
  ['param-thickness','param-tool-diameter','param-passes','param-feedrate','param-plunge','param-spindle','param-safe-z','param-arcs','param-rapid'].forEach(id => {
    document.getElementById(id).addEventListener('input', () => { updateRabbetToolWarning(); updatePartitionWarning(); updatePreview(); });
  });

  // Resize
  window.addEventListener('resize', () => { resizeCanvases(); updatePreview(); });

  // Tooltips panneaux latéraux — data-tip contient une clé i18n
  document.querySelectorAll('.param-row[data-tip]').forEach(row => {
    const key = row.dataset.tip;
    attachTooltip(row, () => t(key), 600);
  });
}

// ─── Shape selection ────────────────────────────────────────────────────────
function selectShape(key) {
  if (state.boxTypeKey === 'finger-joint' && key !== 'rectangle') return;
  state.shapeKey = key;
  document.querySelectorAll('.shape-btn').forEach(b => b.classList.toggle('active', b.dataset.shape === key));
  state.shape = new SHAPES[key]();
  renderShapeParams();
  updatePreview();
}

function renderShapeParams() {
  const descriptors = state.shape.getParamDescriptors();
  // Box params from current box type
  const boxDescriptors = state.boxType ? state.boxType.getBoxParams() : [];
  const all = [...descriptors, ...boxDescriptors];

  paramsContainer.innerHTML = '';
  for (const d of all) {
    const row = document.createElement('div');
    row.className = 'param-row';

    if (d.type === 'ratio') {
      // ── Ratio calculé (lecture seule) ─────────────────────────────────────
      row.innerHTML = `<label>${t(d.label)}</label><input type="number" id="bean-ratio-display" readonly tabindex="-1"><span class="param-unit"></span>`;
      paramsContainer.appendChild(row);
      continue;
    } else if (d.type === 'checkbox') {
      // ── Param de type case à cocher ───────────────────────────────────────
      const currentVal = state.boxParams[d.id] ?? d.value ?? false;
      if (state.boxParams[d.id] === undefined) state.boxParams[d.id] = currentVal;
      row.innerHTML = `
        <label title="${t(d.label)}" style="grid-column:1/3">${t(d.label)}</label>
        <input type="checkbox" data-param="${d.id}"${currentVal ? ' checked' : ''} style="width:auto;justify-self:start;margin-top:2px;">
        <span class="param-unit"></span>
      `;
      row.querySelector('input').addEventListener('change', e => {
        state.boxParams[d.id] = e.target.checked;
        updatePreview();
      });
    } else if (d.type === 'text') {
      // ── Param texte (ex: répartition des compartiments « 60/40 ») ─────────
      const currentVal = state.boxParams[d.id] ?? d.value ?? '';
      if (state.boxParams[d.id] === undefined) state.boxParams[d.id] = currentVal;
      row.innerHTML = `
        <label title="${t(d.label)}">${t(d.label)}</label>
        <input type="text" data-param="${d.id}" placeholder="${d.placeholder ? t(d.placeholder) : ''}" spellcheck="false" autocomplete="off"${d.unit ? '' : ' class="param-text-wide"'}>
        ${d.unit ? `<span class="param-unit">${d.unit}</span>` : ''}
      `;
      const inp = row.querySelector('input');
      inp.value = currentVal;   // affecté après coup : aucun échappement HTML à gérer
      inp.addEventListener('input', e => {
        state.boxParams[d.id] = e.target.value;
        updatePartitionWarning();
        updatePreview();
      });
      if (d.id === 'partitionSplit') {
        const noteEl = document.createElement('div');
        noteEl.className = 'param-note';
        noteEl.id = 'partition-split-note';
        row.appendChild(noteEl);
      }
    } else if (d.options) {
      // ── Param de type sélecteur (ex: rabbetSide) ──────────────────────────
      const currentVal = state.boxParams[d.id] ?? d.options[0].value;
      const opts = d.options.map(o =>
        `<option value="${o.value}"${o.value == currentVal ? ' selected' : ''}>${t(o.label)}</option>`
      ).join('');
      row.innerHTML = `
        <label title="${t(d.label)}" style="grid-column:1/4">${t(d.label)}</label>
        <select data-param="${d.id}" style="grid-column:1/4;background:var(--bg-card);color:var(--text);border:1px solid var(--border);border-radius:4px;padding:3px 6px;font-size:13px;">${opts}</select>
      `;
      row.style.gridTemplateColumns = '1fr';
      row.querySelector('select').addEventListener('change', e => {
        const raw = e.target.value;
        state.boxParams[d.id] = Number.isNaN(Number(raw)) || raw === '' ? raw : Number.parseInt(raw);
        updateRabbetToolWarning();
        updatePartitionWarning();
        updatePreview();
      });
    } else {
      // ── Param numérique ────────────────────────────────────────────────────
      const currentVal = state.shape.params[d.id] ?? state.boxParams[d.id] ?? d.value ?? d.min;
      // Initialise boxParams dès le premier affichage pour que preview et G-code soient cohérents
      if (!state.shape.params.hasOwnProperty(d.id) && state.boxParams[d.id] === undefined) {
        state.boxParams[d.id] = currentVal;
      }
      row.innerHTML = `
        <label title="${t(d.label)}">${t(d.label)}</label>
        <input type="number" data-param="${d.id}" value="${currentVal}"${d.min !== undefined ? ` min="${d.min}"` : ''}${d.max !== undefined ? ` max="${d.max}"` : ''}${d.step !== undefined ? ` step="${d.step}"` : ''}${d.readonly ? ' readonly' : ''}>
        <span class="param-unit">${d.unit}</span>
      `;
      if (d.readonly) { row.querySelector('input').tabIndex = -1; }
      if (d.id === 'cornerRadius' && state.boxTypeKey === 'finger-joint') {
        const inp = row.querySelector('input');
        inp.disabled = true;
        row.style.opacity = '0.4';
        row.style.pointerEvents = 'none';
      }
      // Cloisons : disponibles pour toutes les formes (compartiments découpés par la cavité)
      const applyNumeric = e => {
        if (d.readonly) return;
        const val = Number.parseFloat(e.target.value);
        // Champ vidé ou saisie en cours (« 8. », « - ») : on attend une valeur valide au lieu
        // d'envoyer NaN aux formes, au G-code et à l'aperçu
        if (!Number.isFinite(val)) return;
        // Saisie en cours : le « 1 » de « 170 » est sous le minimum, on attend les chiffres suivants
        // (la validation du champ, évènement « change », applique la valeur telle quelle)
        const live = e.type === 'input';
        if (live && d.min !== undefined && val < d.min && state.shape.params.hasOwnProperty(d.id)) return;
        if (state.shape.params.hasOwnProperty(d.id)) {
          state.shape.updateParam(d.id, val, { live });
          // Synchronise les inputs liés (ex: longueur/largeur du rectangle)
          for (const [pid, pval] of Object.entries(state.shape.params)) {
            const inp = document.querySelector(`[data-param="${pid}"]`);
            if (inp && inp !== e.target) inp.value = typeof pval === 'number' ? +pval.toFixed(2) : pval;
          }
          updateShapeInputWarnings();
        } else {
          state.boxParams[d.id] = val;
        }
        updateBeanRatio();
        updatePinDepthWarning();
        updateRabbetToolWarning();
        updatePartitionWarning();
        updateFingerJointWarnings();
        updatePreview();
      };
      const numericInput = row.querySelector('input');
      numericInput.addEventListener('input', applyNumeric);
      numericInput.addEventListener('change', applyNumeric);   // validation : couplages appliqués (ex. longueur ≥ largeur)
      if (d.note) {
        const noteEl = document.createElement('div');
        noteEl.className = 'param-note';
        noteEl.textContent = d.note;
        row.appendChild(noteEl);
      }
    }

    paramsContainer.appendChild(row);
  }
  updateShapeInputWarnings();
  updateBeanRatio();
  updatePinDepthWarning();
  updateRabbetToolWarning();
  updatePartitionWarning();
  updateFingerJointWarnings();
}

function updatePinDepthWarning() {
  const el = document.querySelector('[data-param="pinDepth"]');
  if (!el) return;
  const pinDepth  = Number.parseFloat(el.value) || 0;
  const height    = state.boxParams.height    ?? 40;
  const rimHeight = state.boxParams.rimHeight ?? 8;
  const brut      = height + rimHeight;
  const warn      = pinDepth > 0 && pinDepth > brut;
  el.classList.toggle('input-warn', warn);
  el.title = warn
    ? t('warn.pin_depth', { brut })
    : '';
}

function updateShapeInputWarnings() {
  if (!state.shape?.getParamDescriptors) return;
  for (const d of state.shape.getParamDescriptors()) {
    if (d.warn === undefined) continue;
    const el = document.querySelector(`[data-param="${d.id}"]`);
    if (!el) continue;
    el.classList.toggle('input-warn', !!d.warn);
    if (d.warn && d.warnTip) {
      // Format: 'i18n.key|interpolation_value' pour les clés avec variables
      const [key, val] = d.warnTip.split('|');
      el.title = val ? t(key, { ratio: val, value: val }) : t(key);
    } else {
      el.title = '';
    }
  }
}

function updatePartitionWarning() {
  const el = document.querySelector('[data-param="partitions"]');
  const splitEl = document.querySelector('[data-param="partitionSplit"]');
  const note = document.getElementById('partition-split-note');
  const setWarn = (input, msg) => { if (!input) return; input.classList.toggle('input-warn', !!msg); input.title = msg || ''; };
  if (!el) return;
  const partitions = Number.parseInt(el.value) || 0;
  // Répartition : utile seulement s'il y a des cloisons
  if (splitEl) splitEl.closest('.param-row').style.opacity = partitions > 0 ? '' : '0.4';
  if (partitions === 0) { setWarn(el, ''); setWarn(splitEl, ''); if (note) note.textContent = ''; return; }
  const partitionDir  = (state.boxParams.partitionDir === 'horizontal') ? 'horizontal' : 'vertical';
  const wallThickness = state.boxParams.wallThickness ?? 6;
  const td  = Number.parseFloat(document.getElementById('param-tool-diameter').value) || 6;
  const bb  = state.shape?.getBoundingBox();
  if (!bb) return;
  const partThick = state.boxTypeKey === 'lid-box' ? lidPartitionThickness(state.boxParams) : wallThickness;
  const { sizes, error, sum } = partitionSizes(bb.width, bb.height, wallThickness, partitions, partitionDir,
    state.boxParams.partitionSplit ?? '', partThick);
  const across = (partitionDir === 'vertical' ? bb.height : bb.width) - 2 * wallThickness;
  const smallest = Math.min(...sizes, across);
  const minCell = LIMITS.partitionCellMinTools * td;   // même limite que le calcul des compartiments
  const tooSmall = smallest < minCell
    ? t('warn.partition_small', { cell: smallest.toFixed(0), min: minCell.toFixed(0), td }) : '';
  setWarn(el, tooSmall);
  // Saisie de la répartition inutilisable : parts égales (avertissement orange)
  setWarn(splitEl, error === 'count' ? t('warn.partition_split_count', { n: partitions + 1 })
    : error === 'invalid' ? t('warn.partition_split_invalid')
    : error === 'sum' ? t('warn.partition_split_sum', { sum: +sum.toFixed(1) }) : tooSmall);
  const fmt = v => (currentLang() === 'fr' ? v.toFixed(1).replace('.', ',') : v.toFixed(1));
  const list = sizes.map(fmt).join(' / ') + ' mm';
  // Champ vide : on dit que ce sont des parts égales (l'exemple grisé n'est pas une valeur)
  if (note) note.textContent = (state.boxParams.partitionSplit ?? '').trim() ? list : t('param.partition_split_equal', { sizes: list });
}


/** Met le champ en orange avec ses messages en info-bulle (aucun message : état normal). */
function setFieldWarnings(el, msgs) {
  el.classList.toggle('input-warn', msgs.length > 0);
  el.title = msgs.join('\n');
}

/** Avertissements de la feuillure : fraise, largeur, profondeur (fond du corps, couvercle enfoncé) et dessus du couvercle. */
function updateRabbetToolWarning() {
  const widthEl = document.querySelector('[data-param="rabbet"]');
  if (!widthEl) return;
  const depthEl = document.querySelector('[data-param="rabbetDepth"]');
  const p         = state.boxParams;
  const rabbetSide = Number(p.rabbetSide ?? 0);
  const rabbet    = Number.parseFloat(widthEl.value) || 0;
  const rabbetD   = Number.parseFloat(depthEl?.value) || 0;
  const wt        = p.wallThickness ?? 6;
  const clearance = p.clearance ?? 0.3;
  const td        = Number.parseFloat(document.getElementById('param-tool-diameter').value) || 0;

  // Largeur : fraise trop large (feuillure extérieure) ; feuillure aussi large que la paroi
  const widthMsgs = [];
  if (rabbetSide === 1 && td > rabbet + clearance)
    widthMsgs.push(t('warn.tool_too_large', { td, ringW: (rabbet + clearance).toFixed(1) }));
  if (rabbet >= wt)
    widthMsgs.push(t('warn.rabbet_wider_wall', { r: rabbet, wt }));
  setFieldWarnings(widthEl, widthMsgs);

  // Profondeur : fond du corps entamé, et lèvre du couvercle qui ne s'accorde pas à la feuillure
  if (!depthEl) return;
  const H = p.height ?? 40, bFl = p.bottomThickness ?? 6;
  const lidH = p.lidHeight ?? 0, bFll = p.lidBottomThickness ?? 6;
  const depthMsgs = [];
  const left = H - bFl - rabbetD;
  if (left < WARN.rabbetFloorMin)
    depthMsgs.push(t('warn.rabbet_floor', { left: Math.max(left, 0).toFixed(1), min: WARN.rabbetFloorMin }));
  if (lidH > 0) {
    // Feuillure trop profonde : la lèvre repose au fond de la feuillure, le dessus du couvercle est à H − profondeur + hauteur
    const sink = rabbetD - lidH;
    if (rabbetSide === 0 && sink > WARN.lidSinkMax)
      depthMsgs.push(t('warn.lid_sunk', { sink: sink.toFixed(1), usable: (H - rabbetD + lidH - bFll - bFl).toFixed(1) }));
    if (rabbetSide === 1 && lidH - rabbetD < bFll - 1e-6)
      depthMsgs.push(t('warn.lid_recess_deep', { depth: rabbetD, left: Math.max(lidH - rabbetD, 0).toFixed(1), top: bFll }));
  }
  setFieldWarnings(depthEl, depthMsgs);
}

function updateFingerJointWarnings() {
  const el = document.querySelector('[data-param="fingerWidth"]');
  if (!el) return;
  const fw = Number.parseFloat(el.value) || 10;
  const thick = state.boxParams.thickness ?? 6;
  const bb = state.shape?.getBoundingBox?.();
  if (!bb) return;

  const calcNb = L => {
    let nb = Math.floor(L / fw);
    if (nb < 1) nb = 1;
    return nb - 1 + (nb % 2);
  };
  const nW = calcNb(bb.width);
  const nD = calcNb(bb.height);

  // Vérifie les deux dimensions — prend le cas le plus défavorable
  let warnKey = null, warnParams = {};
  for (const [L, nb] of [[bb.width, nW], [bb.height, nD]]) {
    if (nb <= 1) {
      warnKey = 'warn.finger_too_few';
      warnParams = { L: L.toFixed(0) };
      break;
    }
    const tw = L / nb;
    if (tw <= thick * WARN.fingerWidthMinThick) {
      warnKey = 'warn.finger_too_narrow';
      warnParams = { tw: tw.toFixed(1), t: thick };
      break;
    }
  }

  el.classList.toggle('input-warn', warnKey !== null);
  el.title = warnKey ? t(warnKey, warnParams) : '';
}

function updateBeanRatio() {
  const el = document.getElementById('bean-ratio-display');
  if (!el) return;
  const w = state.shape.params.width ?? 1;
  const l = state.shape.params.length ?? 1;
  const ratio = w / l;
  const warn  = ratio < WARN.beanRatioMin || ratio > WARN.beanRatioMax;
  el.value = ratio.toFixed(2);
  el.title = warn ? t('warn.bean_ratio') : '';
  el.classList.toggle('input-warn', warn);
}

// ─── Box type selection ─────────────────────────────────────────────────────
function selectBoxType(key) {
  state.boxTypeKey = key;
  document.querySelectorAll('.box-type-btn').forEach(b => b.classList.toggle('active', b.dataset.type === key));
  state.boxType = new BOX_TYPES[key]();
  // Boîte à encoches : pas de placement à la main (panneaux séparés)
  if (key === 'finger-joint') stopTabEdit();
  if (document.getElementById('tabs-place-status')) { syncTabsUI(); updateToolbarSummaries(); }

  // Forcer rectangle + griser les autres formes pour finger-joint
  const isFingerJoint = key === 'finger-joint';
  document.querySelectorAll('.shape-btn').forEach(b => {
    const lock = isFingerJoint && b.dataset.shape !== 'rectangle';
    b.classList.toggle('shape-btn--disabled', lock);
    b.disabled = lock;
  });
  if (isFingerJoint && state.shapeKey !== 'rectangle') {
    state.shapeKey = 'rectangle';
    state.shape = new SHAPES['rectangle']();
    document.querySelectorAll('.shape-btn').forEach(b => b.classList.toggle('active', b.dataset.shape === 'rectangle'));
  }

  // Réinitialise les paramètres avec les valeurs par défaut du nouveau type
  state.boxParams = {};
  for (const d of state.boxType.getBoxParams()) {
    state.boxParams[d.id] = d.value ?? d.min ?? d.options?.[0]?.value;
  }
  renderShapeParams();
  updateBoxNameOverlay();
  updatePreview();
}

function updateBoxNameOverlay() {
  const overlay = document.getElementById('box-name-overlay');
  overlay.classList.toggle('hidden', state.view !== '3d');
  overlay.textContent = t(BOX_TYPES[state.boxTypeKey]?.label ?? '');
}

// ─── Machine params ─────────────────────────────────────────────────────────
function getMachineParams() {
  return {
    materialThickness: Number.parseFloat(document.getElementById('param-thickness').value),
    toolDiameter:      Number.parseFloat(document.getElementById('param-tool-diameter').value),
    depthPerPass:      Number.parseFloat(document.getElementById('param-passes').value),
    passes:            Math.max(1, Math.ceil(Number.parseFloat(document.getElementById('param-thickness').value) /
                         Number.parseFloat(document.getElementById('param-passes').value))),
    feedrate:          Number.parseFloat(document.getElementById('param-feedrate').value),
    plungeRate:        Number.parseFloat(document.getElementById('param-plunge').value),
    spindleSpeed:      Number.parseFloat(document.getElementById('param-spindle').value),
    safeZ:             Number.parseFloat(document.getElementById('param-safe-z').value),
    arcs:              document.getElementById('param-arcs').checked,
    rapidRate:         Number.parseFloat(document.getElementById('param-rapid').value) || 3000,  // G0 (temps estimé)
    rampAngle:         rampAngleFor(document.getElementById('param-material').value),  // pente des rampes / hélices d'entrée
    // Boîte à couvercle de hauteurs différentes : surplus de brut de chaque pièce (sinon indéfinis)
    ...stockExtras(),
  };
}

// Surplus de brut (« Brut + ») : un seul pour tout, sauf boîte à couvercle de hauteurs différentes
// où chaque pièce a le sien (deux champs dans la barre 3D)
function stockOffsets() {
  const num = id => Math.max(0, Number.parseFloat(document.getElementById(id).value) || 0);
  const h = state.boxParams.height ?? 40, lidH = state.boxParams.lidHeight ?? 15;
  const two = state.boxTypeKey === 'lid-box' && Math.abs(h - lidH) > 1e-6;
  const body = num('stock-offset');
  return { body, lid: two ? num('stock-offset-lid') : body, two, h, lidH };
}

function stockExtras() {
  const so = stockOffsets();
  return so.two ? { stockExtraBody: so.body, stockExtraLid: so.lid } : {};
}

// ─── Options d'export mémorisées ─────────────────────────────────────────────
// Réglées dans la fenêtre d'export, réutilisées à sa prochaine ouverture et par la
// simulation (qui joue ainsi exactement le fichier exporté). Les valeurs qui dépendent
// du diamètre d'outil restent null tant qu'elles valent le défaut calculé.
const EXPORT_OPTS_DEFAULT = {
  entryAuto: true,    // mode d'entrée proposé selon la matière (entryModeFor) ; false : `entry` choisi à la main
  entry: 'plunge', rampLen: null, helixR: null, helixTurns: 1,
  leadInOn: false, leadInR: null, finishOn: false, finishAllowance: 0.2,
  tabsOn: true, tabCount: 4, tabWidth: 8, tabHeight: 2, pocketConc: true,
  tabsManual: null,   // tabs placés à la main : fractions du périmètre du contour de la forme
};

/** Options enregistrées complétées par les valeurs par défaut. Enregistrées avant le mode « auto »
 *  (un `entry` sans `entryAuto`) : le mode enregistré est gardé tel quel, le G-code ne change pas. */
function withExportDefaults(saved) {
  const o = { ...EXPORT_OPTS_DEFAULT, ...saved };
  if (saved && 'entry' in saved && !('entryAuto' in saved)) o.entryAuto = false;
  return o;
}

function loadExportOpts() {
  try { return withExportDefaults(JSON.parse(localStorage.getItem('exportOpts') || '{}')); }
  catch { return { ...EXPORT_OPTS_DEFAULT }; }
}

/** Mode d'entrée en vigueur : proposé selon la matière (auto) ou choisi à la main. */
function currentEntryMode() {
  const o = state.exportOpts;
  return o.entryAuto ? entryModeFor(document.getElementById('param-material')?.value) : o.entry;
}

state.exportOpts = loadExportOpts();

function saveExportOpts(opts) {
  state.exportOpts = opts;
  try { localStorage.setItem('exportOpts', JSON.stringify(opts)); } catch { /* stockage indisponible */ }
  scheduleDirtyCheck();   // options enregistrées avec la session : « * » du titre
}

// Valeurs par défaut dépendant du diamètre d'outil (mêmes formules que la fenêtre d'export)
function exportToolDefaults(td) {
  return {
    ramp:   Math.max(1,   (td * 2).toFixed(1) * 1),    // 2 × ⌀outil
    helixR: Math.max(0.5, (td * 0.6).toFixed(2) * 1),  // 0.6 × ⌀outil
    leadR:  Math.max(0.5, (td * 0.4).toFixed(2) * 1),  // 0.4 × ⌀outil
  };
}

/** Tabs placés à la main en vigueur (pas pour la boîte à encoches, dont les panneaux ont leurs propres contours). */
function manualTabsActive() {
  const m = state.exportOpts.tabsManual;
  return state.boxTypeKey !== 'finger-joint' && Array.isArray(m) && m.length > 0;
}

/** Options de tabs pour la génération : nombre, taille et, s'ils sont placés à la main, leurs positions. */
function currentTabOpts() {
  const o = state.exportOpts;
  if (!o.tabsOn) return null;
  const manual = manualTabsActive() ? o.tabsManual : null;
  return { count: manual ? manual.length : o.tabCount, width: o.tabWidth, height: o.tabHeight, fractions: manual };
}

// Options de génération (tabOpts, entryOpts…) correspondant aux options d'export mémorisées
function exportGenOptions(machine) {
  const o = state.exportOpts;
  const d = exportToolDefaults(machine.toolDiameter ?? 3.175);
  const finishAllowance = o.finishOn ? o.finishAllowance : 0;
  return {
    tabOpts: currentTabOpts(),
    entryOpts: {
      entry: currentEntryMode(), rampLen: o.rampLen ?? d.ramp, helixR: o.helixR ?? d.helixR, helixTurns: o.helixTurns,
      leadIn: o.leadInOn ? (o.leadInR ?? d.leadR) : false, finishAllowance,
    },
    pocketConc: o.pocketConc,
    finishAllowance,
  };
}

// ─── Simulation d'usinage ────────────────────────────────────────────────────
let simView = null;

async function openSimulation() {
  if (!state.shape || !state.boxType) return;
  const machine = getMachineParams();
  const origin  = computeOrigin(getZ0Settings(), machine);
  const code = state.boxType.generateGCode(state.shape, state.boxParams, { ...machine, ...origin, ...exportGenOptions(machine) });

  // Brut : emprise du travail (coordonnées machine) + marge pour voir la rainure du contour
  const bb = state.boxType.getGCodeBoundingBox
    ? state.boxType.getGCodeBoundingBox(state.shape, state.boxParams, machine)
    : state.shape.getBoundingBox();
  const so = stockOffsets();
  const margin = Math.max(so.body, so.lid, machine.toolDiameter * 2 + 4);
  const stock = {
    x0: bb.minX + origin.originX - margin, x1: bb.minX + bb.width  + origin.originX + margin,
    y0: bb.minY + origin.originY - margin, y1: bb.minY + bb.height + origin.originY + margin,
    top: origin.zOffset, bottom: origin.zOffset - machine.materialThickness,
  };

  // Contours théoriques des pièces (case « Dessin », masque « Pièce finie seule »), repère machine
  const rawDrawing = state.boxType.getDrawing
    ? state.boxType.getDrawing(state.shape, state.boxParams, machine)
    : [{ pts: state.shape.getContourPoints(), face: 1, outer: true }];
  const drawing = rawDrawing.map(d => ({ ...d, pts: d.pts.map(p => ({ x: p.x + origin.originX, y: p.y + origin.originY })) }));
  const parts = lidBoxParts(code, drawing, stock, machine, margin);

  const { SimulationView } = await import('./modules/sim/SimulationView.js');
  simView?.close();
  // Le panneau recouvre toute la zone centrale (barre 3D / Vues 2D comprise, inactive pendant la simulation)
  simView = new SimulationView(document.querySelector('.panel-center'), {
    code, stock, drawing, parts, toolDiameter: machine.toolDiameter, rapidRate: machine.rapidRate,
    light: document.documentElement.dataset.theme === 'light',
    onClose: () => { simView = null; },
  });
}

/**
 * Boîte à couvercle dont corps et couvercle n'ont pas la même hauteur : ils sont usinés sur
 * deux bruts (voir l'avertissement à l'export). La simulation les montre pièce par pièce,
 * chacune sur son brut. Renvoie null dans les autres cas (simulation d'un seul programme).
 */
function lidBoxParts(code, drawing, stock, machine, margin) {
  if (state.boxTypeKey !== 'lid-box') return null;
  const H = state.boxParams.height ?? 40, lidH = state.boxParams.lidHeight ?? 15;
  if (Math.abs(H - lidH) < 1e-6) return null;
  const lines = code.split('\n');
  const iBody = lines.findIndex(l => l.trim() === '; ═══ CORPS ═══');
  const iLid  = lines.findIndex(l => l.trim() === '; ═══ COUVERCLE ═══');
  if (iBody < 0 || iLid < 0) return null;
  const extra = Math.max(0, machine.materialThickness - Math.max(H, lidH));   // surplus de brut
  const extraOf = key => (key === 'lid' ? machine.stockExtraLid : machine.stockExtraBody) ?? extra;
  const part = (key, label, codeLines, height) => {
    const draw = drawing.filter(d => d.part === key);
    const pts = draw.flatMap(d => d.pts);
    const xs = pts.map(p => p.x), ys = pts.map(p => p.y);
    // Z0 en bas du brut (stock.top > 0) : le dessus de chaque brut est à son épaisseur,
    // comme dans le G-code (LidBox) ; Z0 en haut : dessus de chaque brut à Z0
    const top = stock.top > 0 ? stock.top - (machine.materialThickness - (height + extraOf(key))) : stock.top;
    return {
      label, code: codeLines.join('\n'), drawing: draw,
      stock: {
        x0: Math.min(...xs) - margin, x1: Math.max(...xs) + margin,
        y0: Math.min(...ys) - margin, y1: Math.max(...ys) + margin,
        top, bottom: top - (height + extraOf(key)),
      },
    };
  };
  return [
    part('body', t('sim.part_body', { h: H }),    lines.slice(0, iLid), H),
    part('lid',  t('sim.part_lid',  { h: lidH }), [...lines.slice(0, iBody), ...lines.slice(iLid)], lidH),
  ];
}

// Épaisseur de brut d'une pièce de la boîte à couvercle exportée seule : sa hauteur plus le
// surplus de brut (même calcul que LidBox). Hauteurs égales : le brut commun.
function pieceStock(piece, machine) {
  const hBody = state.boxParams.height ?? 40, hLid = state.boxParams.lidHeight ?? 15;
  const extra = Math.max(0, machine.materialThickness - Math.max(hBody, hLid));
  return piece === 'lid' ? hLid + (machine.stockExtraLid ?? extra) : hBody + (machine.stockExtraBody ?? extra);
}

// Réécrit les lignes « Brut » et « Passes » de l'en-tête pour l'épaisseur de la pièce exportée
function restateStock(section, thickness, depthPerPass) {
  if (!section?.required) return;
  const [brut, passes] = stockHeaderLines(thickness, depthPerPass);
  section.lines = section.lines.map(l => {
    if (l.startsWith('; Brut:'))   return brut;
    if (l.startsWith('; Passes:')) return passes;
    return l;
  });
}

// Lit la position et le niveau du gizmo Z0 depuis les boutons actifs
function getZ0Settings() {
  const posBtn = document.querySelector('.z0-btn.active');
  const lvlBtn = document.querySelector('.z0-lvl-btn.active');
  return {
    pos:   posBtn?.dataset.pos   ?? 'center',
    level: lvlBtn?.dataset.level ?? 'bottom'
  };
}

// Calcule l'origine programme (originX, originY, zOffset) depuis le gizmo Z0
function computeOrigin(z0, machineParams) {
  if (!state.shape) return { originX: 0, originY: 0, zOffset: 0 };

  // Pour le finger-joint, utiliser le bounding box exact du layout G-code (gap=20)
  let bb;
  if (state.boxType?.getGCodeBoundingBox) {
    bb = state.boxType.getGCodeBoundingBox(state.shape, state.boxParams, machineParams);
  } else {
    bb = state.shape.getBoundingBox();
  }

  // Pour une coupe extérieure à un coin à 90°, le centre outil se décale de ±r
  // par bisectrice. On compense pour que le premier G0 tombe exactement à X0 Y0.
  const r = (machineParams.toolDiameter ?? 3.175) / 2;

  let originX = 0, originY = 0;
  switch (z0.pos) {
    case 'center':      originX = -(bb.minX + bb.width  / 2); originY = -(bb.minY + bb.height / 2); break;
    case 'front-left':  originX = -bb.minX + r; originY = -bb.minY + r; break;
    case 'front-right': originX = -bb.maxX - r; originY = -bb.minY + r; break;
    case 'back-left':   originX = -bb.minX + r; originY = -bb.maxY - r; break;
    case 'back-right':  originX = -bb.maxX - r; originY = -bb.maxY - r; break;
  }

  // Z0 en bas du brut → décale toutes les Z de +materialThickness
  const zOffset = z0.level === 'bottom' ? machineParams.materialThickness : 0;

  return { originX, originY, zOffset };
}

// ─── Preview ────────────────────────────────────────────────────────────────
function resizeCanvases() {
  const area = document.querySelector('.preview-area');
  const w = area.clientWidth, h = area.clientHeight;
  if (threePreview)  threePreview.resize(w, h);
  if (technicalView) technicalView.resize(w, h);
  else { canvas3d.width = w; canvas3d.height = h; }
}

function updatePreview() {
  scheduleDirtyCheck();   // « * » du titre si la session a changé
  if (threePreview) {
    const so = stockOffsets();
    threePreview.stockOffset = so.body; threePreview.stockOffsetLid = so.lid;
  }
  // Choix « À plat / Assemblé » : boîtes en plusieurs pièces (couvercle, encoches)
  document.querySelectorAll('.lid-layout-ctrl').forEach(el => {
    el.style.display = state.boxTypeKey === 'lid-box' || state.boxTypeKey === 'finger-joint' ? '' : 'none';
  });
  if (state.view === '3d') {
    if (!threePreview) {
      threePreview = new ThreePreview(canvas2d);
      threePreview.setTheme(document.documentElement.dataset.theme === 'light');
      const z0 = getZ0Settings();   // repère Z0 = boutons Z0 (session chargée en vue 2D…)
      threePreview.z0Pos = z0.pos; threePreview.z0Level = z0.level;
      const area = document.querySelector('.preview-area');
      threePreview.resize(area.clientWidth, area.clientHeight);
    }
    if (state.shape) {
      const bb = state.shape.getBoundingBox();
      try {
        threePreview.build(state.shape.getContourPoints(), bb, state.boxTypeKey, state.boxParams, getMachineParams());
      } catch (err) {
        // Dimensions impossibles (cavité vide…) : l'aperçu ne se construit pas, mais l'état reste utilisable
        console.error('Aperçu 3D :', err);
        showNotif(t('notif.preview_error'));
      }
    }
  } else if (state.view === 'tech') {
    if (!technicalView) {
      technicalView = new TechnicalView(canvas3d, onTechParamChange);
      technicalView.setTheme(document.documentElement.dataset.theme === 'light');
      const area = document.querySelector('.preview-area');
      technicalView.resize(area.clientWidth, area.clientHeight);
    }
    if (state.shape) {
      try {
        technicalView.build(state.shape, state.boxTypeKey, state.boxParams, getMachineParams(), state.boxType);
      } catch (err) {
        console.error('Vues 2D :', err);
        showNotif(t('notif.preview_error'));
      }
    }
  }
  syncMachiningUI();   // valeurs par défaut de l'onglet « Stratégie » : suivent le ⌀ de la fraise
  updateInfoBar();
}

// Callback depuis TechnicalView quand l'utilisateur édite une cote sur le plan
function onTechParamChange(paramId, value, isShape) {
  if (isShape) {
    state.shape.updateParam(paramId, value);
    // Synchroniser tous les inputs de forme (updateParam peut contraindre d'autres params)
    if (state.shape.params) {
      for (const [id, val] of Object.entries(state.shape.params)) {
        const inp = document.querySelector(`[data-param="${id}"]`);
        if (inp) inp.value = val;
      }
    }
  } else {
    state.boxParams[paramId] = value;
  }
  // Synchroniser l'input correspondant dans le panneau gauche
  const input = document.querySelector(`[data-param="${paramId}"]`);
  if (input) input.value = value;
  updatePreview();
}


// Hauteur de matière du brut (sans le surplus « Brut + ») selon la boîte
function stockHeight(h) {
  const p = state.boxParams;
  switch (state.boxTypeKey) {
    case 'finger-joint': return p.thickness ?? 6;
    case 'lid-box':      return Math.max(h, p.lidHeight ?? 15);
    case 'stackable':    return h + (p.rimHeight ?? 8);
    default:             return h;
  }
}

function updateInfoBar() {
  if (!state.shape) return;
  const bb = state.shape.getBoundingBox();
  const h  = state.boxParams.height ?? 30;

  // Brut = hauteur de la pièce la plus haute + offset brut
  // Pour finger-joint : brut = épaisseur des panneaux (pas la hauteur de la boîte)
  // Pour lid-box : corps et couvercle taillés dans la même planche → épaisseur = max(height, lidHeight)
  const so = stockOffsets();
  const total = so.two ? Math.max(so.h + so.body, so.lidH + so.lid) : stockHeight(h) + so.body;
  document.getElementById('param-thickness').value = total.toFixed(1);
  updateStockRows(so);
  infoDims.textContent = `${bb.width.toFixed(1)} × ${bb.height.toFixed(1)} × ${h.toFixed(1)} mm`;
  const area = (bb.width * bb.height / 100).toFixed(1);
  infoArea.textContent = `${t('info.surface')}: ${area} cm²`;
  updateSheetSize();
}

// Boîte à couvercle de hauteurs différentes : on montre le brut de chaque pièce (la valeur max
// du champ « Brut » reste celle du G-code, qui garde le brut à la hauteur max pour les deux)
function updateStockRows({ two, h, lidH, body, lid }) {
  document.getElementById('row-stock').hidden = two;
  document.getElementById('row-stock-body').hidden = !two;
  document.getElementById('row-stock-lid').hidden  = !two;
  document.getElementById('stock-lid-group').hidden = !two;   // second champ « Brut + » (couvercle)
  // Deux planches : écart entre les pièces réglable (le champ ne change pas pendant la saisie)
  document.getElementById('lid-gap-group').hidden = !two;
  document.getElementById('lid-gap-note').hidden = !two;
  const gapEl = document.getElementById('lid-gap');
  if (document.activeElement !== gapEl) gapEl.value = lidGapOf(state.boxParams);
  const label = document.getElementById('stock-offset-label');
  label.dataset.i18n = two ? 'ui.stock_offset_body' : 'ui.stock_offset';
  label.textContent = t(label.dataset.i18n);
  if (two) {
    document.getElementById('stock-body').value = (h + body).toFixed(1);
    document.getElementById('stock-lid').value  = (lidH + lid).toFixed(1);
  }
  updateToolbarSummaries();
}

/** Fenêtre « Brut » : écart réel entre les contours, marge des planches et chute au-delà de la fraise. */
function updateLidGapNote(gap, margin) {
  const note = document.getElementById('lid-gap-note'), field = document.getElementById('lid-gap');
  const td = getMachineParams().toolDiameter ?? 3.175;
  const chute = margin - td;                 // le bord de la fraise passe à un diamètre du contour
  const fmt = v => (+v.toFixed(1)).toLocaleString('fr-FR');
  const warn = chute < WARN.boardChuteMin;
  note.textContent = t(warn ? 'ui.lid_gap_warn' : 'ui.lid_gap_note',
    { gap: fmt(gap), margin: fmt(margin), chute: fmt(Math.max(chute, 0)), min: WARN.boardChuteMin });
  note.classList.toggle('warn-text', warn);
  field.classList.toggle('input-warn', warn);
  field.title = warn ? note.textContent : t('tip.lid_gap');
}

// Taille de plaque conseillée : emprise réelle des pièces (mêmes contours que le G-code,
// la simulation et l'export SVG) + trous hors pièce, plus une marge de chaque côté
function updateSheetSize() {
  const margin = 20;
  const ext = items => {
    const xs = items.flatMap(d => d.pts.map(p => p.x)), ys = items.flatMap(d => d.pts.map(p => p.y));
    return xs.length ? { minX: Math.min(...xs), maxX: Math.max(...xs), minY: Math.min(...ys), maxY: Math.max(...ys) } : null;
  };
  const sheet = e => `${Math.ceil(e.maxX - e.minX + 2 * margin)} × ${Math.ceil(e.maxY - e.minY + 2 * margin)}`;
  const drawing = state.boxType?.getDrawing
    ? state.boxType.getDrawing(state.shape, state.boxParams, getMachineParams())
    : [{ pts: state.shape.getContourPoints(), face: 1 }];
  // Face 1 seulement : la face 2 (pièce retournée) occupe le même brut
  const face1 = drawing.filter(d => (d.face ?? 1) === 1);
  // Trous de goupille (boîte empilable) : des disques ajoutés à l'emprise
  const holes = (state.boxType?.getPinHoles?.(state.shape, state.boxParams) ?? [])
    .map(h => ({ pts: [{ x: h.x - h.d / 2, y: h.y - h.d / 2 }, { x: h.x + h.d / 2, y: h.y + h.d / 2 }] }));

  let text = null;
  const hBody = state.boxParams.height ?? 40, hLid = state.boxParams.lidHeight ?? 15;
  if (state.boxTypeKey === 'lid-box' && hBody !== hLid) {
    // Hauteurs différentes → un brut par pièce (voir l'avertissement à l'export)
    const body = ext(face1.filter(d => d.part === 'body')), lid = ext(face1.filter(d => d.part === 'lid'));
    if (body && lid) {
      // Écart réel entre les contours (le couvercle réduit est plus petit que le corps) ; marge de chaque
      // planche = moitié de l'écart moins un petit jeu, sans dépasser 20 mm : les planches ne se chevauchent pas
      const gap = Math.max(lid.minY - body.maxY, lid.minX - body.maxX);
      const m2 = Math.min(margin, Math.max(0, (gap - WARN.boardClear) / 2));
      const sheet2 = e => `${Math.ceil(e.maxX - e.minX + 2 * m2)} × ${Math.ceil(e.maxY - e.minY + 2 * m2)}`;
      text = sheet2(body) === sheet2(lid) ? `2× ${sheet2(body)}` : `${sheet2(body)} + ${sheet2(lid)}`;
      updateLidGapNote(gap, m2);
    }
  } else {
    const all = ext([...face1, ...holes]);
    if (all) text = sheet(all);
  }
  if (text) {
    infoSheet.textContent = `${t('info.sheet_size')} : ${text} mm`;
    infoSheet.classList.remove('hidden');
  } else {
    infoSheet.classList.add('hidden');
  }
}

// ─── G-code generation ──────────────────────────────────────────────────────
function generateGCode() {
  if (!state.shape || !state.boxType) return;
  const machine = getMachineParams();
  const z0      = getZ0Settings();
  const origin  = computeOrigin(z0, machine);
  // Mêmes options que l'export et la simulation (onglet « Stratégie », tabs)
  const code = state.boxType.generateGCode(state.shape, state.boxParams, { ...machine, ...origin, ...exportGenOptions(machine) });
  renderGCode(code);
}

function renderGCode(code) {
  const lines = code.split('\n');
  const highlighted = lines.map(line => {
    const l = line.trim();
    if (l.startsWith(';'))                          return `<span class="gc-comment">${escHtml(line)}</span>`;
    if (l.startsWith('G0'))                         return `<span class="gc-rapid">${escHtml(line)}</span>`;
    if (/^G[123](?![0-9.])/.test(l))                return `<span class="gc-move">${escHtml(line)}</span>`;
    if (l.startsWith('M') || l.startsWith('S'))     return `<span class="gc-cmd">${escHtml(line)}</span>`;
    if (l.startsWith('F'))                          return `<span class="gc-feed">${escHtml(line)}</span>`;
    return escHtml(line);
  });
  gcodeOutput.innerHTML = highlighted.join('\n');

  gcodeStats.innerHTML = '';
}

// ─── Exports ────────────────────────────────────────────────────────────────
async function exportGCode() {
  generateGCode();
  if (!gcodeOutput.textContent.trim()) return;
  // Liste des opérations : libellés courts d'une génération sans options (concentrique), les
  // options (entrée, tabs…) n'ajoutant ni ne retirant de section
  const machine = getMachineParams();
  const plain = state.boxType.generateGCode(state.shape, state.boxParams,
    { ...machine, ...computeOrigin(getZ0Settings(), machine), pocketConc: true });
  showExportModal(parseGCodeSections(plain), machine);
}

// Découpe le G-code en sections identifiées par les marqueurs ; ─── ... ───
// Titre d'un repère « ; ─── titre ─── », ou null si la ligne n'en est pas un
function sectionLabel(line) {
  if (!line.startsWith('; ───')) return null;
  let i = 2;
  while (line[i] === '─') i++;                           // tirets d'ouverture
  if (!/\s/.test(line[i] ?? '')) return null;
  const rest = line.slice(i);
  const end = rest.search(/\s─{3}/);                      // premier blanc suivi de tirets de fermeture
  const label = end < 0 ? '' : rest.slice(0, end).trim();
  return label || null;
}

function parseGCodeSections(code) {
  const lines = code.split('\n');
  const sections = [];
  let headerLines = [];
  let currentSec = null;
  let pastHeader = false;

  for (const line of lines) {
    const label = sectionLabel(line);
    if (label) {
      if (!pastHeader) {
        sections.push({ label: t('modal.header_section'), lines: headerLines, required: true });
        pastHeader = true;
      }
      if (currentSec) sections.push(currentSec);
      currentSec = { label, lines: [line], required: false };
    } else if (!pastHeader) {
      headerLines.push(line);
    } else if (currentSec) {
      currentSec.lines.push(line);
    }
  }
  if (currentSec) sections.push(currentSec);
  splitFooter(sections);
  return sections;
}

// Extrait le pied de programme (M5 / M30) de la dernière section optionnelle : il devient une
// section obligatoire à part (les lignes vides qui le précèdent le suivent)
function splitFooter(sections) {
  const lastOp = sections.at(-1);
  if (!lastOp || lastOp.required) return;
  const m5 = lastOp.lines.findLastIndex(l => l.trim().startsWith('M5'));
  if (m5 < 0) return;
  let footerStart = m5;
  while (footerStart > 0 && lastOp.lines[footerStart - 1].trim() === '') footerStart--;
  const footerLines = lastOp.lines.splice(footerStart);
  sections.push({ label: t('modal.footer_section'), lines: footerLines, required: true });
}

function showExportModal(sections, machine = {}) {
  const optional = sections.filter(s => !s.required);
  // Options d'usinage : onglet « Stratégie » et bouton « Tabs » (ici, simple rappel)
  const o = state.exportOpts;
  const gen = exportGenOptions(machine);
  const eo = gen.entryOpts;
  const mm = v => `${String(v).replace('.', ',')} mm`;
  const entryText = { ramp: `${t('modal.ramp')} ${mm(eo.rampLen)}`, helix: `${t('modal.helix')} R ${mm(eo.helixR)}` }[eo.entry]
    ?? t('modal.plunge');
  const strategyText = t('modal.strategy_summary', {
    entry: entryText + (eo.leadIn ? ` + lead-in R ${mm(eo.leadIn)}` : ''),
    finish: gen.finishAllowance > 0 ? mm(gen.finishAllowance) : t('modal.finish_off'),
    pocket: t(o.pocketConc ? 'ui.pocket_conc' : 'ui.pocket_raster'),
  });

  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';

  const modal = document.createElement('div');
  modal.className = 'export-modal';
  const opsKey = optional.length === 1 ? 'modal.ops_one' : 'modal.ops_other';
  modal.innerHTML = `
    <h3>${t('modal.export_title')}</h3>
    <div class="tabs-section">
      <p class="modal-sub" style="margin:0">${escHtml(strategyText)}</p>
      <p class="modal-sub" style="margin:4px 0 0">${escHtml(tabsSummaryText())}</p>
    </div>
    <p class="modal-sub">${t(opsKey, { count: optional.length })}</p>
    <div class="modal-toolbar">
      <button class="btn-ghost" id="modal-sel-all">${t('modal.select_all')}</button>
      <button class="btn-ghost" id="modal-sel-none">${t('modal.select_none')}</button>
    </div>
    <div class="section-list" id="modal-sec-list"></div>
    <div class="modal-stats" id="modal-stats"></div>
    <div class="modal-actions">
      <button class="btn btn-secondary" id="modal-cancel">${t('modal.cancel')}</button>
      <button class="btn btn-accent"    id="modal-do-export">${t('modal.do_export')}</button>
    </div>
  `;
  overlay.appendChild(modal);
  document.body.appendChild(overlay);

  // Tooltips custom sur les éléments [data-tip] de la modale
  modal.querySelectorAll('[data-tip]').forEach(el => {
    attachTooltip(el, el.dataset.tip, 400);
  });

  // Liste des sections avec cases à cocher
  const list = modal.querySelector('#modal-sec-list');
  sections.forEach((sec, idx) => {
    const item = document.createElement('label');
    item.className = `sec-item${sec.required ? ' sec-required' : ''}`;

    const cb = document.createElement('input');
    cb.type = 'checkbox';
    cb.className = 'sec-check';
    cb.checked = true;
    cb.disabled = sec.required;
    cb.dataset.idx = idx;
    item.appendChild(cb);

    const lbl = document.createElement('span');
    lbl.className = 'sec-label';
    lbl.textContent = sec.label;
    item.appendChild(lbl);

    const cnt = document.createElement('span');
    cnt.className = 'sec-lines';
    cnt.textContent = t('modal.n_lines', { n: sec.lines.length });
    item.appendChild(cnt);

    list.appendChild(item);
  });

  const getCheckboxes = () => list.querySelectorAll('input[type=checkbox]:not(:disabled)');

  const modalStatsEl = modal.querySelector('#modal-stats');
  // Options de génération : onglet « Stratégie » et tabs (une seule source : state.exportOpts)
  const { tabOpts, entryOpts, pocketConc } = gen;
  // `origin` : origine du programme (et lidAtOrigin pour le couvercle exporté seul)
  const genFor = origin => state.boxType.generateGCode(state.shape, state.boxParams,
    { ...machine, ...origin, tabOpts, entryOpts, pocketConc, finishAllowance: gen.finishAllowance });
  const fullSections = parseGCodeSections(genFor(computeOrigin(getZ0Settings(), machine)));

  const updateModalStats = () => {
    const fSections = fullSections;
    const sel = new Set();
    list.querySelectorAll('input[type=checkbox]').forEach(cb => { if (cb.checked) sel.add(Number.parseInt(cb.dataset.idx)); });
    const code = fSections.filter((_, i) => sel.has(i)).map(s => s.lines.join('\n')).join('\n');
    const fl = code.split('\n');
    modalStatsEl.innerHTML = `
      <span class="stat-item">${t('stats.lines')}: <span class="stat-value">${fl.length}</span></span>
      <span class="stat-item">${t('stats.lines_exec')}: <span class="stat-value">${fl.filter(l => { const s = l.trim(); return s.length > 0 && !s.startsWith(';') && !s.startsWith('('); }).length}</span></span>
    `;
  };
  list.addEventListener('change', updateModalStats);
  modal.querySelector('#modal-sel-all').addEventListener('click',  () => { getCheckboxes().forEach(cb => cb.checked = true);  updateModalStats(); });
  modal.querySelector('#modal-sel-none').addEventListener('click', () => { getCheckboxes().forEach(cb => cb.checked = false); updateModalStats(); });

  // Applique l'état initial des tabs sur les labels (selon les options mémorisées)
  if (o.tabsOn) {
    list.querySelectorAll('.sec-label').forEach(lbl => {
      if (lbl.textContent.toLowerCase().includes('outside'))
        lbl.textContent = lbl.textContent.replace('outside)', 'outside + tabs)');
    });
  }

  // Stratégie de poche mémorisée + mise à jour labels
  // La prévisualisation est générée avec pocketConc:true → labels du type
  // "Pocket concentrique (N anneaux...)", "Pocket spirale (...)" ou "Pocket (...)" → normalisés
  const pocketLabel = t(o.pocketConc ? 'modal.pocket_conc_label' : 'modal.pocket_raster_label');
  // Un seul remplacement par libellé : enchaînés, « Pocket concentrique (…) » devenait « Pocket raster
  // zig-zag », puis « Pocket raster » y était remplacé une seconde fois (« zig-zag zig-zag »)
  list.querySelectorAll('.sec-label').forEach(lbl => {
    lbl.textContent = lbl.textContent
      .replace(/Pocket (?:concentrique |spirale )?\([^)]*\)|Pocket raster(?: zig-zag)?/, pocketLabel);
  });

  updateModalStats();

  const close = () => overlay.remove();
  modal.querySelector('#modal-cancel').addEventListener('click', close);
  overlay.addEventListener('click', e => { if (e.target === overlay) close(); });

  modal.querySelector('#modal-do-export').addEventListener('click', async () => {
    const selected = new Set();
    list.querySelectorAll('input[type=checkbox]').forEach(cb => {
      if (cb.checked) selected.add(Number.parseInt(cb.dataset.idx));
    });
    if (selected.size === 0) { showNotif(t('notif.no_ops')); return; }

    // G-code définitif (options de l'onglet « Stratégie » et tabs), puis filtrage des sections
    const machine = getMachineParams();
    const z0      = getZ0Settings();
    const finalSections = fullSections;

    // Avertissement : couvercle ajusté — cavité corps sans feuillure corps
    const cavCorpsIdx = finalSections.findIndex(s => s.label.toLowerCase().includes('cavit') && s.label.toLowerCase().includes('corps'));
    const feuCorpsIdx = finalSections.findIndex(s => s.label.toLowerCase().includes('feuillure') && s.label.toLowerCase().includes('corps'));
    const feuLidIdx0  = finalSections.findIndex(s => s.label.toLowerCase().includes('feuillure') && s.label.toLowerCase().includes('couvercle'));
    const feuCorpsIsInterior = feuCorpsIdx >= 0 && !finalSections[feuCorpsIdx].label.toLowerCase().includes('extérieur');
    if (cavCorpsIdx >= 0 && selected.has(cavCorpsIdx) && feuCorpsIsInterior && !selected.has(feuCorpsIdx)) {
      const ok = await showWarnConfirm(
        t('dialog.machining_order_title'),
        t('dialog.machining_order_body_corps')
      );
      if (!ok) return;
    }
    // Avertissement : couvercle plein — cavité couvercle sans feuillure couvercle
    const cavLidIdx = finalSections.findIndex(s => s.label.toLowerCase().includes('cavit') && s.label.toLowerCase().includes('couvercle'));
    if (cavLidIdx >= 0 && selected.has(cavLidIdx) && feuLidIdx0 >= 0 && !selected.has(feuLidIdx0)) {
      const ok = await showWarnConfirm(
        t('dialog.machining_order_title'),
        t('dialog.machining_order_body_lid')
      );
      if (!ok) return;
    }
    // Avertissement : lid-box — hauteurs différentes corps/couvercle → bruts séparés requis
    if (state.boxTypeKey === 'lid-box') {
      const hBody = state.boxParams.height    ?? 40;
      const hLid  = state.boxParams.lidHeight ?? 15;
      const hasBody = finalSections.some((s, i) => selected.has(i) && s.label.toLowerCase().includes('corps'));
      const hasLid  = finalSections.some((s, i) => selected.has(i) && s.label.toLowerCase().includes('couvercle'));
      if (hasBody && hasLid && hBody !== hLid) {
        const ok = await showWarnConfirm(
          t('dialog.diff_heights_title'),
          t('dialog.diff_heights_body', { hBody, hLid })
        );
        if (!ok) return;
      }
    }
    // Avertissement : boîte empilable — export OP2 sans OP1
    if (state.boxTypeKey === 'stackable') {
      const hasOP1 = finalSections.some((s, i) => selected.has(i) && (
        s.label.toLowerCase().includes('trou') || s.label.toLowerCase().includes('cavit')
      ));
      const hasOP2 = finalSections.some((s, i) => selected.has(i) && (
        s.label.toLowerCase().includes('fraisage') || s.label.toLowerCase().includes('contour')
      ));
      if (hasOP2 && !hasOP1) {
        const ok = await showWarnConfirm(
          t('dialog.stackable_flip_title'),
          t('dialog.stackable_flip_body')
        );
        if (!ok) return;
      }
    }

    // lid-box : si seulement corps ou seulement couvercle → recentre sur la pièce exportée
    let sectionsForExport = finalSections;
    if (state.boxTypeKey === 'lid-box') {
      const isBodySec = s => s.label.toLowerCase().includes('corps') || s.label.toLowerCase().includes('body');
      const isLidSec  = s => s.label.toLowerCase().includes('couvercle') || s.label.toLowerCase().includes('lid');
      const bodySelected = finalSections.some((s, i) => selected.has(i) && isBodySec(s));
      const lidSelected  = finalSections.some((s, i) => selected.has(i) && isLidSec(s));
      if (!bodySelected) {
        // Couvercle seul : recentre sur le corps (lidAtOrigin → bbox corps seul)
        const lidOrigin = computeOrigin(z0, { ...machine, lidAtOrigin: true });
        sectionsForExport = parseGCodeSections(genFor({ ...lidOrigin, lidAtOrigin: true }));
        // Corrige le préambule : ═══ CORPS ═══ → ═══ COUVERCLE ═══
        if (sectionsForExport.length > 0 && sectionsForExport[0].required)
          sectionsForExport[0].lines = sectionsForExport[0].lines
            .map(l => l === '; ═══ CORPS ═══' ? '; ═══ COUVERCLE ═══' : l);
        restateStock(sectionsForExport[0], pieceStock('lid', machine), machine.depthPerPass);
      } else if (!lidSelected) {
        // Corps seul : recentre sur le corps uniquement
        const bodyOrigin = computeOrigin(z0, { ...machine, lidAtOrigin: true });
        sectionsForExport = parseGCodeSections(genFor(bodyOrigin));
        restateStock(sectionsForExport[0], pieceStock('body', machine), machine.depthPerPass);
      }
    }

    const code = sectionsForExport
      .filter((_, i) => selected.has(i))
      .map(s => s.lines.join('\n'))
      .join('\n');

    close();
    const name = `boxgen_${state.shapeKey}_${state.boxTypeKey}.nc`;
    if (window.electronAPI) {
      const res = await window.electronAPI.saveGCode({ content: code, defaultName: name });
      if (res.success) showNotif(t('notif.saved', { path: res.path }));
    }
  });
}

// ─── Session save / load ────────────────────────────────────────────────────
let appTitle = 'Box Generator - CNC';   // titre de base (avec la version dans l'application)
let sessionName = '';                  // fichier de session courant
let savedSnapshot = null;              // contenu de la session au dernier enregistrement ou à l'ouverture
let sessionDirty = false;              // modifiée depuis : « * » devant le nom dans le titre
let dirtyTimer = null;

/** Session telle qu'elle est enregistrée dans le fichier. */
function buildSession() {
  return {
    version:       2,   // 2 : haricot avec longueur sur X
    shapeKey:      state.shapeKey,
    boxTypeKey:    state.boxTypeKey,
    shapeParams:   { ...state.shape.params },
    boxParams:     { ...state.boxParams },
    machineParams: getMachineParams(),
    cutting:       cuttingPanel.getState(),
    z0:            getZ0Settings(),
    machining:     { ...state.exportOpts },   // entrée, finition, tabs, stratégie de poche
  };
}

function sessionSnapshot() {
  try { return JSON.stringify(buildSession()); } catch { return null; }
}

/** Titre de la fenêtre : « *nom.json — Box Generator… » (le « * » dit que la session a changé depuis l'enregistrement). */
function refreshTitle() {
  document.title = sessionName ? `${sessionDirty ? '*' : ''}${sessionName} — ${appTitle}` : appTitle;
}

/** Vérifie le « * » du titre un court instant après une modification (plusieurs modifications : une seule vérification). */
function scheduleDirtyCheck() {
  clearTimeout(dirtyTimer); dirtyTimer = setTimeout(refreshDirty, 150);
}

/** Compare la session courante au dernier enregistrement (appelé, après un court délai, à chaque mise à jour de l'aperçu). */
function refreshDirty() {
  if (!sessionName || savedSnapshot === null || !state.shape || !state.boxType) return;
  const dirty = sessionSnapshot() !== savedSnapshot;
  if (dirty !== sessionDirty) { sessionDirty = dirty; refreshTitle(); }
}

/** Nom du fichier de session dans le titre de la fenêtre (rien tant qu'aucun fichier n'est ouvert ou enregistré). */
function showSessionName(name) {
  sessionName = name ?? '';
  sessionDirty = false;
  refreshTitle();
}

async function saveSession(saveAs = false) {
  if (!state.shape || !state.boxType) return;

  const session = buildSession();

  const defaultName = `boxgen_${state.boxTypeKey}_${state.shapeKey}.json`;
  const res = await window.electronAPI.saveSession({ content: JSON.stringify(session, null, 2), defaultName, saveAs: saveAs === true });
  if (res?.success) {
    savedSnapshot = JSON.stringify(session);
    showSessionName(res.name);
    showNotif(t('notif.session_saved', { path: res.path }));
  } else if (res?.error) {
    showNotif(t('notif.session_error', { error: res.error }));
  }
}

async function loadSession() {
  const result = await window.electronAPI.loadSession();
  if (!result.success) return;

  let session;
  try { session = JSON.parse(result.content); } catch { return; }
  savedSnapshot = null;           // pas de comparaison pendant la restauration
  showSessionName(result.name);

  const { shapeKey, shapeParams } = migrateSessionShape(session);

  // Restaure type de boîte et forme
  selectBoxType(session.boxTypeKey ?? 'open-tray');
  selectShape(shapeKey);

  // Restaure params forme directement dans state.shape.params
  if (shapeParams) {
    Object.entries(shapeParams).forEach(([k, v]) => {
      if (state.shape.params.hasOwnProperty(k)) state.shape.updateParam(k, v);
    });
    renderShapeParams();
  }

  // Restaure params boîte puis reconstruit l'UI entière (checkboxes incluses)
  if (session.boxParams) {
    state.boxParams = { ...session.boxParams };
    renderShapeParams();
  }

  if (session.machineParams) {
    restoreMachineParams(session.machineParams, session.depthPerPass);
    cuttingPanel.setState(session.cutting);   // anciennes sessions : valeurs du fichier gardées telles quelles
  }
  if (session.z0) restoreZ0(session.z0);
  // Options d'usinage de la session (entrée, finition, tabs, poche) ; sessions plus anciennes : réglages courants
  if (session.machining) {
    saveExportOpts(withExportDefaults(session.machining));
    syncTabsUI();
    updateToolbarSummaries();
  }

  updatePreview();
  updateInfoBar();
  showPanelTab('cut');   // session ouverte : onglet des avertissements de coupe
  savedSnapshot = sessionSnapshot();   // état de référence : le titre n'a pas de « * » tant que rien ne change
}

// ─── Nouvelle session ───────────────────────────────────────────────────────
/** Réglages d'une nouvelle session (le reste vient des valeurs par défaut des boîtes et du panneau). */
const NEW_SESSION = { box: 'open-tray', shape: 'rectangle', toolDiameter: 6, flutes: 2,
  z0: { pos: 'center', level: 'top' }, safeZ: 5, arcs: true, lidGap: 20 };
let blankSnapshot = null;   // session sans fichier, au démarrage ou à la dernière « nouvelle session »

/** La session en cours a des modifications qui seraient perdues (fichier modifié, ou travail jamais enregistré). */
function hasUnsavedWork() {
  if (sessionName) return sessionDirty;
  return blankSnapshot !== null && sessionSnapshot() !== blankSnapshot;
}

/**
 * Nouvelle session : boîte, forme, dimensions, Z0, brut, onglet « Stratégie » et tabs par défaut ; fraise
 * en saisie manuelle (⌀ 6, 2 dents). Gardés : matière, limites machine, langue, thème, vue.
 */
async function newSession() {
  if (hasUnsavedWork() && !(await showWarnConfirm(t('dialog.new_session_title'), escHtml(t('dialog.new_session_body'))))) return;
  const d = NEW_SESSION;
  savedSnapshot = null;   // pas de comparaison pendant la remise à zéro
  stopTabEdit();
  closeToolbarPops();
  selectBoxType(d.box);
  selectShape(d.shape);
  restoreZ0(d.z0);
  for (const id of ['stock-offset', 'stock-offset-lid']) document.getElementById(id).value = 0;
  setPressed('.stock-side-btn', document.querySelector('.stock-side-btn[data-side="top"]'));
  if (threePreview) threePreview.stockSide = 'top';
  document.getElementById('lid-gap').value = d.lidGap;
  document.getElementById('param-safe-z').value = d.safeZ;
  document.getElementById('param-arcs').checked = d.arcs;
  saveExportOpts({ ...EXPORT_OPTS_DEFAULT });
  syncTabsUI();
  cuttingPanel.reset({ diameter: d.toolDiameter, flutes: d.flutes });   // recalcule avances et passes, puis l'aperçu
  gcodeOutput.innerHTML = `<span class="gcode-placeholder" data-i18n="ui.gcode_placeholder">${escHtml(t('ui.gcode_placeholder'))}</span>`;
  window.electronAPI?.newSession?.();   // « Enregistrer » demandera où écrire
  showSessionName('');
  updateToolbarSummaries();
  updatePreview();
  updateInfoBar();
  showPanelTab('cut');
  blankSnapshot = sessionSnapshot();
}

// Forme et paramètres d'une session, avec compatibilité des anciennes versions
function migrateSessionShape(session) {
  let shapeKey = session.shapeKey ?? 'rectangle';
  let shapeParams = session.shapeParams ? { ...session.shapeParams } : null;
  if (shapeKey === 'hexagon') {
    // Hexagone supprimé : polygone à 6 côtés, mêmes cotes, rayon et rotation
    shapeKey = 'polygon';
    if (shapeParams) shapeParams = {
      length: shapeParams.longueur, width: shapeParams.largeur, sides: 6,
      cornerRadius: shapeParams.cornerRadius ?? 0, orientation: shapeParams.orientation ?? 0,
    };
  } else if (shapeKey === 'bean' && (session.version ?? 1) < 2 && shapeParams) {
    // Avant la version 2, la longueur du haricot était sur Y : on garde la même pièce
    [shapeParams.length, shapeParams.width] = [shapeParams.width, shapeParams.length];
  }
  if (!SHAPES[shapeKey]) shapeKey = 'rectangle';
  return { shapeKey, shapeParams };
}

// Restaure les paramètres machine du panneau gauche
function restoreMachineParams(mp, depthPerPass) {
  const set = (id, val) => { const el = document.getElementById(id); if (el) el.value = val; };
  set('param-thickness',    mp.materialThickness);
  set('param-tool-diameter',mp.toolDiameter);
  set('param-passes',       depthPerPass ?? mp.depthPerPass);
  set('param-feedrate',     mp.feedrate);
  set('param-plunge',       mp.plungeRate);
  set('param-spindle',      mp.spindleSpeed);
  set('param-safe-z',       mp.safeZ);
  if (typeof mp.arcs === 'boolean') document.getElementById('param-arcs').checked = mp.arcs;
  if (mp.rapidRate > 0) set('param-rapid', mp.rapidRate);
}

// Restaure la position et le niveau du repère Z0
function restoreZ0(z0) {
  setPressed('.z0-btn', [...document.querySelectorAll('.z0-btn')].find(b => b.dataset.pos === z0.pos));
  setPressed('.z0-lvl-btn', [...document.querySelectorAll('.z0-lvl-btn')].find(b => b.dataset.level === z0.level));
  updateToolbarSummaries();
  // Le repère Z0 de la vue 3D suit les boutons (l'export les lit déjà)
  if (threePreview) {
    const cur = getZ0Settings();
    threePreview.z0Pos = cur.pos; threePreview.z0Level = cur.level;
  }
}

async function exportSVG() {
  if (!state.shape || !state.boxType) return;
  // Mêmes contours que le G-code et la simulation (cloisons, couvercle, face 2 comprises)
  const drawing = state.boxType.getDrawing
    ? state.boxType.getDrawing(state.shape, state.boxParams, getMachineParams())
    : [{ pts: state.shape.getContourPoints(), face: 1, outer: true }];
  const svg = buildFabricationSVG(drawing, t);
  if (!svg) return;

  const name = `boxgen_${state.shapeKey}_${state.boxTypeKey}.svg`;
  if (window.electronAPI) {
    const res = await window.electronAPI.saveSVG({ content: svg, defaultName: name });
    if (res.success) showNotif(t('notif.svg_saved', { path: res.path }));
  }
}

// ─── Utilitaires ─────────────────────────────────────────────────────────────
function escHtml(str) {
  return str.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');
}

function showWarnConfirm(title, htmlMsg) {
  return new Promise(resolve => {
    // Backdrop propre qui bloque les clics sur la modale en arrière-plan
    const backdrop = document.createElement('div');
    Object.assign(backdrop.style, {
      position: 'fixed', inset: '0', zIndex: '10000', background: 'rgba(0,0,0,.45)'
    });
    const dlg = document.createElement('div');
    dlg.className = 'warn-dialog';
    dlg.innerHTML = `
      <div class="warn-dialog-header">
        <span class="warn-dialog-icon">⚠</span>
        <span class="warn-dialog-title">${title}</span>
      </div>
      <div class="warn-dialog-msg">${htmlMsg}</div>
      <div class="warn-dialog-actions">
        <button class="btn btn-secondary" id="warn-cancel">${t('dialog.btn_cancel')}</button>
        <button class="btn btn-accent"    id="warn-ok">${t('dialog.btn_continue')}</button>
      </div>`;
    backdrop.appendChild(dlg);
    document.body.appendChild(backdrop);
    const cleanup = val => { backdrop.remove(); resolve(val); };
    dlg.querySelector('#warn-cancel').addEventListener('click', () => cleanup(false));
    dlg.querySelector('#warn-ok').addEventListener('click',     () => cleanup(true));
  });
}

function showNotif(msg) {
  const el = document.createElement('div');
  el.textContent = msg;
  Object.assign(el.style, {
    position: 'fixed', bottom: '20px', right: '20px',
    background: 'var(--accent)', color: 'var(--on-accent)', padding: '8px 14px',
    borderRadius: '6px', fontWeight: '600', zIndex: 9999,
    fontSize: '12px', boxShadow: '0 2px 12px rgba(0,0,0,.4)'
  });
  document.body.appendChild(el);
  setTimeout(() => el.remove(), 3000);
}

// ─── Start ───────────────────────────────────────────────────────────────────
init();