# Icônes de BoxGenerator

Icônes propres à l'application, dessinées pour elle (aucun tracé repris d'une bibliothèque). À terme, elles
remplaceront Font Awesome.

## Règles de dessin

- Fichier SVG, `viewBox="0 0 24 24"`, sans `width` ni `height`.
- Trait seul : `fill="none"`, `stroke-width="1.8"`, extrémités et angles arrondis.
- Une seule couleur, n'importe laquelle (`#000`) : l'icône est affichée comme un **masque**, la couleur vient du thème.
- Nom de fichier en français, en minuscules, avec des tirets : `enregistrer-sous.svg`.
- Exception, les icônes **en couleurs** (ex. `boite.svg`) : faces remplies, trait noir fin (0,5) ; elles
  s'affichent telles quelles avec `<img src="icones/boite.svg">`, pas comme masque.

## Utilisation

Dans `styles.css`, une classe par icône :

```css
.ico-enregistrer-sous { --ico: url(icones/enregistrer-sous.svg); }
```

Dans le HTML :

```html
<span class="ico ico-enregistrer-sous" aria-hidden="true"></span>
```

La classe `.ico` (dans `styles.css`) dessine l'icône à la taille du texte, dans la couleur du texte (`currentColor`).
