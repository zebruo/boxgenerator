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
  const defLeadR  = +(td * 0.8).toFixed(2);

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
    </div>
    <div class="help-body">

      <!-- ══════════════ ONGLET G-CODE ══════════════ -->
      <div class="help-panel active" data-panel="gcode">

      <!-- ── Colonne de gauche ─────────────────────────────── -->
      <section class="help-section">
        <h4>Colonne de gauche — Paramètres</h4>
        <dl class="help-dl">
          <dt>Modèle de boîte</dt>
          <dd>Choisit le type de construction :
            <strong>Plateau</strong> (fond + 4 parois inclinées, sans couvercle),
            <strong>Encoches</strong> (finger joint — panneaux assemblés par tenons-mortaises),
            <strong>Couvercle</strong> (corps + couvercle emboîtable avec feuillure),
            <strong>Empilable</strong> (bords inversés pour empilage). Le modèle détermine quelles panneaux sont générés et comment le G-code les découpe.
          </dd>
          <dt>Forme du contour</dt>
          <dd>Définit le plan de base de la boîte :
            <strong>Rectangle</strong>, <strong>Cercle</strong>, <strong>Ovale</strong>, <strong>Hexagone</strong>, <strong>Polygone</strong> (N côtés), <strong>Haricot</strong>. Tous les panneaux et contours sont calculés à partir de cette forme.
            <br><br>
            <strong>Haricot</strong> — contour organique à zone concave, défini par une courbe de Bézier cubique fixe mise à l'échelle selon la <em>Longueur</em> (axe Y) et la <em>Largeur</em> (axe X).
            Le profil ne se paramètre pas : seules les dimensions globales changent.
            Un <strong>ratio Largeur/Longueur entre 0,5 et 1,5</strong> est conseillé (avertissement affiché hors plage).
            La zone concave impose <strong>⌀ fraise ≤ 2 × rayon de courbure minimum</strong> du creux — préférer une fraise fine (Ø 3 – 4 mm) pour les petits formats.
            Vérifier dans le visualiseur G-code que la trajectoire suit bien le creux avant usinage.
          </dd>
          <dt>Dimensions</dt>
          <dd>Paramètres propres à la forme sélectionnée (largeur, hauteur, rayon…) et au modèle de boîte (hauteur paroi, épaisseur, jeu d'assemblage…). Ces valeurs alimentent directement la génération G-code et la prévisualisation 3D.</dd>
          <dt>Matière &amp; Outil</dt>
          <dd>
            <strong>Brut</strong> — épaisseur totale calculée automatiquement depuis la hauteur de boîte + offset de brut (lecture seule).<br>
            <strong>Diam. fraise</strong> — diamètre de l'outil en mm ; utilisé pour l'offset de contour et les valeurs par défaut de la modale d'export.<br>
            <strong>Prof./passe</strong> — profondeur de coupe par passe Z ; le nombre de passes est déduit automatiquement (⌈brut ÷ prof.⌉).<br>
            <strong>Vitesse XY / Z</strong> — avance en mm/min pour les mouvements de coupe (G1) et de plongée.<br>
            <strong>Broche</strong> — vitesse de rotation en tr/min (commande <span class="help-mono">S…M3</span>).<br>
            <strong>Survol Z</strong> — hauteur de sécurité entre opérations (commande <span class="help-mono">G0 Z…</span>).
          </dd>
        </dl>
      </section>

      <!-- ── Colonne de droite ───────────────────────────── -->
      <section class="help-section">
        <h4>Colonne de droite — Panneau G-code</h4>
        <dl class="help-dl">
          <dt>Générer</dt>
          <dd>Calcule et affiche le G-code complet à partir des paramètres courants (forme, modèle de boîte, matière et outil). Le résultat est mis à jour à chaque clic — il n'est pas recalculé automatiquement.</dd>
          <dt>Statistiques</dt>
          <dd>Affiche le nombre total de lignes du programme et le nombre de mouvements <span class="help-mono">G1</span> (trajectoires avec avance contrôlée). Utile pour estimer la durée d'usinage.</dd>
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
          <dd>Exporte les panneaux à plat en SVG vectoriel. Utile pour vérification ou découpe laser.</dd>
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
        <p>Arc tangentiel d'entrée et de sortie sur le contour. L'outil rejoint la trajectoire par un arc de cercle plutôt que par une plongée directe, éliminant la marque d'arrêt en surface. Recommandé pour toutes les passes de finition.</p>
      </section>

      <!-- ── Tabs ────────────────────────────────────────── -->
      <section class="help-section">
        <h4>Tabs de maintien</h4>
        <p>Ponts de matière laissés sur la <strong>dernière passe uniquement</strong> pour maintenir la pièce dans le brut. L'outil remonte automatiquement au-dessus de chaque tab. Ils sont répartis uniformément sur le périmètre et évitent les angles du contour.</p>
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
              <td class="help-formula">0,8 × ⌀outil</td>
              <td class="help-val">${defLeadR} mm</td>
              <td>Arc suffisamment grand pour être tangentiel mais compact</td>
            </tr>
          </tbody>
        </table>
        <p class="help-note">
          Exemple : en passant de ⌀ 3,175 mm → ⌀ 6 mm, la modale s'ouvre avec
          12 mm / 3,6 mm / 4,8 mm au lieu de 6,35 mm / 1,9 mm / 2,5 mm.
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
            <dt>Contour</dt><dd>Découpe extérieure en pleine épaisseur matière.</dd>
            <dt>Usage</dt><dd>Rangements, bacs, tiroirs. Compatible toutes formes (rectangle, ovale, hexagone…).</dd>
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
            <dt>Rainure intérieure — couvercle ajusté</dt>
            <dd>La feuillure est creusée à l'<strong>intérieur</strong> du bord supérieur du corps. Le couvercle est légèrement plus petit que le corps — sa lèvre s'emboîte dans la rainure. La feuillure corps couvre toute la zone intérieure : la cavité est usinée en repartant du fond de feuillure déjà usiné.</dd>
            <dt>Rainure extérieure — couvercle plein</dt>
            <dd>La feuillure est creusée sous forme d'<strong>anneau périphérique</strong> en haut du corps. Le couvercle a les mêmes dimensions extérieures que le corps et vient coiffer le sommet. La feuillure couvercle est une poche centrale qui forme la lèvre. La cavité corps repart de Z=0 (l'anneau n'a pas pré-usiné l'intérieur).</dd>
            <dt>Contrainte fraise / feuillure (rainure extérieure uniquement)</dt>
            <dd>L'anneau périphérique est usiné par passes concentriques. Le <strong>diamètre fraise doit être strictement inférieur à (largeur feuillure + jeu)</strong> — un warning s'affiche sur le champ si ce n'est pas le cas. Pour une feuillure de 3 mm + jeu 0,3 mm, utiliser une fraise &lt; 3,3 mm (ex. Ø 3,175 mm).</dd>
            <dt>Jeu</dt><dd>Décalage entre lèvre et rainure pour un assemblage sans forcer. Valeur typique : 0,2 – 0,5 mm selon la précision machine.</dd>
            <dt>Layout d'export</dt>
            <dd>Corps et couvercle sont placés côte à côte dans le G-code. Le sens est choisi automatiquement pour <strong>minimiser le côté le plus long du brut</strong> : horizontal si W ≤ D, vertical si W &gt; D. Exemple : 140×65 mm → layout vertical, brut 140×150 mm au lieu de 300×65 mm.</dd>
            <dt>Hauteurs différentes</dt>
            <dd>Si corps et couvercle ont des hauteurs différentes, un <strong>avertissement à l'export</strong> rappelle qu'il faut deux bruts séparés aux épaisseurs correspondantes. Exporter corps et couvercle séparément : le couvercle exporté seul est automatiquement recentré à l'origine (X=0 Y=0).</dd>
            <dt>Usage</dt><dd>Coffrets, boîtes à bijoux, étuis de présentation.</dd>
          </dl>
        </section>

        <section class="help-section">
          <h4>Boîte empilable</h4>
          <p>Corps creux avec un plot qui s'emboîte dans la cavité de la boîte du dessous. Nécessite <strong>deux opérations</strong> avec retournement de la pièce.</p>
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
                <td>Contour 100 % circulaire — pas d'angle mort. Idéal pour toutes fraises.</td>
              </tr>
              <tr>
                <td><strong>Ovale</strong></td>
                <td>Longueur, Largeur</td>
                <td>Ellipse lisse. Aucun coin vif — très favorable à la CNC.</td>
              </tr>
              <tr>
                <td><strong>Hexagone</strong></td>
                <td>Diamètre, Rayon de coin</td>
                <td>6 coins — arrondir pour éviter que la fraise ne bloque. Orienter à plat ou en pointe.</td>
              </tr>
              <tr>
                <td><strong>Polygone</strong></td>
                <td>Diamètre, Nb côtés, Rayon de coin</td>
                <td>Plus le nombre de côtés est faible, plus les coins sont aigus — augmenter le rayon en conséquence.</td>
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
