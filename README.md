# Box Generator — CNC Edition

A desktop application for generating parametric boxes and trays with CNC G-code export.

[Lire en français](README.fr.md)

## Features

- **4 box types** : Open Tray, Finger Joint Box, Lid Box (rabbet lid), Stackable Box
- **7 shape profiles** : Rectangle, Circle, Oval, Hexagon, Polygon, Bean, and any rounded variant
- **G-code export** compatible with Grbl, Mach3 and LinuxCNC
- **SVG export** compatible with Fusion 360, Inkscape and other CAD tools
- **2D/3D preview** with Three.js isometric view
- **Holding tabs** on contour cuts (configurable width, height, count)
- **Entry strategies** : direct plunge, helix, tangent lead-in
- **Concentric or raster pocket** fill
- **Dog-bone fillets** at inside corners for finger joints
- **Work origin (WCS)** : center, front-left, front-right, back-left, back-right — top or bottom of stock
- **Session save/load** (JSON)
- **FR / EN** interface

## Box types

| Type | Description |
|------|-------------|
| Open Tray | Simple open tray — cavity + outer contour |
| Finger Joint Box | Closed box with finger joints on all panels |
| Lid Box | Body + rabbet lid (interior or exterior rabbet) |
| Stackable Box | Box with interlocking rim for stacking |

## Shapes

Rectangle, Circle, Oval, Hexagon (regular with auto-adjusted dimensions on rotation), Polygon (N sides), Bean (asymmetric organic shape).

All shapes support corner radius. Non-rectangular shapes automatically omit wall panels where they make no sense.

## G-code

- Standard CNC G-code (G21, G90, G17)
- Multiple Z passes with configurable depth-per-pass
- Stock offset for oversize blanks (last contour pass reaches full stock thickness)
- Lid Box: body and lid can be machined from the same stock or separate stocks (`Lid at origin` mode)
- Asymmetric shapes: lid is mirrored so it fits the body after physical flipping

## Installation

### Prerequisites

- [Node.js](https://nodejs.org/) 18+
- [Git](https://git-scm.com/)

### Run from source

```bash
git clone https://github.com/YOUR_USERNAME/BoxGenerator.git
cd BoxGenerator
npm install
npm start
```

### Development mode (with DevTools)

```bash
npm run dev
```

### Build Windows installer

```bash
npm run dist
```

## Tech stack

- **Electron** (Node.js desktop shell)
- **Vanilla JS ES modules** (no bundler)
- **Canvas 2D** for 2D preview
- **Three.js** for 3D isometric preview
- **i18next** for internationalization
- **Font Awesome** for icons

## Project structure

```
BoxGenerator/
├── main.js              — Electron main process (IPC: save-gcode, save-svg, sessions)
├── preload.js           — contextBridge → window.electronAPI
├── package.json
└── renderer/
    ├── index.html
    ├── app.js           — Main controller, state, events, G-code origin computation
    ├── styles.css
    └── modules/
        ├── shapes/      — ShapeBase, Rectangle, Circle, Oval, Hexagon, Polygon, Bean
        ├── boxes/       — OpenTray, FingerJointBox, LidBox, StackableBox
        └── gcode/       — GCodeGenerator, PocketConcentric
```

## License

MIT
