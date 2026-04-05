// ─── Imports ──────────────────────────────────────────────────────────────
import { t, setLang, currentLang } from './modules/i18n.js';
import { ThreePreview }   from './modules/preview/ThreePreview.js';
import { TechnicalView }  from './modules/preview/TechnicalView.js';
import { Rectangle }      from './modules/shapes/Rectangle.js';
import { Circle }         from './modules/shapes/Circle.js';
import { Oval }           from './modules/shapes/Oval.js';
import { Hexagon }        from './modules/shapes/Hexagon.js';
import { Polygon }        from './modules/shapes/Polygon.js';
import { Bean }           from './modules/shapes/Bean.js';
import { OpenTray }       from './modules/boxes/OpenTray.js';
import { FingerJointBox } from './modules/boxes/FingerJointBox.js';
import { LidBox }         from './modules/boxes/LidBox.js';
import { StackableBox }   from './modules/boxes/StackableBox.js';
import { showHelpModal }  from './modules/HelpModal.js';

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
  hexagon:   Hexagon,
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
  view:       '3d'  // '3d' | 'tech'
};

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

// ─── i18n — mise à jour des éléments statiques du DOM ──────────────────────
function updateI18n() {
  document.querySelectorAll('[data-i18n]').forEach(el => {
    el.textContent = t(el.dataset.i18n);
  });
  document.querySelectorAll('[data-i18n-title]').forEach(el => {
    el.title = t(el.dataset.i18nTitle);
  });
  // Sync le sélecteur de langue avec la langue courante
  const switcher = document.getElementById('lang-switcher');
  if (switcher) switcher.value = currentLang();
}

// ─── Init ──────────────────────────────────────────────────────────────────
function init() {
  applyTheme(localStorage.getItem('theme') !== 'dark');
  selectShape('rectangle');
  selectBoxType('open-tray');
  bindEvents();
  updateI18n();
  resizeCanvases();
  updatePreview();
  const v = window.electronAPI?.version;
  if (v) document.title = `Box Generator - CNC v${v}`;
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
      document.querySelectorAll('.view-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      state.view = btn.dataset.view;
      canvas2d.classList.toggle('hidden', state.view !== '3d');
      canvas3d.classList.toggle('hidden', state.view !== 'tech');
      document.getElementById('toolbar-3d').classList.toggle('hidden', state.view !== '3d');
      updateBoxNameOverlay();
      updatePreview();
    });
  });

  // Z0 position (XY)
  document.querySelectorAll('.z0-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.z0-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      if (threePreview) { threePreview.z0Pos = btn.dataset.pos; updatePreview(); }
    });
  });

  // Z0 niveau (bas / haut)
  document.querySelectorAll('.z0-lvl-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.z0-lvl-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      if (threePreview) { threePreview.z0Level = btn.dataset.level; updatePreview(); }
    });
  });

  // Mode X-Ray
  document.getElementById('xray-toggle').addEventListener('change', e => {
    if (threePreview) threePreview.setXRay(e.target.checked);
  });

  // Offset brut
  document.getElementById('stock-offset').addEventListener('input', e => {
    if (threePreview) { threePreview.stockOffset = parseFloat(e.target.value) || 0; updatePreview(); }
  });

  // Côté offset brut (haut / bas)
  document.querySelectorAll('.stock-side-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.stock-side-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      if (threePreview) { threePreview.stockSide = btn.dataset.side; updatePreview(); }
    });
  });

  // Generate G-code
  document.getElementById('btn-generate').addEventListener('click', generateGCode);

  // Session save / load
  document.getElementById('btn-save-session').addEventListener('click', saveSession);
  document.getElementById('btn-load-session').addEventListener('click', loadSession);

  // Export G-code
  document.getElementById('btn-export-gcode').addEventListener('click', exportGCode);

  // Export SVG
  document.getElementById('btn-export-svg').addEventListener('click', exportSVG);

  // Aide export G-code
  document.getElementById('btn-gcode-help').addEventListener('click', () => showHelpModal(getMachineParams()));

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

  // Machine params — live update
  ['param-thickness','param-tool-diameter','param-passes','param-feedrate','param-plunge','param-spindle','param-safe-z'].forEach(id => {
    document.getElementById(id).addEventListener('input', () => { updateRabbetToolWarning(); updatePreview(); });
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
    } else if (d.options) {
      // ── Param de type sélecteur (ex: rabbetSide) ──────────────────────────
      const currentVal = state.boxParams[d.id] ?? d.options[0].value;
      const opts = d.options.map(o =>
        `<option value="${o.value}"${o.value == currentVal ? ' selected' : ''}>${t(o.label)}</option>`
      ).join('');
      row.innerHTML = `
        <label title="${t(d.label)}" style="grid-column:1/4">${t(d.label)}</label>
        <select data-param="${d.id}" style="grid-column:1/4;background:#1a1a3a;color:#c0c4e0;border:1px solid #3a3a6a;border-radius:4px;padding:3px 6px;font-size:11px;">${opts}</select>
      `;
      row.style.gridTemplateColumns = '1fr';
      row.querySelector('select').addEventListener('change', e => {
        state.boxParams[d.id] = parseInt(e.target.value);
        updateRabbetToolWarning();
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
      row.querySelector('input').addEventListener('input', e => {
        if (d.readonly) return;
        const val = parseFloat(e.target.value);
        if (state.shape.params.hasOwnProperty(d.id)) {
          state.shape.updateParam(d.id, val);
          // Synchronise les inputs liés (ex: longueur/largeur/côté de l'hexagone)
          for (const [pid, pval] of Object.entries(state.shape.params)) {
            const inp = document.querySelector(`[data-param="${pid}"]`);
            if (inp && inp !== e.target) inp.value = typeof pval === 'number' ? +pval.toFixed(2) : pval;
          }
          updateShapeInputWarnings();
          updateFingerJointWarnings();
        } else {
          state.boxParams[d.id] = val;
        }
        updateBeanRatio();
        updatePinDepthWarning();
        updateRabbetToolWarning();
        updateFingerJointWarnings();
        updatePreview();
      });
      if (d.note) {
        const noteEl = document.createElement('div');
        noteEl.className = 'param-note';
        noteEl.textContent = d.note;
        row.appendChild(noteEl);
      }
    }

    paramsContainer.appendChild(row);
  }
  updateBeanRatio();
  updatePinDepthWarning();
  updateRabbetToolWarning();
  updateFingerJointWarnings();
}

function updatePinDepthWarning() {
  const el = document.querySelector('[data-param="pinDepth"]');
  if (!el) return;
  const pinDepth  = parseFloat(el.value) || 0;
  const height    = state.boxParams.height    ?? 40;
  const rimHeight = state.boxParams.rimHeight ?? 8;
  const brut      = height + rimHeight;
  const warn      = pinDepth > 0 && pinDepth > brut;
  el.classList.toggle('input-warn', warn);
  el.title = warn
    ? `⚠ Prof. > brut (${brut}mm) : le trou pénètre dans le martyre pour loger les goupilles de repositionnement`
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
      el.title = val ? t(key, { ratio: val }) : t(key);
    } else {
      el.title = '';
    }
  }
}

function updateRabbetToolWarning() {
  const el = document.querySelector('[data-param="rabbet"]');
  if (!el) return;
  const rabbetSide = state.boxParams.rabbetSide ?? 0;
  if (rabbetSide !== 1) { el.classList.remove('input-warn'); el.title = ''; return; }
  const rabbet    = parseFloat(el.value) || 0;
  const clearance = state.boxParams.clearance ?? 0.3;
  const td        = parseFloat(document.getElementById('param-tool-diameter').value) || 0;
  const ringW     = rabbet + clearance;
  const warn      = td > ringW;
  el.classList.toggle('input-warn', warn);
  el.title = warn ? t('warn.tool_too_large', { td, ringW: ringW.toFixed(1) }) : '';
}

function updateFingerJointWarnings() {
  const el = document.querySelector('[data-param="fingerWidth"]');
  if (!el) return;
  const fw = parseFloat(el.value) || 10;
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
    if (tw <= thick * 1.5) {
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
  const warn  = ratio < 0.5 || ratio > 1.5;
  el.value = ratio.toFixed(2);
  el.title = warn ? t('warn.bean_ratio') : '';
  el.classList.toggle('input-warn', warn);
}

// ─── Box type selection ─────────────────────────────────────────────────────
function selectBoxType(key) {
  state.boxTypeKey = key;
  document.querySelectorAll('.box-type-btn').forEach(b => b.classList.toggle('active', b.dataset.type === key));
  state.boxType = new BOX_TYPES[key]();

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
    materialThickness: parseFloat(document.getElementById('param-thickness').value),
    toolDiameter:      parseFloat(document.getElementById('param-tool-diameter').value),
    depthPerPass:      parseFloat(document.getElementById('param-passes').value),
    passes:            Math.max(1, Math.ceil(parseFloat(document.getElementById('param-thickness').value) /
                         parseFloat(document.getElementById('param-passes').value))),
    feedrate:          parseFloat(document.getElementById('param-feedrate').value),
    plungeRate:        parseFloat(document.getElementById('param-plunge').value),
    spindleSpeed:      parseFloat(document.getElementById('param-spindle').value),
    safeZ:             parseFloat(document.getElementById('param-safe-z').value)
  };
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
  if (state.view === '3d') {
    if (!threePreview) {
      threePreview = new ThreePreview(canvas2d);
      threePreview.setTheme(document.documentElement.dataset.theme === 'light');
      const area = document.querySelector('.preview-area');
      threePreview.resize(area.clientWidth, area.clientHeight);
    }
    if (state.shape) {
      const bb = state.shape.getBoundingBox();
      threePreview.build(state.shape.getContourPoints(), bb, state.boxTypeKey, state.boxParams, getMachineParams());
    }
  } else if (state.view === 'tech') {
    if (!technicalView) {
      technicalView = new TechnicalView(canvas3d, onTechParamChange);
      technicalView.setTheme(document.documentElement.dataset.theme === 'light');
      const area = document.querySelector('.preview-area');
      technicalView.resize(area.clientWidth, area.clientHeight);
    }
    if (state.shape) {
      technicalView.build(state.shape, state.boxTypeKey, state.boxParams, getMachineParams(), state.boxType);
    }
  }
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


function updateInfoBar() {
  if (!state.shape) return;
  const bb = state.shape.getBoundingBox();
  const h  = state.boxParams.height ?? 30;

  // Brut = hauteur de la pièce la plus haute + offset brut
  // Pour finger-joint : brut = épaisseur des panneaux (pas la hauteur de la boîte)
  // Pour lid-box : corps et couvercle taillés dans la même planche → épaisseur = max(height, lidHeight)
  const totalH = state.boxTypeKey === 'finger-joint'
    ? (state.boxParams.thickness ?? 6)
    : state.boxTypeKey === 'lid-box'
      ? Math.max(h, state.boxParams.lidHeight ?? 15)
      : state.boxTypeKey === 'stackable'
        ? h + (state.boxParams.rimHeight ?? 8)
        : h;
  const stockOffset = parseFloat(document.getElementById('stock-offset').value) || 0;
  document.getElementById('param-thickness').value = (totalH + stockOffset).toFixed(1);
  infoDims.textContent = `${bb.width.toFixed(1)} × ${bb.height.toFixed(1)} × ${h.toFixed(1)} mm`;
  const area = (bb.width * bb.height / 100).toFixed(1);
  infoArea.textContent = `${t('info.surface')}: ${area} cm²`;

  // Taille plaque conseillée
  {
    const bb2    = state.shape.getBoundingBox();
    const W      = bb2.width, D = bb2.height;
    const margin = 20;
    const gap    = 20;
    let sw = 0, sh = 0;

    if (state.boxTypeKey === 'finger-joint') {
      // 5 panneaux : 2 colonnes × 3 rangées (fond / avant+arr / côtés)
      // sw = 2×W + gap + 2×margin
      // sh = D + 2×H + 2×gap + 2×margin
      const H = state.boxParams.height ?? 40;
      sw = Math.ceil(2 * W + gap + 2 * margin);
      sh = Math.ceil(D + 2 * H + 2 * gap + 2 * margin);

    } else if (state.boxTypeKey === 'open-tray') {
      // 1 seule pièce
      sw = Math.ceil(W + 2 * margin);
      sh = Math.ceil(D + 2 * margin);

    } else if (state.boxTypeKey === 'lid-box') {
      const hBody = state.boxParams.height    ?? 40;
      const hLid  = state.boxParams.lidHeight ?? 15;
      if (hBody !== hLid) {
        // Hauteurs différentes → 2 bruts séparés (1 par pièce)
        const p = Math.ceil(W + 2 * margin);
        const q = Math.ceil(D + 2 * margin);
        infoSheet.textContent = `${t('info.sheet_size')} : 2× ${p} × ${q} mm`;
        infoSheet.classList.remove('hidden');
        sw = -1; // déjà affiché, skip le bloc commun
      } else {
        // Même hauteur → 2 pièces sur 1 brut, même logique que le G-code
        const useVertical = Math.max(W, 2 * D + gap) < Math.max(2 * W + gap, D);
        if (useVertical) {
          sw = Math.ceil(W + 2 * margin);
          sh = Math.ceil(2 * D + gap + 2 * margin);
        } else {
          sw = Math.ceil(2 * W + gap + 2 * margin);
          sh = Math.ceil(D + 2 * margin);
        }
      }

    } else if (state.boxTypeKey === 'stackable') {
      // 1 pièce + 2 trous de centrage latéraux hors contour
      const regHoleDia    = state.boxParams.regHoleDia    ?? 6;
      const regHoleOffset = state.boxParams.regHoleOffset ?? 15;
      sw = Math.ceil(W + regHoleDia + 2 * regHoleOffset + 2 * margin);
      sh = Math.ceil(D + 2 * margin);
    }

    if (sw === -1) {
      // déjà affiché (cas lid-box hauteurs différentes)
    } else if (sw > 0 && sh > 0) {
      infoSheet.textContent = `${t('info.sheet_size')} : ${sw} × ${sh} mm`;
      infoSheet.classList.remove('hidden');
    } else {
      infoSheet.classList.add('hidden');
    }
  }
}

// ─── G-code generation ──────────────────────────────────────────────────────
function generateGCode() {
  if (!state.shape || !state.boxType) return;
  const machine = getMachineParams();
  const z0      = getZ0Settings();
  const origin  = computeOrigin(z0, machine);
  const code = state.boxType.generateGCode(state.shape, state.boxParams, { ...machine, ...origin, pocketConc: true });
  renderGCode(code);
}

function renderGCode(code) {
  const lines = code.split('\n');
  const highlighted = lines.map(line => {
    const l = line.trim();
    if (l.startsWith(';'))                          return `<span class="gc-comment">${escHtml(line)}</span>`;
    if (l.startsWith('G0'))                         return `<span class="gc-rapid">${escHtml(line)}</span>`;
    if (l.startsWith('G1'))                         return `<span class="gc-move">${escHtml(line)}</span>`;
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
  const rawCode = gcodeOutput.textContent.trim();
  if (!rawCode) return;
  const sections = parseGCodeSections(rawCode);
  showExportModal(sections, getMachineParams());
}

// Découpe le G-code en sections identifiées par les marqueurs ; ─── ... ───
function parseGCodeSections(code) {
  const lines = code.split('\n');
  const SEP_RE = /^; ─{3,}\s+(.+?)\s+─{3,}/;
  const sections = [];
  let headerLines = [];
  let currentSec = null;
  let pastHeader = false;

  for (const line of lines) {
    const m = line.match(SEP_RE);
    if (m) {
      if (!pastHeader) {
        sections.push({ label: t('modal.header_section'), lines: headerLines, required: true });
        pastHeader = true;
      }
      if (currentSec) sections.push(currentSec);
      currentSec = { label: m[1].trim(), lines: [line], required: false };
    } else if (!pastHeader) {
      headerLines.push(line);
    } else if (currentSec) {
      currentSec.lines.push(line);
    }
  }
  if (currentSec) sections.push(currentSec);

  // Extrait le pied de programme (M5 / M30) de la dernière section optionnelle
  const lastOp = sections[sections.length - 1];
  if (lastOp && !lastOp.required) {
    let footerStart = -1;
    for (let i = lastOp.lines.length - 1; i >= 0; i--) {
      if (lastOp.lines[i].trim().startsWith('M5')) {
        footerStart = i;
        while (footerStart > 0 && lastOp.lines[footerStart - 1].trim() === '') footerStart--;
        break;
      }
    }
    if (footerStart >= 0) {
      const footerLines = lastOp.lines.splice(footerStart);
      sections.push({ label: t('modal.footer_section'), lines: footerLines, required: true });
    }
  }

  return sections;
}

function showExportModal(sections, machine = {}) {
  const optional = sections.filter(s => !s.required);
  // Valeurs par défaut calculées depuis les paramètres machine réels
  const td      = machine.toolDiameter      ?? 3.175;
  const defRamp   = Math.max(1, (td * 2).toFixed(1) * 1);      // 2 × ⌀outil
  const defHelixR = Math.max(0.5, (td * 0.6).toFixed(2) * 1);  // 0.6 × ⌀outil
  const defLeadR  = Math.max(0.5, (td * 0.8).toFixed(2) * 1);  // 0.8 × ⌀outil

  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';

  const modal = document.createElement('div');
  modal.className = 'export-modal';
  const opsKey = optional.length === 1 ? 'modal.ops_one' : 'modal.ops_other';
  modal.innerHTML = `
    <h3>${t('modal.export_title')}</h3>
    <div class="entry-section">
      <div class="entry-row">
        <span class="entry-lbl">${t('modal.entry_tool')}</span>
        <div class="entry-mode-btns">
          <button class="entry-mode-btn active" data-mode="plunge" data-tip="${t('modal.tip_plunge')}">${t('modal.plunge')}</button>
          <button class="entry-mode-btn" data-mode="ramp" data-tip="${t('modal.tip_ramp')}">${t('modal.ramp')}</button>
          <button class="entry-mode-btn" data-mode="helix" data-tip="${t('modal.tip_helix')}">${t('modal.helix')}</button>
        </div>
      </div>
      <div class="entry-fields" id="modal-entry-fields">
        <span class="entry-field-group" id="entry-ramp-fields" style="display:none">
          <span class="tab-f-lbl" data-tip="${t('modal.tip_ramp_len', { val: (td*2).toFixed(1) })}">${t('modal.ramp_length')}</span>
          <input type="number" id="modal-ramp-len" class="tab-input" value="${defRamp}" min="1" max="50" step="0.5">
          <span class="tab-f-unit">mm</span>
        </span>
        <span class="entry-field-group" id="entry-helix-fields" style="display:none">
          <span class="tab-f-lbl" data-tip="${t('modal.tip_helix_r', { val: (td*0.6).toFixed(2) })}">${t('modal.radius')}</span>
          <input type="number" id="modal-helix-r" class="tab-input" value="${defHelixR}" min="0.5" max="20" step="0.5">
          <span class="tab-f-unit">mm</span>
          <span class="tab-f-lbl" data-tip="${t('modal.tip_helix_turns')}">${t('modal.turns')}</span>
          <input type="number" id="modal-helix-turns" class="tab-input" value="1" min="1" max="5" step="1">
        </span>
      </div>
      <div class="entry-row" style="margin-top:6px">
        <label class="entry-lead-row" data-tip="${t('modal.tip_leadin')}">
          <input type="checkbox" id="modal-leadin-on">
          <span class="tab-f-lbl">${t('modal.leadin')}</span>
        </label>
        <span class="entry-lead-fields" id="modal-leadin-fields" style="opacity:.4;pointer-events:none">
          <span class="tab-f-lbl" data-tip="${t('modal.tip_leadin_r', { val: (td*0.8).toFixed(2) })}">${t('modal.radius')}</span>
          <input type="number" id="modal-leadin-r" class="tab-input" value="${defLeadR}" min="0.5" max="20" step="0.5">
          <span class="tab-f-unit">mm</span>
        </span>
      </div>
    </div>
    <div class="tabs-section">
      <label class="tabs-toggle-row">
        <input type="checkbox" id="modal-tabs-on" checked>
        <span>${t('modal.tabs_label')}</span>
      </label>
      <div class="tabs-fields" id="modal-tabs-fields">
        <span class="tab-f-lbl">${t('modal.tab_count')}</span>
        <input type="number" id="modal-tab-count"  class="tab-input" value="4"   min="1"   max="12"  step="1">
        <span class="tab-f-lbl">${t('modal.tab_width')}</span>
        <input type="number" id="modal-tab-width"  class="tab-input" value="4"   min="1"   max="20"  step="0.5">
        <span class="tab-f-unit">mm</span>
        <span class="tab-f-lbl">${t('modal.tab_height')}</span>
        <input type="number" id="modal-tab-height" class="tab-input" value="1.5" min="0.5" max="10"  step="0.5">
        <span class="tab-f-unit">mm</span>
      </div>
    </div>
    <div class="pocket-section">
      <div class="pocket-title">${t('modal.pocket_strategy')}</div>
      <div class="pocket-strategy-row">
        <label class="tabs-toggle-row" data-tip="${t('modal.tip_concentric')}">
          <input type="checkbox" id="modal-pocket-conc">
          <span>${t('modal.concentric')}</span>
        </label>
        <span class="entry-lbl pocket-raster-lbl" data-tip="${t('modal.tip_raster')}">${t('modal.raster')}</span>
      </div>
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
  const tabsOnCbStats   = modal.querySelector('#modal-tabs-on');
  const pocketConcStats = modal.querySelector('#modal-pocket-conc');

  const updateModalStats = () => {
    const tabOpts = tabsOnCbStats.checked ? {
      count:  parseInt(modal.querySelector('#modal-tab-count').value),
      width:  parseFloat(modal.querySelector('#modal-tab-width').value),
      height: parseFloat(modal.querySelector('#modal-tab-height').value)
    } : null;
    const entryMode = modal.querySelector('.entry-mode-btn.active')?.dataset.mode ?? 'plunge';
    const entryOpts = {
      entry:      entryMode,
      rampLen:    parseFloat(modal.querySelector('#modal-ramp-len').value),
      helixR:     parseFloat(modal.querySelector('#modal-helix-r').value),
      helixTurns: parseInt(modal.querySelector('#modal-helix-turns').value),
      leadIn:     modal.querySelector('#modal-leadin-on').checked
                    ? parseFloat(modal.querySelector('#modal-leadin-r').value) : false,
    };
    const machine = getMachineParams();
    const z0      = getZ0Settings();
    const origin  = computeOrigin(z0, machine);
    const fc = state.boxType.generateGCode(
      state.shape, state.boxParams,
      { ...machine, ...origin, tabOpts, entryOpts, pocketConc: pocketConcStats.checked }
    );
    const fSections = parseGCodeSections(fc);
    const sel = new Set();
    list.querySelectorAll('input[type=checkbox]').forEach(cb => { if (cb.checked) sel.add(parseInt(cb.dataset.idx)); });
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
  modal.querySelector('#modal-tabs-on').addEventListener('change', updateModalStats);
  modal.querySelector('#modal-pocket-conc').addEventListener('change', updateModalStats);
  modal.querySelectorAll('.entry-mode-btn').forEach(b => b.addEventListener('click', () => setTimeout(updateModalStats, 0)));

  // Applique l'état initial des tabs sur les labels (tabs coché par défaut)
  list.querySelectorAll('.sec-label').forEach(lbl => {
    if (lbl.textContent.toLowerCase().includes('outside'))
      lbl.textContent = lbl.textContent.replace('outside)', 'outside + tabs)');
  });

  // Concentrique coché par défaut + mise à jour labels
  // La prévisualisation est générée avec pocketConc:true → labels du type
  // "Pocket spirale (N anneaux...)" ou "Pocket (...)" → on normalise tout en "Pocket concentrique"
  modal.querySelector('#modal-pocket-conc').checked = true;
  list.querySelectorAll('.sec-label').forEach(lbl => {
    lbl.textContent = lbl.textContent
      .replace(/Pocket spirale \([^)]*\)/, t('modal.pocket_conc_label'))
      .replace(/Pocket \([^)]*\)/,         t('modal.pocket_conc_label'))
      .replace('Pocket raster',            t('modal.pocket_conc_label'));
  });

  // Toggle tabs fields enabled/disabled
  // ── Entry mode buttons ──────────────────────────────────────────────────
  let selectedEntry = 'plunge';
  modal.querySelectorAll('.entry-mode-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      modal.querySelectorAll('.entry-mode-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      selectedEntry = btn.dataset.mode;
      modal.querySelector('#entry-ramp-fields').style.display  = selectedEntry === 'ramp'  ? '' : 'none';
      modal.querySelector('#entry-helix-fields').style.display = selectedEntry === 'helix' ? '' : 'none';
    });
  });

  // ── Lead-in toggle ───────────────────────────────────────────────────────
  const leadInCb     = modal.querySelector('#modal-leadin-on');
  const leadInFields = modal.querySelector('#modal-leadin-fields');
  leadInCb.addEventListener('change', () => {
    leadInFields.style.opacity      = leadInCb.checked ? '1'    : '.4';
    leadInFields.style.pointerEvents = leadInCb.checked ? 'auto' : 'none';
  });

  const tabsOnCb   = modal.querySelector('#modal-tabs-on');
  const tabsFields = modal.querySelector('#modal-tabs-fields');
  tabsOnCb.addEventListener('change', () => {
    tabsFields.classList.toggle('disabled', !tabsOnCb.checked);
    list.querySelectorAll('.sec-label').forEach(lbl => {
      if (!lbl.textContent.toLowerCase().includes('outside')) return;
      lbl.textContent = tabsOnCb.checked
        ? lbl.textContent.replace('outside)', 'outside + tabs)')
                         .replace('outside + tabs + tabs)', 'outside + tabs)')
        : lbl.textContent.replace('outside + tabs)', 'outside)');
    });
  });

  const pocketConcCb = modal.querySelector('#modal-pocket-conc');
  // Met à jour les labels de poche dans la liste quand la stratégie change
  pocketConcCb.addEventListener('change', () => {
    list.querySelectorAll('.sec-label').forEach(lbl => {
      lbl.textContent = lbl.textContent
        .replace(t('modal.pocket_raster_label'), pocketConcCb.checked ? t('modal.pocket_conc_label') : t('modal.pocket_raster_label'))
        .replace(t('modal.pocket_conc_label'),   pocketConcCb.checked ? t('modal.pocket_conc_label') : t('modal.pocket_raster_label'));
    });
  });

  updateModalStats();

  const close = () => overlay.remove();
  modal.querySelector('#modal-cancel').addEventListener('click', close);
  overlay.addEventListener('click', e => { if (e.target === overlay) close(); });

  modal.querySelector('#modal-do-export').addEventListener('click', async () => {
    const selected = new Set();
    list.querySelectorAll('input[type=checkbox]').forEach(cb => {
      if (cb.checked) selected.add(parseInt(cb.dataset.idx));
    });
    if (selected.size === 0) { showNotif(t('notif.no_ops')); return; }

    // Paramètres entrée outil
    const entryOpts = {
      entry:      selectedEntry,
      rampLen:    parseFloat(modal.querySelector('#modal-ramp-len').value),
      helixR:     parseFloat(modal.querySelector('#modal-helix-r').value),
      helixTurns: parseInt(modal.querySelector('#modal-helix-turns').value),
      leadIn:     leadInCb.checked ? parseFloat(modal.querySelector('#modal-leadin-r').value) : false,
    };

    // Paramètres tabs depuis la modale
    const tabOpts = tabsOnCb.checked ? {
      count:  parseInt(modal.querySelector('#modal-tab-count').value),
      width:  parseFloat(modal.querySelector('#modal-tab-width').value),
      height: parseFloat(modal.querySelector('#modal-tab-height').value)
    } : null;

    // Re-génère le G-code avec les options définitives, puis filtre les sections
    const machine = getMachineParams();
    const z0      = getZ0Settings();
    const origin  = computeOrigin(z0, machine);
    const finalCode = state.boxType.generateGCode(
      state.shape, state.boxParams, { ...machine, ...origin, tabOpts, entryOpts, pocketConc: pocketConcCb.checked }
    );
    const finalSections = parseGCodeSections(finalCode);

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
        const lidCode = state.boxType.generateGCode(
          state.shape, state.boxParams,
          { ...machine, ...lidOrigin, tabOpts, entryOpts, pocketConc: pocketConcCb.checked, lidAtOrigin: true }
        );
        sectionsForExport = parseGCodeSections(lidCode);
      } else if (!lidSelected) {
        // Corps seul : recentre sur le corps uniquement
        const bodyOrigin = computeOrigin(z0, { ...machine, lidAtOrigin: true });
        const bodyCode = state.boxType.generateGCode(
          state.shape, state.boxParams,
          { ...machine, ...bodyOrigin, tabOpts, entryOpts, pocketConc: pocketConcCb.checked }
        );
        sectionsForExport = parseGCodeSections(bodyCode);
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
async function saveSession() {
  if (!state.shape || !state.boxType) return;

  const session = {
    version:       1,
    shapeKey:      state.shapeKey,
    boxTypeKey:    state.boxTypeKey,
    shapeParams:   { ...state.shape.params },
    boxParams:     { ...state.boxParams },
    machineParams: getMachineParams(),
    z0:            getZ0Settings(),
  };

  const defaultName = `boxgen_${state.boxTypeKey}_${state.shapeKey}.json`;
  await window.electronAPI.saveSession({ content: JSON.stringify(session, null, 2), defaultName });
}

async function loadSession() {
  const result = await window.electronAPI.loadSession();
  if (!result.success) return;

  let session;
  try { session = JSON.parse(result.content); } catch { return; }

  // Restaure type de boîte et forme
  selectBoxType(session.boxTypeKey ?? 'open-tray');
  selectShape(session.shapeKey ?? 'rectangle');

  // Restaure params forme directement dans state.shape.params
  if (session.shapeParams) {
    Object.entries(session.shapeParams).forEach(([k, v]) => {
      if (state.shape.params.hasOwnProperty(k)) state.shape.updateParam(k, v);
    });
    renderShapeParams();
  }

  // Restaure params boîte puis reconstruit l'UI entière (checkboxes incluses)
  if (session.boxParams) {
    state.boxParams = { ...session.boxParams };
    renderShapeParams();
  }

  // Restaure params machine
  if (session.machineParams) {
    const mp = session.machineParams;
    const set = (id, val) => { const el = document.getElementById(id); if (el) el.value = val; };
    set('param-thickness',    mp.materialThickness);
    set('param-tool-diameter',mp.toolDiameter);
    set('param-passes',       session.depthPerPass ?? mp.depthPerPass);
    set('param-feedrate',     mp.feedrate);
    set('param-plunge',       mp.plungeRate);
    set('param-spindle',      mp.spindleSpeed);
    set('param-safe-z',       mp.safeZ);
  }

  // Restaure Z0
  if (session.z0) {
    document.querySelectorAll('.z0-btn').forEach(b => b.classList.toggle('active', b.dataset.pos === session.z0.pos));
    document.querySelectorAll('.z0-lvl-btn').forEach(b => b.classList.toggle('active', b.dataset.level === session.z0.level));
  }

  updatePreview();
  updateInfoBar();
}

async function exportSVG() {
  if (!state.shape || !state.boxType) return;
  const panels = state.boxType.getFlatPanels(state.shape, state.boxParams);
  let maxX = 0, maxY = 0;
  for (const p of panels) { maxX = Math.max(maxX, p.x + p.width); maxY = Math.max(maxY, p.y + p.height); }

  // Normalise un path absolu en relatif (soustrait dx,dy) — seulement si le path utilise des coords absolues
  const normPath = (path, dx, dy) => {
    const m = path.match(/M(-?\d+\.?\d*),(-?\d+\.?\d*)/);
    if (!m) return path;
    const firstX = parseFloat(m[1]), firstY = parseFloat(m[2]);
    // Si le path commence déjà près de (0,0), il est déjà relatif → pas de normalisation
    if (Math.abs(firstX) < 1 && Math.abs(firstY) < 1) return path;
    return path.replace(/(-?\d+\.?\d*),(-?\d+\.?\d*)/g,
      (_, x, y) => `${(parseFloat(x) - dx).toFixed(3)},${(parseFloat(y) - dy).toFixed(3)}`);
  };

  const label = p => p.label.startsWith('panel.') ? t(p.label) : p.label;

  const svgParts = panels.map(p =>
    `<g transform="translate(${p.x},${p.y})">
      <path d="${normPath(p.path, p.x, p.y)}" fill="${hexToRgba(p.color, 0.15)}" stroke="${p.color}" stroke-width="0.5"/>
      <text x="${p.width / 2}" y="${p.height / 2}" text-anchor="middle" dominant-baseline="middle" fill="${p.color}" font-size="6" font-family="sans-serif">${label(p)}</text>
    </g>`
  ).join('\n');

  const bg = document.documentElement.dataset.theme === 'light' ? '#ffffff' : '#0f0f1a';
  const svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${maxX} ${maxY}" width="${maxX}mm" height="${maxY}mm">
  <rect width="${maxX}" height="${maxY}" fill="${bg}"/>
${svgParts}
</svg>`;

  const name = `boxgen_${state.shapeKey}_${state.boxTypeKey}.svg`;
  if (window.electronAPI) {
    const res = await window.electronAPI.saveSVG({ content: svg, defaultName: name });
    if (res.success) showNotif(t('notif.svg_saved', { path: res.path }));
  }
}

// ─── Utilitaires ─────────────────────────────────────────────────────────────
function hexToRgba(hex, alpha) {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r},${g},${b},${alpha})`;
}

function escHtml(str) {
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
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
    background: '#4affcc', color: '#000', padding: '8px 14px',
    borderRadius: '6px', fontWeight: '600', zIndex: 9999,
    fontSize: '12px', boxShadow: '0 2px 12px rgba(0,0,0,.4)'
  });
  document.body.appendChild(el);
  setTimeout(() => el.remove(), 3000);
}

// ─── Start ───────────────────────────────────────────────────────────────────
init();