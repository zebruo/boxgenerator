# Box Generator — CNC Edition

Application desktop de génération de boîtes paramétriques avec export G-code CNC.

[Read in English](README.md)

## Fonctionnalités

- **4 types de boîtes** : Plateau ouvert, Boîte finger joint, Boîte à couvercle (feuillure), Boîte empilable
- **7 profils de forme** : Rectangle, Cercle, Ovale, Hexagone, Polygone, Bean, et toutes variantes arrondies
- **Export G-code** compatible Grbl, Mach3 et LinuxCNC
- **Export SVG** compatible Fusion 360, Inkscape et autres logiciels CAO
- **Prévisualisation 2D/3D** avec vue isométrique Three.js
- **Onglets de maintien** sur les coupes de contour (largeur, hauteur, nombre configurables)
- **Stratégies d'entrée** : plongée directe, hélicoïdale, lead-in tangentiel
- **Poche concentrique ou raster**
- **Dog-bone** aux coins intérieurs pour les finger joints
- **Origine programme (WCS)** : centre, avant-gauche, avant-droit, arrière-gauche, arrière-droit — dessus ou dessous du brut
- **Sauvegarde/chargement de session** (JSON)
- **Interface FR / EN**

## Types de boîtes

| Type | Description |
|------|-------------|
| Plateau ouvert | Plateau simple — cavité + contour extérieur |
| Finger Joint Box | Boîte fermée avec encoches sur tous les panneaux |
| Boîte à couvercle | Corps + couvercle à feuillure (intérieure ou extérieure) |
| Boîte empilable | Boîte avec jonc d'emboîtement pour empilage |

## Formes

Rectangle, Cercle, Ovale, Hexagone (régulier avec recalcul automatique des dimensions à la rotation), Polygone (N côtés), Bean (forme organique asymétrique).

Toutes les formes supportent un rayon de coin. Les formes non rectangulaires n'affichent pas les panneaux de parois qui n'ont pas de sens.

## G-code

- G-code CNC standard (G21, G90, G17)
- Passes en Z multiples avec profondeur par passe configurable
- Offset brut pour les planches légèrement surdimensionnées (la dernière passe de contour atteint l'épaisseur réelle du brut)
- Boîte à couvercle : corps et couvercle usinables sur le même brut ou sur deux bruts séparés (mode `Couvercle à l'origine`)
- Formes asymétriques : le couvercle est fraisé en miroir pour s'emboîter correctement après retournement physique

## Installation

### Prérequis

- [Node.js](https://nodejs.org/) 18+
- [Git](https://git-scm.com/)

### Lancer depuis les sources

```bash
git clone https://github.com/YOUR_USERNAME/BoxGenerator.git
cd BoxGenerator
npm install
npm start
```

### Mode développement (avec DevTools)

```bash
npm run dev
```

### Compiler l'installeur Windows

```bash
npm run dist
```

## Stack technique

- **Electron** (shell desktop Node.js)
- **Vanilla JS ES modules** (sans bundler)
- **Canvas 2D** pour la prévisualisation 2D
- **Three.js** pour la prévisualisation 3D isométrique
- **i18next** pour l'internationalisation
- **Font Awesome** pour les icônes

## Structure du projet

```
BoxGenerator/
├── main.js              — Processus principal Electron (IPC : save-gcode, save-svg, sessions)
├── preload.js           — contextBridge → window.electronAPI
├── package.json
└── renderer/
    ├── index.html
    ├── app.js           — Contrôleur principal, état, événements, calcul origine G-code
    ├── styles.css
    └── modules/
        ├── shapes/      — ShapeBase, Rectangle, Circle, Oval, Hexagon, Polygon, Bean
        ├── boxes/       — OpenTray, FingerJointBox, LidBox, StackableBox
        └── gcode/       — GCodeGenerator, PocketConcentric
```

## Licence

MIT
