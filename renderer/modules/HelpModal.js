/**
 * Modale d'aide — Export G-code.
 * Explique les sections de l'interface et les options d'export.
 * Les valeurs par défaut sont calculées dynamiquement depuis getMachineParams().
 */
export function showHelpModal(machine = {}) {
  const td        = machine.toolDiameter ?? 3.175;
  const dpp       = machine.depthPerPass ?? 2;
  const defRamp   = +(td * 2).toFixed(1);
  const defHelixR = +(td * 0.6).toFixed(2);
  const defLeadR  = +(td * 0.4).toFixed(2);

  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';

  const modal = document.createElement('div');
  modal.className = 'help-modal';
  modal.innerHTML = `
    <div class="help-header">
      <h3>Guide BoxGenerator</h3>
      <button class="help-close" title="Fermer">✕</button>
    </div>
    <div class="help-tabs">
      <button class="help-tab active" data-tab="gcode">Export G-code</button>
      <button class="help-tab" data-tab="boxes">Modèles de boîtes</button>
      <button class="help-tab" data-tab="formules">Formules</button>
      <button class="help-tab" data-tab="abaque">Abaque</button>
    </div>
    <div class="help-body">

      <!-- ══════════════ ONGLET G-CODE ══════════════ -->
      <div class="help-panel active" data-panel="gcode">

      <!-- ── Colonne de gauche ─────────────────────────────── -->
      <section class="help-section">
        <h4>Colonne de gauche — Paramètres</h4>
        <dl class="help-dl">
          <dt>Sessions (barre du haut)</dt>
          <dd>L'icône <em>dossier</em> (Ctrl+O) ouvre une session <span class="help-mono">.json</span>, la <em>disquette</em> (Ctrl+S) l'enregistre <strong>directement dans le fichier ouvert</strong>, sans explorateur. <strong>Maj+clic</strong> sur la disquette, ou Ctrl+Maj+S, enregistre sous un autre nom ou dans un autre dossier. Avant d'écraser, la version précédente est copiée dans un sous-dossier <span class="help-mono">sauvegardes</span> à côté du fichier. Le nom du fichier s'affiche dans le titre de la fenêtre, avec un <strong>*</strong> devant quand la session a changé depuis le dernier enregistrement. La session garde aussi les options d'usinage : entrée de l'outil, finition, tabs et stratégie de poche.</dd>
          <dt>Modèle de boîte</dt>
          <dd>Choisit le type de construction :
            <strong>Plateau</strong> (fond + parois, sans couvercle),
            <strong>Encoches</strong> (finger joint — panneaux assemblés par tenons-mortaises),
            <strong>Couvercle</strong> (corps + couvercle emboîtable avec feuillure),
            <strong>Empilable</strong> (bords inversés pour empilage). Le modèle détermine quelles panneaux sont générés et comment le G-code les découpe.
          </dd>
          <dt>Forme du contour</dt>
          <dd>Définit le plan de base de la boîte :
            <strong>Rectangle</strong>, <strong>Cercle</strong>, <strong>Ovale</strong>, <strong>Polygone</strong> (N côtés), <strong>Haricot</strong>. Tous les panneaux et contours sont calculés à partir de cette forme.
            <br><br>
            <strong>Haricot</strong> — contour organique à zone concave, défini par une courbe de Bézier cubique fixe mise à l'échelle selon la <em>Longueur</em> (axe X) et la <em>Largeur</em> (axe Y), comme les autres formes.
            Le profil ne se paramètre pas : seules les dimensions globales changent.
            Un <strong>ratio Largeur/Longueur entre 0,5 et 1,5</strong> est conseillé (avertissement affiché hors plage).
            La zone concave impose <strong>⌀ fraise ≤ 2 × rayon de courbure minimum</strong> du creux — préférer une fraise fine (Ø 3 – 4 mm) pour les petits formats.
            Vérifier dans le visualiseur G-code que la trajectoire suit bien le creux avant usinage.
          </dd>
          <dt>Dimensions</dt>
          <dd>Paramètres propres à la forme sélectionnée (largeur, hauteur, rayon…) et au modèle de boîte (hauteur paroi, épaisseur, jeu d'assemblage…). Ces valeurs alimentent directement la génération G-code et la prévisualisation 3D.</dd>
          <dt>Matière &amp; Outil</dt>
          <dd>
            <strong>Brut</strong> — épaisseur totale calculée automatiquement depuis la hauteur de boîte + surplus de brut réglé par le bouton <em>Brut</em> de la barre 3D (lecture seule). Boîte à couvercle de hauteurs différentes : deux lignes, <strong>Brut corps</strong> et <strong>Brut couvercle</strong> (deux bruts), chacun avec son propre surplus : la fenêtre du bouton <em>Brut</em> propose alors deux champs (corps, couvercle) ; saisir par exemple 0,3 pour une planche de 8,6 mm sous un couvercle de 8,3 mm.<br>
            <strong>Fraise</strong> (catalogue de fraises, classées par diamètre : hélicoïdales, droites, à compression ; choisir une fraise fixe son diamètre et ses dents, limite les matières à celles de sa fiche fournisseur et reprend sa vitesse de coupe et son avance par dent ; « Saisie manuelle » pour une autre), <strong>Matière</strong>, <strong>⌀ fraise</strong> et <strong>Dents</strong> — l'avance XY, la plongée et la profondeur par passe se calculent seules à partir de ces trois réglages et de la broche (mêmes tables que <em>Détails du calcul</em>). Le diamètre sert aussi à l'offset de contour et aux valeurs par défaut de la fenêtre d'export.<br>
            <strong>Prof./passe</strong> — profondeur de coupe par passe Z ; le nombre de passes est déduit automatiquement (⌈brut ÷ prof.⌉).<br>
            <strong>Vitesse XY / Z</strong> — avance en mm/min pour les mouvements de coupe (G1) et de plongée.<br>
            <strong>auto / ↺ auto</strong> — l'étiquette à côté d'un champ dit s'il est calculé (<em>auto</em>) ou saisi à la main (<em>↺ auto</em> : un clic remet la valeur calculée). Changer la matière recalcule tout. Une avance saisie trop basse (fz sous 60 % du conseillé) déclenche un avertissement : la fraise frotte et le bois peut brûler.<br>
            <strong>Prof. max</strong> (dans <em>Limites machine</em>) — profondeur de passe maximale en fraction du diamètre : la profondeur automatique suit le tableau du fournisseur sans dépasser ce plafond (0,3 en finition, 0,6 en ébauche, 1 = tableau du fournisseur sans plafond ; à baisser si la machine manque de rigidité).<br>
            <strong>Vitesse G0</strong> (dans <em>Limites machine</em>) — vitesse des déplacements rapides de la machine, en général sa vitesse maximale ; sert au temps estimé de la simulation.<br>
            <strong>Broche</strong> — vitesse de rotation en tr/min (commande <span class="help-mono">S…M3</span>). <em>fixe</em> : tu règles les tr/min et les avances s'y adaptent ; <em>auto</em> : les tr/min sont calculés depuis la vitesse de coupe de la matière. <strong>Limites machine</strong> : broche et avances maximales, qui plafonnent les calculs (mémorisées sur l'ordinateur).<br>
            <strong>⚙ Détails du calcul…</strong> — fenêtre qui montre le calcul pas à pas (cible et valeur effective après les limites machine). Les résultats se recalculent à chaque modification ; chaque valeur (vc, fz, ap) est calculée (<em>auto</em>) ou saisie à la main (<em>↺ auto</em> pour revenir au calcul). Le diamètre y est libre, sauf avec une fraise du catalogue. <strong>Appliquer</strong> reporte dans le panneau la matière, les valeurs et les limites machine réglées dans la fenêtre.<br>
            <strong>Survol Z</strong> — hauteur de sécurité entre opérations (commande <span class="help-mono">G0 Z…</span>).<br>
            <strong>Arcs G2/G3</strong> — regroupe les petits segments en vrais arcs et ne répète pas les mots inchangés : le fichier est beaucoup plus court et la machine plus fluide.
          </dd>
        </dl>
      </section>

      <!-- ── Colonne de droite ───────────────────────────── -->
      <section class="help-section">
        <h4>Colonne de droite — Panneau G-code</h4>
        <dl class="help-dl">
          <dt>Générer</dt>
          <dd>Calcule et affiche le G-code complet à partir des paramètres courants (forme, modèle de boîte, matière et outil). Le résultat est mis à jour à chaque clic — il n'est pas recalculé automatiquement.</dd>
          <dt>Simuler</dt>
          <dd>Joue le G-code tel qu'il serait exporté (avec les dernières options d'export) sur le brut. Voir <em>Aperçus et simulation</em> ci-dessous.</dd>
          <dt>Visualiseur</dt>
          <dd>Coloration syntaxique par type de commande :
            <span class="help-chip chip-comment">; commentaire</span>
            <span class="help-chip chip-rapid">G0 rapide</span>
            <span class="help-chip chip-move">G1 avance</span>
            <span class="help-chip chip-cmd">M/S machine</span>
          </dd>
          <dt>Export G-code</dt>
          <dd>Ouvre la fenêtre d'export avec les options d'entrée outil, lead-in/out, tabs de maintien et sélection des sections à exporter. Le G-code est <strong>re-généré</strong> avec ces options au moment de l'export — le visualiseur affiche toujours la version sans options.</dd>
          <dt>SVG</dt>
          <dd>Exporte les pièces en SVG (mm, mêmes contours que le G-code, cloisons comprises). Trois calques : <strong>Découpe</strong> (rouge, contours traversants), <strong>Usinages</strong> (bleu, poches non traversantes) et <strong>Repères</strong> (noms des pièces, à masquer avant découpe). Pour la découpe laser ou la retouche dans Inkscape / Fusion 360.</dd>
        </dl>
      </section>

      <!-- ── Aperçus et simulation ─────────────────────────── -->
      <section class="help-section">
        <h4>Aperçus et simulation</h4>
        <dl class="help-dl">
          <dt>3D</dt>
          <dd>Boîte et brut (cadre jaune) avec le repère <strong>Z0</strong> : tel qu'il sera dans le G-code. Le bouton <em>Z0</em> (groupe <em>Usinage</em>) ouvre une fenêtre : clic sur un point du schéma du brut pour la position dans le plan (centre ou un coin), puis hauteur du zéro (haut ou bas de la boîte). Le bouton <em>Brut</em> ajoute du brut autour de la boîte, au-dessus ou en dessous ; chaque bouton affiche son réglage actuel. <em>X-Ray</em> rend la matière transparente. Boîtes à couvercle et à encoches : <strong>À plat</strong> (pièces disposées comme dans le G-code) ou <strong>Assemblé</strong>. Double-clic : recadrer la vue.</dd>
          <dt>Vues 2D</dt>
          <dd>Dessus (avec le plan de coupe <strong>A-A</strong>), face, côté et coupe A-A hachurée, avec leurs cotes. La boîte à encoches se présente en panneaux à plat. Pour la boîte à couvercle, la coupe donne la <strong>hauteur utile</strong> : du dessus du fond jusqu'au dessous du couvercle posé (la lèvre repose sur le fond de la feuillure).
          <dt>Simuler</dt>
          <dd>Rejoue l'usinage sur le brut : fraise, trajets, matière enlevée, temps estimé. Les boutons <strong>Outil</strong>, <strong>Parcours</strong>, <strong>À vide</strong> (déplacements rapides) et <strong>Dessin</strong> (contours théoriques) affichent ou masquent chaque élément ; <strong>Pièce finie seule</strong> masque la chute. La vitesse de lecture se règle à côté de la ligne de temps. Boîte empilable : choix de la face (dessus, dessous retourné). Boîte à couvercle de hauteurs différentes : choix de la pièce, chacune sur son brut.</dd>
        </dl>
      </section>

      <!-- ── Entrée outil ────────────────────────────────── -->
      <section class="help-section">
        <h4>Entrée outil</h4>
        <p>Mode de descente dans la matière à chaque passe en Z.</p>
        <dl class="help-dl">
          <dt>Plongée</dt>
          <dd>Descente verticale directe. Simple et rapide, mais sollicite l'arête frontale de la fraise. À éviter pour les fraises sans dent centrale.</dd>
          <dt>Rampe</dt>
          <dd>L'outil descend progressivement sur un aller-retour le long du premier segment du contour. Réduit la contrainte axiale — recommandé pour le bois dur et le médium.</dd>
          <dt>Hélice</dt>
          <dd>Spirale descendante autour du centroïde de la forme avant d'attaquer le contour. Idéal pour les fraises sans dent frontale (2T). Le rayon doit tenir dans l'espace intérieur.</dd>
        </dl>
      </section>

      <!-- ── Rampe ou Hélice ? ───────────────────────────── -->
      <section class="help-section">
        <h4>Rampe ou Hélice — quelle solution choisir ?</h4>
        <table class="help-table">
          <thead>
            <tr>
              <th></th>
              <th>Rampe</th>
              <th>Hélice</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td class="help-row-hd">Fraise compatible</td>
              <td>Toutes (1T, 2T, 3T…)</td>
              <td>Sans dent frontale — 2T recommandée</td>
            </tr>
            <tr>
              <td class="help-row-hd">Espace requis</td>
              <td>${defRamp} mm le long du contour</td>
              <td>⌀ ${(defHelixR * 2).toFixed(2)} mm à l'intérieur de la forme</td>
            </tr>
            <tr>
              <td class="help-row-hd">Matériaux</td>
              <td>Bois, MDF, PMMA, plastiques</td>
              <td>Aluminium, laiton, matériaux durs</td>
            </tr>
            <tr>
              <td class="help-row-hd">Avantage</td>
              <td>Chemin court, descente douce sur le bord</td>
              <td>Zéro contrainte axiale, descente au centre</td>
            </tr>
            <tr>
              <td class="help-row-hd">Limite</td>
              <td>Le premier segment doit être ≥ longueur rampe</td>
              <td>Forme trop petite → rayon hélice impossible</td>
            </tr>
          </tbody>
        </table>
        <p class="help-note help-rec">
          <strong>Recommandation pour les boîtes en bois / MDF :</strong>
          <strong>Rampe</strong> — rapide, compatible toutes fraises, espace minimal.<br>
          Passer en <strong>Hélice</strong> uniquement pour l'aluminium ou avec une fraise 2T sans dent frontale.
        </p>
      </section>

      <!-- ── Lead-in / Lead-out ─────────────────────────── -->
      <section class="help-section">
        <h4>Lead-in / Lead-out</h4>
        <p>Arc tangentiel d'entrée <em>et</em> de sortie sur le contour extérieur. S'applique à <strong>toutes les formes</strong> — rectangles, ovales, polygones et <strong>cercles</strong> (arcs G3 natifs).</p>
        <dl class="help-dl">
          <dt>Case décochée (défaut)</dt>
          <dd>Un <strong>overcut automatique</strong> de ½ ⌀outil prolonge le contour légèrement au-delà du point de départ — l'outil ne s'arrête jamais exactement au même endroit, ce qui élimine la marque de jonction. Suffisant pour le bois et le MDF.</dd>
          <dt>Case cochée</dt>
          <dd>L'outil approche le contour par un <strong>arc de 90°</strong> tangentiel (lead-in), puis en repart symétriquement par un arc de sortie (lead-out). Aucune plongée directe sur la paroi, aucun arrêt sur le contour. L'outil se rétracte et se repositionne au point d'approche entre chaque passe Z. Recommandé pour l'aluminium, l'acrylique et les passes de finition sur bois dur.</dd>
          <dt>Rayon</dt>
          <dd>Par défaut 0,4 × ⌀outil (${defLeadR} mm). L'arc doit tenir dans l'espace libre autour de la forme — réduire si la fraise est trop proche d'une paroi.</dd>
        </dl>
      </section>

      <!-- ── Stratégie poche ───────────────────────────── -->
      <section class="help-section">
        <h4>Stratégie poche</h4>
        <dl class="help-dl">
          <dt>Concentrique (défaut)</dt>
          <dd>L'outil part du centre et trace des anneaux concentriques vers la paroi. La paroi est atteinte lors du dernier anneau, qui constitue la passe de finition. Résultat propre pour les formes convexes (rectangle, cercle, ovale, polygone). Un overcut de ½ ⌀outil sur le dernier anneau élimine la marque de fermeture sur la paroi.</dd>
          <dt>Raster (zig-zag)</dt>
          <dd>Balayage horizontal ligne par ligne. Universel — fonctionne pour toutes les formes y compris les profils concaves (haricot, C, U). À chaque passe, la fraise fait ensuite le tour du contour pour enlever les marches du balayage le long des parois. À utiliser quand la forme est trop concave pour la stratégie concentrique.</dd>
        </dl>
      </section>

      <!-- ── Tabs ────────────────────────────────────────── -->
      <section class="help-section">
        <h4>Tabs de maintien</h4>
        <p>Ponts de matière laissés au fond de la coupe pour maintenir la pièce dans le brut : dès qu'une passe descend sous leur sommet, l'outil remonte automatiquement au-dessus de chaque tab. Ils se règlent avec le bouton <strong>Tabs</strong> de la barre <em>Usinage</em> (au-dessus de l'aperçu 3D) et sont enregistrés avec la session. L'icône <strong>crayon</strong> (<em>Placer à la main dans la vue 2D…</em>), sous la pastille <em>auto</em> de la même fenêtre, affiche le dessus de la boîte en grand : un clic sur le contour ajoute un tab, un clic sur un tab le retire, on le glisse pour le déplacer ; Échap ou <em>Terminer</em> pour finir, la pastille <em>↺ auto</em> (même fonctionnement que dans le panneau de gauche) pour revenir au placement automatique. Les tabs placés à la main valent pour le contour extérieur du corps, du couvercle (en miroir, comme la pièce retournée) et de la boîte empilable ; la boîte à encoches reste en placement automatique. Ils sont placés au milieu des côtés droits les plus longs, jamais dans un angle ni dans un arrondi ; avec plus de tabs que de côtés droits, chaque côté en reçoit au moins un et les autres vont aux côtés les plus longs, espacés régulièrement ; sur une forme sans côté droit (cercle, ovale, haricot), ils sont répartis uniformément sur le périmètre. Par défaut : 4 tabs de 8 mm de long et 2 mm de haut. La largeur saisie est la longueur réelle du pont de matière : l'outil reste au-dessus du tab sur cette largeur plus son diamètre, car il mord de son rayon de chaque côté.</p>
      </section>

      <!-- ── Finition des parois ───────────────────────────── -->
      <section class="help-section">
        <h4>Finition des parois</h4>
        <p>Case <strong>Finition parois</strong> et <strong>surépaisseur</strong> (0,2 mm par défaut) : les passes en profondeur s'arrêtent à cette distance de la cote, puis une passe unique à pleine profondeur suit le contour exact. Un seul passage léger donne une paroi plus nette et soulage la fraise. S'applique aux contours, à la poche concentrique et à la poche en balayage.</p>
      </section>

      <!-- ── Valeurs par défaut ──────────────────────────── -->
      <section class="help-section">
        <h4>Valeurs par défaut — d'où viennent-elles ?</h4>
        <p class="help-note">
          Calculées dynamiquement depuis les paramètres machine à l'ouverture de la modale.<br>
          ⌀ outil actuel : <strong>${td} mm</strong> — profondeur/passe : <strong>${dpp.toFixed(2)} mm</strong>
        </p>
        <table class="help-table">
          <thead>
            <tr>
              <th>Champ</th>
              <th>Formule</th>
              <th>Valeur actuelle</th>
              <th>Logique</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>Longueur rampe</td>
              <td class="help-formula">2 × ⌀outil</td>
              <td class="help-val">${defRamp} mm</td>
              <td>Angle de descente ≈ dpp ÷ (2×⌀) — doux pour la fraise</td>
            </tr>
            <tr>
              <td>Rayon hélice</td>
              <td class="help-formula">0,6 × ⌀outil</td>
              <td class="help-val">${defHelixR} mm</td>
              <td>Laisse 40 % de jeu avec la paroi, évite les vibrations</td>
            </tr>
            <tr>
              <td>Rayon lead-in/out</td>
              <td class="help-formula">0,4 × ⌀outil</td>
              <td class="help-val">${defLeadR} mm</td>
              <td>Compact pour petites machines, suffisant pour l'entrée tangentielle</td>
            </tr>
          </tbody>
        </table>
        <p class="help-note">
          Exemple : en passant de ⌀ 3,175 mm → ⌀ 6 mm, la modale s'ouvre avec
          12 mm / 3,6 mm / 2,4 mm au lieu de 6,35 mm / 1,9 mm / 1,27 mm.
        </p>
      </section>

      </div><!-- /panel gcode -->

      <!-- ══════════════ ONGLET MODÈLES ══════════════ -->
      <div class="help-panel" data-panel="boxes">

        <section class="help-section">
          <h4>Plateau ouvert</h4>
          <p>Fond plein + 4 parois droites, sans couvercle. La pièce est usinée en <strong>une seule opération</strong> depuis le dessus.</p>
          <dl class="help-dl">
            <dt>Cavité</dt><dd>Poche intérieure depuis le dessus jusqu'à l'épaisseur de fond.</dd>
            <dt>Cloisons</dt><dd>Divise la cavité en <strong>N+1 compartiments</strong> en conservant des cloisons à la même épaisseur que les parois. Direction au choix : <em>perpendiculaires à X</em> (cloisons verticales) ou <em>perpendiculaires à Y</em> (cloisons horizontales). Disponible uniquement pour la forme Rectangle. Un avertissement s'affiche si les compartiments sont trop étroits pour la fraise (min. 3 × ⌀outil).</dd>
            <dt>Contour</dt><dd>Découpe extérieure en pleine épaisseur matière.</dd>
            <dt>Usage</dt><dd>Rangements, bacs, tiroirs, organiseurs. Compatible toutes formes (rectangle, ovale, polygone…).</dd>
          </dl>
        </section>

        <section class="help-section">
          <h4>Finger joint (encoches)</h4>
          <p>Boîte à panneaux assemblés par tenons-mortaises. Chaque panneau est découpé à plat puis assemblé à la colle ou par friction.</p>
          <dl class="help-dl">
            <dt>Panneaux</dt><dd>Fond, 2 côtés longs, 2 côtés courts — découpés séparément.</dd>
            <dt>Encoches</dt><dd>Générées automatiquement selon l'épaisseur matière.</dd>
            <dt>Usage</dt><dd>Coffrets, emballages, boîtes de rangement.</dd>
          </dl>
        </section>

        <section class="help-section">
          <h4>Boîte couvercle (feuillure)</h4>
          <p>Corps + couvercle emboîtables par double feuillure. Deux pièces usinées depuis le dessus, chacune dans son propre brut.</p>
          <dl class="help-dl">
            <dt>Feuillure intérieure — couvercle ajusté</dt>
            <dd>La feuillure est creusée à l'<strong>intérieur</strong> du bord supérieur du corps. Le couvercle est légèrement plus petit que le corps — sa lèvre s'emboîte dans la feuillure. La feuillure corps couvre toute la zone intérieure : la cavité est usinée en repartant du fond de feuillure déjà usiné.</dd>
            <dt>Feuillure extérieure — couvercle plein</dt>
            <dd>La feuillure est creusée sous forme d'<strong>anneau périphérique</strong> en haut du corps. Le couvercle a les mêmes dimensions extérieures que le corps et vient coiffer le sommet. La feuillure couvercle est une poche centrale qui forme la lèvre. La cavité corps repart de Z=0 (l'anneau n'a pas pré-usiné l'intérieur).</dd>
            <dt>Contrainte fraise / feuillure (feuillure extérieure uniquement)</dt>
            <dd>L'anneau périphérique est usiné par passes concentriques. Le <strong>diamètre fraise doit être strictement inférieur à (largeur feuillure + jeu)</strong> — un warning s'affiche sur le champ si ce n'est pas le cas. Pour une feuillure de 3 mm + jeu 0,3 mm, utiliser une fraise &lt; 3,3 mm (ex. Ø 3,175 mm).</dd>
            <dt>Cloisons</dt><dd>Divise la cavité du <strong>corps</strong> en N+1 compartiments. Les cloisons prolongent le profil de la paroi vu depuis la cavité : feuillure <em>intérieure</em>, leur épaisseur est la largeur de la feuillure ; feuillure <em>extérieure</em>, c'est ce qui reste de la paroi (paroi − feuillure). Minimum 3 mm, sans dépasser l'épaisseur des parois. Direction configurable (perpendiculaires à X ou Y). Le couvercle reste ouvert (cavité non cloisonnée). Disponible uniquement pour la forme Rectangle.</dd>
            <dt>Avertissements sur la feuillure</dt>
            <dd>Le champ passe en orange, avec le détail en info-bulle : <strong>largeur de feuillure ≥ épaisseur de paroi</strong> (il ne reste rien de la paroi) ; <strong>profondeur</strong> qui laisse moins de 3 mm au-dessus du fond du corps ; en feuillure intérieure, <strong>couvercle enfoncé de plus de 1 mm</strong> sous le bord du corps (feuillure trop profonde ou couvercle trop bas : la hauteur utile s'effondre) ; en feuillure extérieure, feuillure de couvercle plus profonde que sa cavité (dessus plus fin que prévu). Les seuils sont réglables dans <span class="help-mono">renderer/modules/Thresholds.js</span>.</dd>
            <dt>Jeu</dt><dd>Décalage entre lèvre et feuillure pour un assemblage sans forcer. Valeur typique : 0,2 – 0,5 mm selon la précision machine.</dd>
            <dt>Layout d'export</dt>
            <dd>Corps et couvercle sont placés côte à côte dans le G-code. Le sens est choisi automatiquement pour <strong>minimiser le côté le plus long du brut</strong> : horizontal si W ≤ D, vertical si W &gt; D. Exemple : 140×65 mm → layout vertical, brut 140×150 mm au lieu de 300×65 mm.</dd>
            <dt>Hauteurs différentes</dt>
            <dd>Si corps et couvercle ont des hauteurs différentes, un <strong>avertissement à l'export</strong> rappelle qu'il faut deux bruts séparés aux épaisseurs correspondantes. Exporter corps et couvercle séparément : chaque fichier est recentré à l'origine (X=0 Y=0) et son en-tête indique le brut de cette pièce (épaisseur et nombre de passes). Z0 en surface : zéro sur le dessus de chaque brut. Z0 en bas : zéro sur la table, chaque pièce décalée de l'épaisseur de son propre brut (corps et couvercle n'ont donc pas le même décalage).</dd>
            <dt>Usage</dt><dd>Coffrets, boîtes à bijoux, étuis de présentation.</dd>
          </dl>
        </section>

        <section class="help-section">
          <h4>Boîte empilable</h4>
          <p>Corps creux avec un plot (piétement) qui s'emboîte dans la cavité de la boîte du dessous. Nécessite <strong>deux opérations</strong> avec retournement de la pièce.</p>
          <dl class="help-dl">
            <dt>OP 1 — Dessus</dt><dd>Trous de centrage (goupilles) + cavité intérieure depuis le dessus.</dd>
            <dt>Retournement</dt><dd>La pièce est retournée sur ses goupilles et refixée.</dd>
            <dt>OP 2 — Dessous</dt><dd>Rainure annulaire formant le plot + contour extérieur final (avec tabs).</dd>
            <dt>Plot</dt><dd>Zone centrale non fraisée sur le dessous — s'emboîte dans la cavité de la boîte inférieure avec le jeu d'assemblage.</dd>
            <dt>Goupilles</dt><dd>Trous percés hors contour pour repositionner la pièce avec précision lors du retournement.</dd>
            <dt>Stratégie perçage</dt><dd>Si <em>Ø goupille − Ø fraise &gt; 0,5 mm</em> : interpolation hélicoïdale (spirale continue, sans retrait entre les passes). Sinon : plongée en peck drilling — retrait à safeZ entre chaque passe pour dégager les copeaux.</dd>
            <dt>Usage</dt><dd>Bacs modulaires, tiroirs empilables, systèmes de rangement.</dd>
          </dl>
        </section>

        <section class="help-section">
          <h4>Formes du contour</h4>
          <p>Toutes les formes sont compatibles avec tous les modèles de boîtes. Le contour détermine le plan de coupe et la cavité intérieure.</p>
          <table class="help-table">
            <thead>
              <tr><th>Forme</th><th>Paramètres</th><th>Points CNC</th></tr>
            </thead>
            <tbody>
              <tr>
                <td><strong>Rectangle</strong></td>
                <td>Largeur, Longueur, Rayon de coin</td>
                <td>Coins arrondis recommandés (≥ rayon fraise) pour éviter les angles morts.</td>
              </tr>
              <tr>
                <td><strong>Cercle</strong></td>
                <td>Diamètre</td>
                <td>Contour usiné en <strong>vrais arcs G3</strong> (pas de segments G1). Pas d'angle mort, surface cylindrique parfaite. Lead-in/out supporté. Idéal pour toutes fraises.</td>
              </tr>
              <tr>
                <td><strong>Ovale</strong></td>
                <td>Longueur, Largeur</td>
                <td>Ellipse lisse. Aucun coin vif — très favorable à la CNC.</td>
              </tr>
              <tr>
                <td><strong>Polygone</strong></td>
                <td>Longueur, Largeur, Nb côtés, Rayon de coin, Rotation</td>
                <td>Plus le nombre de côtés est faible, plus les coins sont aigus — augmenter le rayon en conséquence. L'emprise reste exactement Longueur × Largeur quel que soit le rayon. Hexagone : 6 côtés.</td>
              </tr>
              <tr>
                <td><strong>Haricot</strong></td>
                <td>Longueur, Largeur</td>
                <td>Contour bezier — ratio Larg/Long conseillé entre 0,5 et 1,5. La zone concave impose un diamètre de fraise ≤ 2× rayon de courbure minimum.</td>
              </tr>
            </tbody>
          </table>
        </section>

        <section class="help-section">
          <h4>Comparatif</h4>
          <table class="help-table">
            <thead>
              <tr><th>Modèle</th><th>Opérations CNC</th><th>Pièces</th><th>Complexité</th></tr>
            </thead>
            <tbody>
              <tr><td>Plateau</td><td>1</td><td>1</td><td>Facile</td></tr>
              <tr><td>Finger joint</td><td>1 par panneau</td><td>5+</td><td>Moyen</td></tr>
              <tr><td>Couvercle</td><td>1 par pièce</td><td>2</td><td>Moyen</td></tr>
              <tr><td>Empilable</td><td>2 (retournement)</td><td>1</td><td>Avancé</td></tr>
            </tbody>
          </table>
        </section>

      </div><!-- /panel boxes -->

      <!-- ══════════════ ONGLET FORMULES ══════════════ -->
      <div class="help-panel" data-panel="formules">

        <section class="help-section">
          <h4>Formules — n, Vc, Vf, Fz et ap</h4>
          <dl class="help-dl">

            <dt>n — Broche (tr/min)</dt>
            <dd>
              <div class="help-math">
                <math xmlns="http://www.w3.org/1998/Math/MathML" display="block">
                  <mrow><mi>n</mi><mo>=</mo><mfrac><mrow><mn>1000</mn><mo>×</mo><mi>Vc</mi></mrow><mrow><mi>π</mi><mo>×</mo><mi>D</mi></mrow></mfrac></mrow>
                </math>
              </div>
              <ul class="help-list">
                <li><em>n</em> — vitesse de rotation (tr/min)</li>
                <li><em>Vc</em> — vitesse de coupe (m/min), fournie par le fabricant selon le matériau</li>
                <li><em>D</em> — diamètre de l'outil (mm)</li>
              </ul>
            </dd>

            <dt>Vc — Vitesse de coupe (m/min)</dt>
            <dd>
              Valeur cible selon le matériau (ex. 120 m/min aluminium, 350 m/min MDF). Sur une petite machine, atteindre la Vc recommandée est souvent impossible avec un petit diamètre : une fraise Ø3 mm nécessiterait 37 000 tr/min pour Vc = 350 m/min.
              <div class="help-math">
                <math xmlns="http://www.w3.org/1998/Math/MathML" display="block">
                  <mrow><mi>Vc</mi><mo>=</mo><mfrac><mrow><mi>n</mi><mo>×</mo><mi>π</mi><mo>×</mo><mi>D</mi></mrow><mn>1000</mn></mfrac></mrow>
                </math>
              </div>
            </dd>

            <dt>Vf — Avance XY (mm/min)</dt>
            <dd>
              <div class="help-math">
                <math xmlns="http://www.w3.org/1998/Math/MathML" display="block">
                  <mrow><mi>Vf</mi><mo>=</mo><mi>n</mi><mo>×</mo><mi>Fz</mi><mo>×</mo><mi>Z</mi></mrow>
                </math>
              </div>
              <ul class="help-list">
                <li><em>Fz</em> — avance par dent (mm/dent)</li>
                <li><em>Z</em> — nombre de dents</li>
              </ul>
            </dd>

            <dt>Fz — Avance par dent (mm/dent)</dt>
            <dd>Distance parcourue par tour et par dent. Un Fz trop faible fait frotter l'outil sans couper — usure prématurée. Un Fz trop élevé surcharge et casse la fraise.</dd>

            <dt>ap — Profondeur de passe (mm)</dt>
            <dd>Matière enlevée en Z à chaque passe : <em>ap = k × D</em>, où k vient du tableau du fournisseur (selon la matière et le diamètre) et est plafonné par <strong>Prof. max</strong> (0,3 en finition, 0,6 en ébauche, 1 = pas de plafond). À baisser si la machine manque de rigidité.</dd>

          </dl>
        </section>

        <section class="help-section">
          <h4>Exemples — D = 3 mm, Z = 2, Fz = 0,05 mm/dent, MDF (Vc = 350 m/min), broche max 12 000 tr/min, Vf max 800 mm/min</h4>
          <p class="help-note">Ces exemples illustrent la distinction entre valeurs <strong>cibles</strong> (calculées sans tenir compte des limites machine) et valeurs <strong>effectives</strong> (après plafonnement).</p>
          <dl class="help-dl">

            <dt>Ex 1 — Vc effective à n = 12 000 tr/min</dt>
            <dd>
              <div class="help-math">
                <math xmlns="http://www.w3.org/1998/Math/MathML" display="block">
                  <mrow><mi>Vc</mi><mo>=</mo><mfrac><mrow><mn>12000</mn><mo>×</mo><mi>π</mi><mo>×</mo><mn>3</mn></mrow><mn>1000</mn></mfrac><mo>≈</mo><mn>113,1</mn><mtext> m/min</mtext></mrow>
                </math>
              </div>
              113 m/min alors que la cible MDF est 350 m/min — la broche est le facteur limitant.
            </dd>

            <dt>Ex 2 — n nécessaire pour Vc = 350 m/min</dt>
            <dd>
              <div class="help-math">
                <math xmlns="http://www.w3.org/1998/Math/MathML" display="block">
                  <mrow><mi>n</mi><mo>=</mo><mfrac><mrow><mn>1000</mn><mo>×</mo><mn>350</mn></mrow><mrow><mi>π</mi><mo>×</mo><mn>3</mn></mrow></mfrac><mo>≈</mo><mn>37 249</mn><mtext> tr/min</mtext></mrow>
                </math>
              </div>
              37 249 tr/min nécessaires — impossible avec une broche limitée à 12 000 tr/min.
            </dd>

            <dt>Ex 3 — Vf à n = 12 000 tr/min</dt>
            <dd>
              <div class="help-math">
                <math xmlns="http://www.w3.org/1998/Math/MathML" display="block">
                  <mrow><mi>Vf</mi><mo>=</mo><mn>12000</mn><mo>×</mo><mn>0,05</mn><mo>×</mo><mn>2</mn><mo>=</mo><mn>1 200</mn><mtext> mm/min</mtext></mrow>
                </math>
              </div>
              1 200 mm/min calculés → plafonnés à 800 mm/min (limite machine).
            </dd>

            <dt>Ex 4 — Abaisser n ne résout rien</dt>
            <dd>
              Réduire n à 8 000 tr/min pour tenir Fz = 0,05 dans la limite Vf = 800 mm/min donnerait :
              <div class="help-math">
                <math xmlns="http://www.w3.org/1998/Math/MathML" display="block">
                  <mrow><mi>Vc</mi><mo>=</mo><mfrac><mrow><mn>8000</mn><mo>×</mo><mi>π</mi><mo>×</mo><mn>3</mn></mrow><mn>1000</mn></mfrac><mo>≈</mo><mn>75,4</mn><mtext> m/min</mtext></mrow>
                </math>
              </div>
              75 m/min est inférieur à la Vc de <em>tous</em> les matériaux du calculateur, y compris l'aluminium (120 m/min). Ce n'est pas une solution — il faut accepter les conditions dégradées ou changer de diamètre.
            </dd>

          </dl>

          <p>Résumé de la <strong>double limitation</strong> : broche ET avance XY toutes deux plafonnées — Fz réelle tombe à 0,033 mm/dent au lieu de 0,050, l'outil frotte plus qu'il ne coupe.</p>
          <table class="help-table">
            <thead>
              <tr><th></th><th>Cible (sans limite)</th><th>Effectif (machine réelle)</th></tr>
            </thead>
            <tbody>
              <tr><td>n (tr/min)</td><td>37 249</td><td>12 000 — broche max</td></tr>
              <tr><td>Vf (mm/min)</td><td>3 725</td><td>800 — avance XY max</td></tr>
              <tr><td>Vc (m/min)</td><td>350</td><td>113</td></tr>
              <tr><td>Fz réelle (mm/dent)</td><td>0,050</td><td>0,033 — dégradée</td></tr>
            </tbody>
          </table>
        </section>

      </div><!-- /panel formules -->

      <!-- ══════════════ ONGLET ABAQUE ══════════════ -->
      <div class="help-panel" data-panel="abaque">

        <section class="help-section">
          <h4>Avance par dent — fz (mm/dent)</h4>
          <div class="help-table-wrap">
            <table class="help-table">
              <thead>
                <tr>
                  <th>Matière</th><th>vc m/min</th>
                  <th>≥ 1 mm</th><th>≥ 2 mm</th><th>≥ 3 mm</th>
                  <th>≥ 4 mm</th><th>≥ 6 mm</th><th>≥ 8 mm</th>
                </tr>
              </thead>
              <tbody>
                <tr><td>Bois exotique</td><td>150</td><td>0.003</td><td>0.010</td><td>0.013</td><td>0.015</td><td>0.018</td><td>0.025</td></tr>
                <tr><td>Bois massif</td><td>200</td><td>0.004</td><td>0.012</td><td>0.016</td><td>0.018</td><td>0.022</td><td>0.031</td></tr>
                <tr><td>CTP, bois tendres</td><td>250</td><td>0.005</td><td>0.012</td><td>0.016</td><td>0.020</td><td>0.024</td><td>0.033</td></tr>
                <tr><td>MDF, Valcromat</td><td>350</td><td>0.006</td><td>0.013</td><td>0.018</td><td>0.020</td><td>0.027</td><td>0.040</td></tr>
                <tr><td>PVC expansé, Forex</td><td>300</td><td>0.008</td><td>0.028</td><td>0.038</td><td>0.048</td><td>0.078</td><td>0.088</td></tr>
                <tr><td>PMMA, thermoplastiques</td><td>200</td><td>0.006</td><td>0.020</td><td>0.028</td><td>0.035</td><td>0.055</td><td>0.065</td></tr>
                <tr><td>Aluminium (2017A, 5083)</td><td>120</td><td>0.004</td><td>0.008</td><td>0.013</td><td>0.018</td><td>0.023</td><td>0.028</td></tr>
                <tr><td>Bronze, cuivre, laiton</td><td>120</td><td>0.003</td><td>0.006</td><td>0.008</td><td>0.013</td><td>0.018</td><td>0.023</td></tr>
              </tbody>
            </table>
          </div>
        </section>

        <section class="help-section">
          <h4>Profondeur de passe — ap = k × D</h4>
          <div class="help-table-wrap">
            <table class="help-table">
              <thead>
                <tr>
                  <th>Ø mm</th><th>Bois exotique</th><th>Bois massif</th><th>CTP, tendres</th>
                  <th>MDF</th><th>PVC, Forex</th><th>PMMA</th><th>Aluminium</th><th>Cuivre/Laiton</th>
                </tr>
              </thead>
              <tbody>
                <tr><td>1</td><td>0.2</td><td>0.2</td><td>0.5</td><td>0.5</td><td>0.5</td><td>0.5</td><td>0.2</td><td>0.1</td></tr>
                <tr><td>2</td><td>0.2</td><td>0.2</td><td>0.5</td><td>0.5</td><td>0.5</td><td>0.5</td><td>0.2</td><td>0.1</td></tr>
                <tr><td>2.5</td><td>0.2</td><td>0.2</td><td>0.5</td><td>0.5</td><td>0.5</td><td>0.5</td><td>0.2</td><td>0.1</td></tr>
                <tr><td>3</td><td>0.3</td><td>0.4</td><td>0.5</td><td>0.5</td><td>0.5</td><td>0.5</td><td>0.4</td><td>0.1</td></tr>
                <tr><td>3.175</td><td>0.3</td><td>0.4</td><td>0.5</td><td>0.5</td><td>0.5</td><td>0.5</td><td>0.4</td><td>0.1</td></tr>
                <tr><td>4</td><td>0.4</td><td>0.5</td><td>0.5</td><td>0.5</td><td>0.5</td><td>0.5</td><td>0.5</td><td>0.2</td></tr>
                <tr><td>5</td><td>0.4</td><td>0.5</td><td>0.5</td><td>0.5</td><td>0.5</td><td>0.5</td><td>0.5</td><td>0.25</td></tr>
                <tr><td>6</td><td>0.4</td><td>0.5</td><td>0.5</td><td>0.5</td><td>0.5</td><td>0.5</td><td>0.5</td><td>0.3</td></tr>
                <tr><td>8</td><td>0.4</td><td>0.5</td><td>0.5</td><td>0.5</td><td>0.5</td><td>0.5</td><td>0.5</td><td>0.3</td></tr>
              </tbody>
            </table>
          </div>
          <p class="help-note" style="margin-top:8px">Ex. MDF avec Ø3 mm → k = 0,5 → ap = 3 × 0,5 = 1,5 mm (approche prudente)</p>
          <p class="help-note">
            Source : <em>cncfraises.fr</em>, adaptée pour une approche prudente sur machine amateur :<br>
            · Vitesses réduites — vc et fz légèrement abaissées par rapport aux données d'origine, pour tenir compte de la rigidité limitée des portiques à usage amateur.<br>
            · ap cohérentes entre diamètres — les coefficients k ont été homogénéisés pour éviter des sauts illogiques d'un pas de diamètre à l'autre.<br>
            · PMMA ajusté — l'acrylique fond si le fz est trop élevé ; les valeurs ont été réduites pour éviter la fusion et le collage de copeaux sur l'outil.
          </p>
        </section>

      </div><!-- /panel abaque -->

    </div><!-- /help-body -->
  `;

  overlay.appendChild(modal);
  document.body.appendChild(overlay);

  // Logique des onglets
  modal.querySelectorAll('.help-tab').forEach(tab => {
    tab.addEventListener('click', () => {
      modal.querySelectorAll('.help-tab').forEach(t => t.classList.remove('active'));
      modal.querySelectorAll('.help-panel').forEach(p => p.classList.remove('active'));
      tab.classList.add('active');
      modal.querySelector(`.help-panel[data-panel="${tab.dataset.tab}"]`).classList.add('active');
    });
  });

  const close = () => overlay.remove();
  modal.querySelector('.help-close').addEventListener('click', close);
  overlay.addEventListener('click', e => { if (e.target === overlay) close(); });
}
