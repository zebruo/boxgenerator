/** English translations — BoxGenerator */
export const en = {
  // ── Box models ──────────────────────────────────────────────────────────
  box: {
    open_tray:       'Open Tray',
    open_tray_short: 'Open',
    finger_joint:       'Finger Joint',
    finger_joint_short: 'Joints',
    lid_box:       'Lid Box',
    lid_box_short: 'Lid',
    stackable:       'Stackable Box',
    stackable_short: 'Stack',
  },

  // ── SVG panels ──────────────────────────────────────────────────────────
  panel: {
    bottom: 'Bottom',
    top:    'Lid',
    front:  'Front',
    back:   'Back',
    left:   'Left',
    right:  'Right',
  },

  // ── Contour shapes ──────────────────────────────────────────────────────
  shape: {
    rectangle: 'Rectangle',
    circle:    'Circle',
    oval:      'Oval',
    hexagon:   'Hexagon',
    polygon:   'Polygon',
    bean:      'Bean',
  },

  // ── Shape / box parameters ──────────────────────────────────────────────
  param: {
    length:         'Length',
    width:          'Width',
    corner_radius:  'Corner radius',
    diameter:       'Diameter',
    sides:          'Sides',
    rotation:       'Rotation',
    ratio_long_larg:'Ratio L/W',
    ratio_larg_long:'Ratio W/L',
    // ── Boxes ──
    height:              'Height',
    box_height:          'Body height',
    lid_height:          'Lid height',
    wall_thickness:      'Wall thick.',
    bottom_thickness:    'Bottom thick.',
    bottom_body:         'Body bottom thick.',
    bottom_lid:          'Lid bottom thick.',
    rabbet:              'Rabbet width',
    rabbet_depth:        'Rabbet depth',
    rabbet_side:         'Rabbet type',
    clearance:           'Fit clearance',
    finger_width:        'Finger width',
    mat_thickness:       'Material thick.',
    with_lid:            'With lid',
    rim_height:          'Rim height',
    pin_diameter:        'Ø alignment pin',
    pin_offset:          'Pin offset (outside)',
    pin_depth:           'Pin hole depth',
  },

  // ── Select options ──────────────────────────────────────────────────────
  option: {
    rabbet_interior: 'Interior rabbet — fitted lid',
    rabbet_exterior: 'Exterior rabbet — full lid',
  },

  // ── Main UI ─────────────────────────────────────────────────────────────
  ui: {
    box_model:     'Box model',
    contour_shape: 'Contour shape',
    dimensions:    'Dimensions',
    material_tool: 'Material & Tool',
    stock:         'Stock',
    tool_diameter: 'Tool diam.',
    depth_per_pass:'Depth/pass',
    feed_xy:       'Feed XY',
    feed_z:        'Plunge Z',
    spindle:       'Spindle',
    safe_z:        'Safe Z',
    btn_3d:           '3D',
    btn_2d:           '2D Views',
    stock_offset:     'Stock +',
    gcode_panel:      'G-code',
    btn_generate:     'Generate',
    btn_save_session: 'Save session',
    btn_load_session: 'Open session',
    btn_export:       'Export G-code',
    btn_export_short: 'G-code',
    btn_svg:          'Export SVG',
    btn_svg_short:    'SVG',
    btn_help:         'Box Generator help',
    gcode_placeholder: 'Click "Generate" to produce CNC G-code\u2026',
  },

  // ── Info bar ────────────────────────────────────────────────────────────
  info: {
    surface:    'Base area',
    sheet_size: 'Recommended sheet',
  },

  // ── G-code stats ────────────────────────────────────────────────────────
  stats: {
    lines:      'Total lines',
    lines_exec: 'Executable',
    lines_count: '{{n}} lines',
  },

  // ── Inline warnings ─────────────────────────────────────────────────────
  warn: {
    tool_too_large:    '⚠ Tool Ø{{td}}mm ≥ rabbet+clearance ({{ringW}}mm) — use Ø < {{ringW}}mm',
    bean_ratio:        '⚠ Ratio outside recommended CNC range (0.5 – 1.5)',
    hexagon_irregular: 'Irregular hexagon — the 6 sides are not equal.\nFor equal sides: Ratio L/W = {{ratio}}',
    finger_too_narrow: '⚠ Tab too narrow ({{tw}}mm) for material thickness ({{t}}mm) — increase finger width',
    finger_too_few:    '⚠ No tabs possible on this edge ({{L}}mm) — decrease finger width',
  },

  // ── G-code operation labels ─────────────────────────────────────────────
  gcode: {
    op_cavity:          'Inner cavity',
    op_outer_wall:      'Outer wall',
    op_body_rabbet:     'Body — rabbet',
    op_body_rabbet_ext: 'Body — outer rabbet',
    op_body_cavity:     'Body — inner cavity',
    op_body_contour:    'Body — outer contour',
    op_lid_cavity:      'Lid — inner cavity',
    op_lid_contour:     'Lid — outer contour',
    op_lid_rabbet_pocket:'Lid rabbet — pocket (exterior)',
    op_rim_mill:        'Rim milling',
    op_outer_contour:   'Outer contour',
    op_pin_left:        'Left alignment hole Ø{{d}}mm',
    op_pin_right:       'Right alignment hole Ø{{d}}mm',
  },

  // ── Export modal ────────────────────────────────────────────────────────
  modal: {
    export_title:  'Export G-code',
    entry_tool:    'Tool entry',
    plunge:        'Plunge',
    ramp:          'Ramp',
    helix:         'Helix',
    ramp_length:   'Ramp length',
    radius:        'Radius',
    turns:         'Turns',
    leadin:        'Lead-in / Lead-out (tangential arc)',
    tabs_label:    'Holding tabs on contours',
    tab_count:     'Count',
    tab_width:     'Width',
    tab_height:    'Height',
    pocket_strategy:  'Pocket strategy',
    concentric:       'Concentric (default)',
    raster:           'Raster (zig-zag) if unchecked',
    ops_one:          '{{count}} operation — check what you want to export:',
    ops_other:        '{{count}} operations — check what you want to export:',
    select_all:       'Select all',
    select_none:      'Deselect all',
    n_lines:          '{{n}} lines',
    cancel:           'Cancel',
    do_export:        'Export selection',
    header_section:   'Header & init',
    footer_section:   'Program end',
    pocket_conc_label:'Concentric pocket',
    pocket_raster_label: 'Raster zig-zag pocket',
    tip_plunge:      'Straight vertical plunge.\nThe tool descends in Z to cut depth before starting the contour.\nSimple and fast, but stresses the end cutting edge.',
    tip_ramp:        'Linear ramp (ramp-in).\nThe tool descends gradually along the first segment.\nDefault: 2 × tool Ø — reduces axial stress on the cutter.',
    tip_helix:       'Helical entry (helix-in).\nThe tool spirals down inside the pocket before engaging the contour.\nIdeal for cutters without centre-cutting capability.',
    tip_ramp_len:    'Ramp length = 2 × tool Ø ({{val}}mm) by default.\nIncrease for hard materials or deep passes.',
    tip_helix_r:     'Helix radius = 0.6 × tool Ø = {{val}}mm by default.\nToo large: wall collision risk. Too small: vibrations.',
    tip_helix_turns: 'Number of helix turns.\nMore turns = smoother descent, longer path.\n1 turn is sufficient for most wood materials.',
    tip_leadin:      'Lead-in / Lead-out: tangential entry and exit arc.\nThe tool engages the contour via a circular arc, avoiding dwell marks.\nMost useful for finishing passes.',
    tip_leadin_r:    'Lead-in/out arc radius = 0.8 × tool Ø = {{val}}mm by default.\nThe arc must fit in the clearance space around the contour.',
    tip_concentric:  'Concentric path (ring by ring).\n✔ Recommended for convex shapes (rectangle, circle, oval, hexagon).\n✔ Better pocket wall finish.\n✗ Avoid for deeply concave shapes.',
    tip_raster:      'Horizontal zig-zag raster, line by line.\n✔ Universal: works for all shapes.\n✔ Ideal for concave shapes (C, U, L).\n✗ May leave slight marks on pocket walls.',
  },

  // ── Confirm dialogs ─────────────────────────────────────────────────────
  dialog: {
    btn_cancel:   'Cancel',
    btn_continue: 'Continue',
    machining_order_title: 'Incorrect machining order',
    machining_order_body_corps:
      'The body cavity must be machined <strong>after</strong> the body rabbet.<br>Exporting without the rabbet will cut into solid material.',
    machining_order_body_lid:
      'The lid cavity must be machined <strong>after</strong> the lid rabbet.<br>Exporting without the rabbet will cut into solid material.',
    diff_heights_title: 'Different heights — two blanks required',
    diff_heights_body:
      'Body <strong>{{hBody}}mm</strong> ≠ Lid <strong>{{hLid}}mm</strong>.<br>' +
      'Body and lid must be machined on <strong>two separate blanks</strong> ' +
      'of matching thickness.<br>Consider exporting body and lid separately.',
    stackable_flip_title: 'Stackable box — Flip required',
    stackable_flip_body:
      'You are exporting OP2 without OP1.<br>Make sure the <strong>alignment holes</strong> and <strong>inner cavity</strong> have already been machined before running this program.',
  },

  // ── Notifications ───────────────────────────────────────────────────────
  notif: {
    no_ops:    'No operation selected',
    saved:     'Saved: {{path}}',
    svg_saved: 'SVG saved: {{path}}',
  },

  // ── Settings panel ──────────────────────────────────────────────────────
  settings: {
    title:    'Settings',
    theme:    'Theme',
    language: 'Language',
  },

  // ── Technical view canvas ───────────────────────────────────────────────
  view: {
    top:         'TOP',
    front:       'FRONT',
    side:        'SIDE',
    section:     'SECTION A-A',
    flat_panels: 'FLAT PANELS',
    clearance:   'gap {{val}}mm',
    rabbet:      'rabbet {{val}}',
    wall_thick:  'Wall {{val}}',
    bottom_thick:'Bot. {{val}}',
  },

  // ── Panel labels (finger-joint flat view) ───────────────────────────────
  panel: {
    bottom: 'Bottom',
    top:    'Lid',
    front:  'Front',
    back:   'Back',
    left:   'Left',
    right:  'Right',
  },

  // ── Tooltips (data-tip) ─────────────────────────────────────────────────
  tip: {
    stock:            'Total stock thickness',
    tool_diameter:    'Tool diameter',
    depth_per_pass:   'Depth of cut per pass',
    feed_xy:          'XY feed rate',
    feed_z:           'Plunge rate Z',
    spindle:          'Spindle speed',
    safe_z:           'Safe Z height between operations',
    btn_3d:           '3D preview',
    btn_2d:           '2D technical views with dimensions',
    z0_level:         'Z0 level: top or bottom of box',
    z0_top:           'Top of box',
    z0_bottom:        'Bottom of box',
    z0_grid:          'Z0 origin position on stock',
    z0_back_left:     'Back left',
    z0_front_left:    'Front left',
    z0_center:        'Center',
    z0_front_right:   'Front right',
    z0_back_right:    'Back right',
    stock_offset:     'Stock offset relative to box',
    stock_offset_lvl: 'Apply offset above or below the box',
    stock_top:        'Offset above',
    stock_bottom:     'Offset below',
    xray:             'See through walls (X-Ray)',
  },
};
