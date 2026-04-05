/** Traductions françaises — BoxGenerator */
export const fr = {
  // ── Modèles de boîtes ───────────────────────────────────────────────────
  box: {
    open_tray:       'Plateau ouvert',
    open_tray_short: 'Ouverte',
    finger_joint:       'Boîte encoches',
    finger_joint_short: 'Encoches',
    lid_box:       'Boîte couvercle',
    lid_box_short: 'Couvercle',
    stackable:       'Boîte empilable',
    stackable_short: 'Empilable',
  },

  // ── Panneaux SVG ────────────────────────────────────────────────────────
  panel: {
    bottom: 'Fond',
    top:    'Couvercle',
    front:  'Façade',
    back:   'Arrière',
    left:   'Gauche',
    right:  'Droite',
  },

  // ── Formes du contour ───────────────────────────────────────────────────
  shape: {
    rectangle: 'Rectangle',
    circle:    'Cercle',
    oval:      'Ovale',
    hexagon:   'Hexagone',
    polygon:   'Polygone',
    bean:      'Haricot',
  },

  // ── Paramètres formes ───────────────────────────────────────────────────
  param: {
    length:         'Longueur',
    width:          'Largeur',
    corner_radius:  'Rayon coins',
    diameter:       'Diamètre',
    sides:          'Côtés',
    rotation:       'Rotation',
    ratio_long_larg:'Ratio Long/Larg',
    ratio_larg_long:'Ratio Larg/Long',
    // ── Boîtes ──
    height:              'Hauteur',
    box_height:          'Hauteur corps',
    lid_height:          'Hauteur couvercle',
    wall_thickness:      'Épaiss. paroi',
    bottom_thickness:    'Épaiss. fond',
    bottom_body:         'Épaiss. fond corps',
    bottom_lid:          'Épaiss. fond couvercle',
    rabbet:              'Largeur feuillure',
    rabbet_depth:        'Profondeur feuillure',
    rabbet_side:         'Type de feuillure',
    clearance:           "Jeu d'assemblage",
    finger_width:        'Larg. encoche',
    mat_thickness:       'Épaiss. matière',
    with_lid:            'Avec couvercle',
    rim_height:          'Hauteur plot',
    pin_diameter:        'Ø goupille centrage',
    pin_offset:          'Dist. goupille (hors pièce)',
    pin_depth:           'Prof. trou goupille',
  },

  // ── Options select ──────────────────────────────────────────────────────
  option: {
    rabbet_interior: 'Rainure intérieure — couvercle ajusté',
    rabbet_exterior: 'Rainure extérieure — couvercle plein',
  },

  // ── Interface principale ────────────────────────────────────────────────
  ui: {
    box_model:     'Modèle de boîte',
    contour_shape: 'Forme du contour',
    dimensions:    'Dimensions',
    material_tool: 'Matière & Outil',
    stock:         'Brut',
    tool_diameter: 'Diam. fraise',
    depth_per_pass:'Prof. /passe',
    feed_xy:       'Vitesse XY',
    feed_z:        'Vitesse Z',
    spindle:       'Broche',
    safe_z:        'Survol Z',
    btn_3d:           '3D',
    btn_2d:           'Vues 2D',
    stock_offset:     'Brut +',
    gcode_panel:      'G-code',
    btn_generate:     'Générer',
    btn_save_session: 'Sauvegarder la session',
    btn_load_session: 'Ouvrir une session',
    btn_export:       'Exporter G-code',
    btn_export_short: 'G-code',
    btn_svg:          'Exporter SVG',
    btn_svg_short:    'SVG',
    btn_help:         'Aide sur Box Generator',
    gcode_placeholder: 'Cliquer sur "Générer" pour produire le G-code CNC\u2026',
  },

  // ── Barre d'info ────────────────────────────────────────────────────────
  info: {
    surface:    'Surface base',
    sheet_size: 'Plaque taille conseillée',
  },

  // ── Stats G-code ────────────────────────────────────────────────────────
  stats: {
    lines:      'Total lignes',
    lines_exec: 'Exécutables',
    lines_count: '{{n}} lignes',
  },

  // ── Warnings inline ────────────────────────────────────────────────────
  warn: {
    tool_too_large:    '⚠ Fraise Ø{{td}}mm ≥ feuillure+jeu ({{ringW}}mm) — utiliser Ø < {{ringW}}mm',
    bean_ratio:        '⚠ Ratio hors plage CNC recommandée (0.5 – 1.5)',
    hexagon_irregular: 'Hexagone irrégulier — les 6 côtés ne sont pas égaux.\nPour des côtés égaux : Ratio L/l = {{ratio}}',
    finger_too_narrow: '⚠ Encoche trop étroite ({{tw}}mm) pour l\'épaisseur matière ({{t}}mm) — augmenter la largeur d\'encoche',
    finger_too_few:    '⚠ Aucune encoche possible sur ce bord ({{L}}mm) — réduire la largeur d\'encoche',
  },

  // ── Labels opérations G-code ────────────────────────────────────────────
  gcode: {
    op_cavity:          'Cavité intérieure',
    op_outer_wall:      'Paroi extérieure',
    op_body_rabbet:     'Corps — feuillure',
    op_body_rabbet_ext: 'Corps — feuillure extérieure',
    op_body_cavity:     'Corps — cavité intérieure',
    op_body_contour:    'Corps — contour extérieur',
    op_lid_cavity:      'Couvercle — cavité intérieure',
    op_lid_contour:     'Couvercle — contour extérieur',
    op_lid_rabbet_pocket:'Feuillure couvercle — poche (cas extérieur)',
    op_rim_mill:        'Fraisage plot',
    op_outer_contour:   'Contour extérieur',
    op_pin_left:        'Trou centrage gauche Ø{{d}}mm',
    op_pin_right:       'Trou centrage droit Ø{{d}}mm',
  },

  // ── Modale export ───────────────────────────────────────────────────────
  modal: {
    export_title:  'Exporter G-code',
    entry_tool:    'Entrée outil',
    plunge:        'Plongée',
    ramp:          'Rampe',
    helix:         'Hélice',
    ramp_length:   'Longueur rampe',
    radius:        'Rayon',
    turns:         'Tours',
    leadin:        'Lead-in / Lead-out (arc tangentiel)',
    tabs_label:    'Tabs de maintien sur les contours',
    tab_count:     'Nombre',
    tab_width:     'Largeur',
    tab_height:    'Hauteur',
    pocket_strategy:  'Stratégie poche',
    concentric:       'Concentrique (défaut)',
    raster:           'Raster (zig-zag) si décoché',
    ops_one:          '{{count}} opération — cochez ce que vous voulez exporter :',
    ops_other:        '{{count}} opérations — cochez ce que vous voulez exporter :',
    select_all:       'Tout cocher',
    select_none:      'Tout décocher',
    n_lines:          '{{n}} lignes',
    cancel:           'Annuler',
    do_export:        'Exporter la sélection',
    header_section:   'En-tête & initialisation',
    footer_section:   'Fin du programme',
    pocket_conc_label:'Pocket concentrique',
    pocket_raster_label: 'Pocket raster zig-zag',
    tip_plunge:      'Plongée directe verticale.\nL\'outil descend en Z à la profondeur de passe avant de commencer le contour.\nSimple et rapide, mais sollicite l\'arête frontale de l\'outil.',
    tip_ramp:        'Rampe linéaire (ramp-in).\nL\'outil descend progressivement le long du premier segment.\nDéfaut : 2 × Ø outil — réduit la contrainte axiale sur la fraise.',
    tip_helix:       'Hélice d\'entrée (helix-in).\nL\'outil décrit une spirale descendante avant d\'attaquer le contour.\nIdéal pour les fraises sans dent frontale.',
    tip_ramp_len:    'Longueur rampe = 2 × Ø outil ({{val}}mm) par défaut.\nAugmenter pour les matériaux durs ou les passes profondes.',
    tip_helix_r:     'Rayon hélice = 0.6 × Ø outil = {{val}}mm par défaut.\nTrop grand : risque de collision avec la paroi. Trop petit : vibrations.',
    tip_helix_turns: 'Nombre de tours de l\'hélice.\nPlus de tours = descente plus douce, mais chemin plus long.\n1 tour suffit pour la plupart des matériaux bois.',
    tip_leadin:      'Lead-in / Lead-out : arc tangentiel d\'entrée et de sortie.\nL\'outil s\'inscrit sur le contour via un arc de cercle, évitant la marque d\'arrêt.\nEssentiellement utile pour les usinages de finition.',
    tip_leadin_r:    'Rayon arc lead-in/out = 0.8 × Ø outil = {{val}}mm par défaut.\nL\'arc doit tenir dans l\'espace libre autour du contour.',
    tip_concentric:  'Chemin concentrique (anneau par anneau).\n✔ Recommandé pour les formes convexes (rectangle, cercle, ovale, hexagone).\n✔ Meilleure finition des parois de poche.\n✗ À éviter pour les formes très concaves.',
    tip_raster:      'Balayage horizontal zig-zag, ligne par ligne.\n✔ Universel : fonctionne pour toutes les formes.\n✔ Idéal pour les formes concaves (C, U, L).\n✗ Peut laisser de légères stries sur les parois de poche.',
  },

  // ── Dialogues de confirmation ───────────────────────────────────────────
  dialog: {
    btn_cancel:   'Annuler',
    btn_continue: 'Continuer',
    machining_order_title: "Ordre d'usinage incorrect",
    machining_order_body_corps:
      'La cavité du corps doit être usinée <strong>après</strong> la feuillure corps.<br>Exporter sans la feuillure usinera dans de la matière pleine.',
    machining_order_body_lid:
      'La cavité du couvercle doit être usinée <strong>après</strong> la feuillure couvercle.<br>Exporter sans la feuillure usinera dans de la matière pleine.',
    diff_heights_title: 'Hauteurs différentes — deux bruts requis',
    diff_heights_body:
      'Corps <strong>{{hBody}}mm</strong> ≠ Couvercle <strong>{{hLid}}mm</strong>.<br>' +
      'Corps et couvercle doivent être usinés sur <strong>deux bruts séparés</strong> ' +
      "aux épaisseurs correspondantes.<br>Envisagez d'exporter corps et couvercle séparément.",
    stackable_flip_title: 'Boîte empilable — Retournement requis',
    stackable_flip_body:
      'Vous exportez OP2 sans OP1.<br>Assurez-vous que les <strong>trous de centrage</strong> et la <strong>cavité intérieure</strong> ont déjà été usinés avant de lancer ce programme.',
  },

  // ── Notifications ───────────────────────────────────────────────────────
  notif: {
    no_ops:    'Aucune opération sélectionnée',
    saved:     'Enregistré : {{path}}',
    svg_saved: 'SVG enregistré : {{path}}',
  },

  // ── Panel paramètres ────────────────────────────────────────────────────
  settings: {
    title:    'Paramètres',
    theme:    'Thème',
    language: 'Langue',
  },

  // ── Vues techniques canvas ──────────────────────────────────────────────
  view: {
    top:         'DESSUS',
    front:       'FACE',
    side:        'CÔTÉ',
    section:     'COUPE A-A',
    flat_panels: 'PANNEAUX À PLAT',
    clearance:   'jeu {{val}}mm',
    rabbet:      'feuillure {{val}}',
    wall_thick:  'Ép. paroi {{val}}',
    bottom_thick:'Ép. fond {{val}}',
  },

  // ── Labels panneaux (vue à plat finger-joint) ────────────────────────────
  panel: {
    bottom: 'Fond',
    top:    'Couvercle',
    front:  'Paroi avant',
    back:   'Paroi arrière',
    left:   'Côté gauche',
    right:  'Côté droit',
  },

  // ── Tooltips (data-tip) ─────────────────────────────────────────────────
  tip: {
    stock:            'Épaisseur totale du brut',
    tool_diameter:    'Diamètre de la fraise',
    depth_per_pass:   'Profondeur de coupe par passe',
    feed_xy:          "Vitesse d'avance XY",
    feed_z:           'Vitesse de plongée Z',
    spindle:          'Vitesse de rotation de la broche',
    safe_z:           'Hauteur de survol Z entre opérations',
    btn_3d:           'Prévisualisation 3D',
    btn_2d:           'Vues techniques 2D avec cotes',
    z0_level:         'Niveau Z0 : bas ou haut de la boîte',
    z0_top:           'Haut de la boîte',
    z0_bottom:        'Bas de la boîte',
    z0_grid:          "Position de l'origine Z0 sur le brut",
    z0_back_left:     'Arrière gauche',
    z0_front_left:    'Avant gauche',
    z0_center:        'Centre',
    z0_front_right:   'Avant droit',
    z0_back_right:    'Arrière droit',
    stock_offset:     'Offset du brut par rapport à la boîte',
    stock_offset_lvl: "Appliquer l'offset en haut ou en bas de la boîte",
    stock_top:        'Offset au-dessus',
    stock_bottom:     'Offset en dessous',
    xray:             'Voir à travers les parois (X-Ray)',
  },
};
