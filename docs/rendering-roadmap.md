# Feuille de route — rendu de qualité AAA

Objectif : amener le rendu d'OpenSkyFlight au niveau des techniques des jeux AAA, avec une seule
contrainte : l'application doit continuer à fonctionner dans un navigateur (WebGPU, repli WebGL2).

Ce document est la **source de vérité de l'avancement**. Il est lu en début de session et mis à jour
en fin de session.

## État courant (mis à jour le 2026-11-24)

- **Lots terminés** : 0, 1 et 2, fusionnés dans `main` (lot 2 le 2026-11-24). Lot 2 : toutes les tâches faites sauf le reste optionnel de
  L2.6 (décodage d'altitude dans un worker, `compileAsync`), reporté : p5 et p1 ne le justifient
  plus. Bilan dans **Mesures** (lignes « Clôture du lot 2 ») et constats visuels sous les tableaux.
- **three.js** : r187 (import map d'`index.html`), mis à jour depuis r183 pour le TRAA compatible avec
  la profondeur inversée.
- **Git** : tout est dans `main` (lots 0 à 2, correctifs de dépendances, décision three-tile) ;
  créer la branche du lot 3 depuis `main` : `feat/render-atmosphere`.
- **Environnement local** : bundle three-tile construit, `npm install` fait (racine et
  `vendor/three-tile`), cache `cache/` chaud pour les vues de référence et les deux vols. Lancer
  `npm run dev` en tâche de fond avant toute mesure. Mesurer **sur l'écran intégré 120 Hz** : sur un
  écran 60 Hz, Chrome plafonne à 60 FPS (la résolution dynamique ne se déclenche plus à tort depuis
  L2.4, mais les FPS ne sont pas comparables).
- **Référence de comparaison** : `benchmarks/render/lot2/` (état de clôture du lot 2, preset High :
  captures des **6** vues avec coût GPU **à pleine résolution**, échelle, luminance adaptée, draw
  calls et triangles, deux benchmarks de vol, non versionnés). Chiffres dans **Mesures**, lignes
  « Clôture du lot 2 » ; captures versionnées dans `docs/screenshots/render/lot2/`. **Les coûts GPU antérieurs à L2.4 ont été mesurés à
  1028×645** (voir Outillage) : ne comparer qu'aux lignes « pleine résolution ».
- **Vue 6** (face au soleil bas, massif en contre-jour) ajoutée pour le bloom, et plus tard les rayons
  crépusculaires et le reflet d'objectif (L4.7).
- **Lire les temps GPU** (voir Outillage) : seul le « coût GPU » de `render:capture` (`gpuMedianMs`,
  mesuré GPU saturé) compare deux états du code ; la colonne GPU des vols indique la charge, pas le coût.
- **Rendu** : `js/rendering/ScenePipeline.js` — `RenderPipeline` : passe de scène HalfFloat (profondeur
  float32, MRT couleur + vitesse, sans MSAA, échelle réglable) → `taau()` (reconstruction à la
  résolution de sortie) → `bloom()` ajouté à l'image TAAU → × correction d'exposition automatique
  (`AutoExposureNode`, histogramme mesuré sur l'image TAAU) → tone mapping et espace couleur en sortie.
  Seuil du bloom fixé par `AtmosphericSky` (voir L2.3) ; échelle de la passe de scène pilotée par
  `AdaptiveQualityManager` (voir L2.4), plafonnée par `CONFIG.renderScale`.
- **Réglages** : menu ouvert par Échap (`js/ui/ControlPanel.js`), généré depuis
  `js/utils/settingsSchema.js` ; presets et correspondance réglages utilisateur → valeurs techniques
  dans `js/utils/qualityPresets.js` ; `localStorage` et paramètres d'URL dans
  `js/utils/settingsStore.js`. `render:capture` et `render:benchmark` ouvrent l'app avec `?dev=1`
  (et HUD / mini-carte masqués par l'URL pour les captures), dans un profil vierge : preset High,
  identique à l'état d'avant L2.10, donc les mesures de référence restent comparables.
- **Lot 3 en cours** sur `feat/render-atmosphere` (non poussée) : L3.1 fait (bibliothèque takram
  copiée et corrigée dans `vendor/takram/`), L3.2 à L3.4 en partie. Code : `js/atmosphere/AtmosphericSky.js`
  (contexte d'atmosphère dans `renderer.contextNode`, repère ECEF recalé chaque frame sous la caméra,
  soleil réglé dans le repère du monde puis converti, ciel + perspective aérienne via
  `ScenePipeline.setAtmosphere`, seuil du bloom en nœud TSL), `js/rendering/ScenePipeline.js`.
  Pièges rencontrés : la direction de la lune doit être un vecteur unitaire même sans lune (sinon la
  PMREM du ciel se régénère à chaque frame, +2 ms) ; `renderer.info.autoReset` coupé (la remise à zéro
  de three tournait parfois après la frame de l'app : draw calls à 0) ; le ciel en `scene.backgroundNode`
  coûtait ≈ 0,5 ms (évalué sous tout le terrain), d'où son calcul dans la passe d'atmosphère.
- **Prochaine session** : 1) faire trancher par l'utilisateur le contraste de l'éclairage (voile
  gris-lavande sur le terrain, ciel délavé par rapport au lot 2 ; comparaisons dans
  `benchmarks/render/l3-cal/`, `l3-indirect/`, `l3-albedo/`) : environnement PMREM (actuel, reflets
  de l'avion) ou lumière indirecte d'`AtmosphereLight` en chaque point (ombres plus contrastées, mais
  plus de reflets sur l'avion), puis éventuellement exposition/étalonnage ; 2) volume de perspective
  aérienne (L3.2) pour revenir dans le budget de 1 ms ; 3) rétablir « Air clarity » (densité des
  aérosols : les paramètres sont figés dans les shaders, il faut recréer le contexte d'atmosphère et
  recompiler) ; 4) L3.5 (heure du jour, position astronomique du soleil : `astronomy-engine` ou les
  fonctions de la bibliothèque, l'entrée principale de takram tire `postprocessing`, à éviter).
- **Suite** : lot 3 (atmosphère physique et heure du jour). Points ouverts : coût CPU de soumission (≈ 5 µs par
  draw call) qui limite Ultra à 120 Hz ; minimap OSM bloquée par la politique d'usage des tuiles
  d'OpenStreetMap (hors rendu, voir **Problèmes hors rendu relevés**).
---

## Comment reprendre le travail (début de session)

1. Lire ce fichier en entier, en particulier **Journal des sessions** et **Décisions**.
2. `git status` et `git log --oneline -15` pour voir où en est le code.
3. Reprendre la première tâche `[ ]` ou `[~]` du lot en cours.
4. En fin de session : cocher les tâches, renseigner les mesures, ajouter une entrée au journal
   (fait / reste à faire / problèmes ouverts / prochaine étape précise).

Légende : `[ ]` à faire · `[~]` en cours · `[x]` terminé · `[-]` abandonné (raison dans Décisions)

## Conventions

- Une branche par lot : `feat/render-<thème>` (ex. `feat/render-hdr-pipeline`), fusion dans `main` à la
  clôture du lot.
- Les identifiants `Lx.y` servent **uniquement** dans ce document. Les commits, commentaires, PR et
  issues décrivent le comportement du code, sans référence aux lots, aux tâches ou aux sessions.
  Format de commit : `<type>: <description>`.
- Toute modification de `vendor/three-tile/packages/lib/src` impose de reconstruire le bundle :
  `cd vendor/three-tile && npm run build:lib`.
- Chaque effet coûteux est activable/désactivable et rattaché à un preset de qualité (voir L2.7).
- Les fonctionnalités qui exigent des compute shaders doivent se désactiver proprement quand le
  renderer bascule sur le backend WebGL2.
- Les modes `sar` et `elevation` doivent continuer à fonctionner après chaque lot.

## Critères de sortie communs à chaque lot

- Comparaison avant/après sur les **vues de référence** (L0.3), captures dans `docs/screenshots/render/`.
- Benchmark (touche `B`) sur le plan de vol de référence : FPS moyen, p5, p1, temps GPU, comparés à la
  baseline et consignés dans **Mesures**.
- Pas de régression de p1 de plus de 10 % sans décision explicite.
- `npm run lint` passe.

## Budget de frame cible

Cible : 60 FPS sur M4 Pro / Chrome, preset High, résolution native ×2 avec mise à l'échelle temporelle.

| Poste | Budget GPU (ms) |
|---|---|
| Terrain (géométrie + shading) | 5.0 |
| Ombres (cascades + relief) | 2.0 |
| Atmosphère (LUT + perspective aérienne) | 1.0 |
| Nuages volumétriques | 3.0 |
| Eau | 1.0 |
| Post-traitement (TRAA, bloom, tone mapping, etc.) | 2.0 |
| Avion + particules | 1.0 |
| Marge | 1.6 |
| **Total** | **16.6** |

---

## Lot 0 — Préparation et mesure de référence

- [x] **L0.1** Construire le bundle three-tile (`cd vendor/three-tile && npm install && npm run build:lib`).
      Le fichier `dist/three-tile-osf.js` est ignoré par git (`vendor/three-tile/.gitignore`) alors
      qu'`index.html` l'importe : la construction est documentée comme obligatoire dans le README.
- [x] **L0.2** Scénarios de benchmark : vol par défaut (≈ 5 min à 6 000 m, comparable à `BENCHMARKS.md`)
      et plan de vol 1 `flight-over-the-Alps-01.json` (descente vers ≈ 1 300 m, basse altitude).
- [x] **L0.3** Vues de référence reproductibles (`js/constants/referenceViews.js`), touche `K` pour les
      parcourir, `?view=N` dans l'URL, et `window.osf` (état du chargement des tuiles, temps GPU,
      sélection de vue) pour l'automatisation :
      1. Mont Blanc en vue rasante, soleil haut
      2. Vallée de Chamonix à basse altitude
      3. Lac d'Annecy
      4. Massif au coucher du soleil (élévation 5°)
      5. Au-dessus de la couche nuageuse
- [x] **L0.4** Captures et benchmark baseline (voir **Mesures**). Captures allégées dans
      `docs/screenshots/render/baseline/`, pleine résolution et JSON dans `benchmarks/render/baseline/`
      (ignoré par git).
- [x] **L0.5** Supprimer le code mort `js/geo/TextureProvider.js`.

### Outillage de mesure

Prérequis : `npm install`, serveur lancé (`npm run dev`), Google Chrome installé.

```bash
# Captures + FPS + coût GPU des vues de référence (--renders 12 par défaut ; --views 1,6 ; --set clé=valeur)
npm run render:capture -- --out benchmarks/render/<label>
# Benchmark de vol (sans --plan : vol par défaut ; --plan 1 : flight-over-the-Alps-01)
npm run render:benchmark -- --out benchmarks/render/<label> [--plan 1]
# Indicateurs comparables (colonnes du tableau Mesures) pour un ou plusieurs rapports
npm run render:summary -- benchmarks/render/<label>/benchmark-default.json benchmarks/render/<label>/benchmark-plan1.json
```

- Chrome est lancé en fenêtre visible avec vsync, canevas 2056×1290 ×2 (= configuration n°4 de
  `BENCHMARKS.md`). Le mode headless ou sans vsync ne présente pas chaque frame : ses FPS sont faux.
- Sur un écran 120 Hz, les vues statiques plafonnent à 120 FPS : comparer le **temps GPU**, et le
  p1 des benchmarks de vol pour les saccades.
- Lancer chaque mesure deux fois de suite si le cache de tuiles (`cache/`) est vide : la première
  passe le remplit.
- Temps GPU (`GPUTimer`) : durée entre le début de la première passe de rendu d'une frame et la fin
  de la dernière, lue dans les horodatages bruts du pool de requêtes de three (r183). Additionner les
  durées des passes, comme `resolveTimestampsAsync`, compte deux fois leur chevauchement sur un GPU
  à tuiles (≈ +60 %).
- **À vsync, le temps GPU ne mesure pas le coût d'une frame.** Le régulateur de fréquence du GPU
  Apple ralentit le GPU tant qu'il a de la marge : une frame légère occupe ≈ 75 % de l'intervalle de
  rafraîchissement (≈ 6 ms à 120 Hz) quel que soit son coût, et la fréquence choisie varie d'une
  capture à l'autre (d'où les médianes bimodales ≈ 5 / ≈ 10 ms d'avant L2.9). `render:capture`
  rend donc chaque vue `--renders` fois par frame (`window.osf.setRendersPerFrame`) pour que le GPU
  soit le goulot à fréquence stable, et rapporte la durée ÷ nombre de rendus (`gpuMedianMs`).
  `gpuBusy` (≈ temps GPU × FPS) proche de 1 confirme que le GPU était le goulot. Garder le même
  `--renders` entre deux mesures comparées : le coût par rendu baisse de ≈ 15 % entre 4 et 16 rendus
  (chevauchement entre rendus successifs).
- Découpage par sous-système : les passes se chevauchant, leurs durées ne s'additionnent pas.
  Mesurer le coût d'un effet par différence, coût GPU avec et sans l'effet (`--set <clé>=false`).
- Les répétitions avancent la frame de nœuds de three : chaque répétition rend toute la frame (scène,
  TRAA, bloom, sortie). Avant L2.3, la passe de scène passait en mise à jour « par rendu » et TRAA
  ne se résolvait qu'une fois ; three comptant chaque rendu de quad comme un rendu, la scène était
  aussi re-rendue dans la résolution TRAA (13 scènes pour 12 rendus) : coûts surestimés de ≈ 5–9 %.
- **Jusqu'à L2.3 inclus, le coût GPU a été mesuré à 1028×645 au lieu de 4112×2580.** L'ancien
  `AdaptiveQualityManager` baissait le `pixelRatio` de 0,05 par frame dès que l'intervalle moyen
  dépassait 20 ms, ce que provoquent les 12 rendus par frame : le canevas tombait de 4112 à 1028 px
  de large en ≈ 0,5 s, avant la fenêtre de mesure (vérifié en relevant `canvas.width`). Les coûts
  consignés reflétaient surtout la géométrie ; les effets plein écran étaient sous-estimés (bloom :
  +0,3 ms mesuré, +0,2 à +0,9 ms à pleine résolution). Captures d'écran et vols non affectés (la
  résolution remontait en moins d'une seconde). Depuis L2.4 la résolution dynamique lit le temps GPU
  par rendu et ne réagit plus aux rendus répétés.
- À pleine résolution, deux captures successives concordent à ±1 % sur les vues 1, 3, 4 et 6, à
  ±12–14 % sur les vues 2 et 5.
- Les vues 2 à 5 varient jusqu'à ±0,5 ms entre deux captures identiques ; les vues 1 et 6 à
  ±0,05 ms. Mesurer un effet bon marché par différence sur les vues 1 et 6.
- `--views` (sous-ensemble de vues) change la séquence de chargement des tuiles : triangles et coût
  diffèrent de la capture complète (vue 2 : 2,36 M contre 2,60 M). Ne comparer que des séquences
  identiques.

## Lot 1 — Gains rapides

- [x] **L1.1** Filtrage anisotrope ×16 sur les textures de tuiles (`LoaderFactory.textureAnisotropy`
      dans three-tile, fixé depuis `renderer.getMaxAnisotropy()`). Gain visible au loin seulement : le
      flou du premier plan est un agrandissement de texture (imagerie z15), pas une minification.
- [x] **L1.2** Tone mapping AgX, exposition 0,35. Soleil, ciel et ambiance partagent l'échelle de radiance
      du ciel de Preetham (`js/atmosphere/preethamSky.js`, port CPU de `SkyMesh`) : couleur du soleil =
      transmittance du modèle, intensité calée sur un rapport soleil/ciel de 5:1 à 55° ; nappe nuageuse
      éclairée ; palette du mode `elevation` convertie de sRGB en albédo linéaire. SAR sans tone mapping.
- [x] **L1.3** Tampon de profondeur inversé. `SkyMesh` force sa profondeur à 1 (= plan proche une fois
      inversé) : le ciel est dessiné en premier, sans test de profondeur. Le framebuffer par défaut est
      en `depth24plus` (stocké en float32 par Metal) ; viser `Depth32Float` avec la cible HDR de L2.1.
- [x] **L1.4** Carte d'environnement du ciel (`SkyEnvironment.js` : PMREM 256, hémisphère de sol pour le
      rebond, disque solaire masqué car déjà apporté par la lumière directionnelle), régénérée à chaque
      changement de soleil. **Appliquée à l'avion seulement** : en `scene.environment`, elle faisait
      exploser les saccades (voir Décisions). Le terrain reçoit une `HemisphereLight` dérivée du même
      modèle. Fait avec L2.6 : PMREM en `scene.environment` pour toute la scène, `HemisphereLight` retirée.
- [x] **L1.5** Élévation du soleil par défaut : 35°.
- [x] **L1.6** Rendre le ciel visible : `NodeMaterial.fog` vaut `true` par défaut et `SkyMesh` ne le
      désactive pas ; avec le dôme à 4,5e6 m et `fogDensity` 1,5e-5, le brouillard recouvre 100 % du
      ciel. Le ciel affiché est la couleur unie du brouillard (visible sur toutes les captures
      baseline). Correctif : `sky.material.fog = false`, puis caler la couleur du brouillard sur le
      ciel à l'horizon en attendant le lot 3. Fait : couleur du brouillard = radiance du modèle moyennée
      sur l'horizon ; nuages procéduraux intégrés à `SkyMesh` (r183, couverture 0,4 par défaut)
      désactivés, ils doublonnaient `CloudLayer` et coûtaient ≈ 4 ms GPU.
- [x] **L1.7** Convention d'azimut du soleil : `CONFIG.sunAzimuth` est le θ sphérique (0 = sud, 90 = est),
      donc la valeur par défaut 180 place le soleil **au nord**, à l'opposé des ombres incrustées dans
      l'imagerie satellite. Passer à un azimut boussole (défaut ≈ 160°), et simplifier
      `compassToSunAzimuth` (`AtmosphericSky.js`) en conséquence. Fait : `sunAzimuth` est un cap boussole,
      défaut 160°.
- [x] **L1.8** Exagération verticale : three-tile travaille en unités Web Mercator (`mapDepth = 1`).
      À 45,8° de latitude, une unité horizontale vaut 1/cos(lat) ≈ 1,43 m réel, alors que l'altitude est
      en mètres : le relief est affiché à ≈ 70 % de sa hauteur. Multiplier l'élévation par 1/cos(lat)
      dans `TerrariumTSL.ts`, et convertir en conséquence l'altitude affichée (HUD), l'altitude sol
      (`getGroundElevation`), les vues de référence et les plans de vol (y en unités monde).
      Fait autrement (voir Décisions) : la carte est réduite horizontalement de cos(lat du centre),
      1 unité monde = 1 m sur les trois axes. Vitesse par défaut 560 m/s (= l'ancienne vitesse réelle),
      brouillard 2,1e-5 /m, plans de vol `units: 'metres'` (conversion à la lecture des anciens).

## Lot 2 — Socle : pipeline HDR et performance

- [x] **L2.1** `RenderPipeline` : passe de scène en HDR (HalfFloat), tone mapping déplacé en fin de pipeline.
      Fait : `ScenePipeline.js`, profondeur `Depth32Float` (L1.3) ; reconstruction de la sortie quand
      `renderer.toneMapping` change (SAR). La passe de scène se met à jour une fois par frame : pour la
      mesure GPU répétée, elle passe en mise à jour par rendu. Image, coût GPU et cadence inchangés.
- [x] **L2.2** TRAA (`TRAANode`) avec tampon de vitesse (MRT) ; retirer le MSAA.
      Fait après passage de three r183 à r187 : le `TRAANode` de r183 ne gère pas la profondeur inversée
      (« plus proche » = minimum, historique de profondeur en `depth24plus`, incopiable depuis
      `depth32float`) ; corrigé à partir de r184. Comparé au MSAA sur captures fixes et en vol (plan 1,
      25/45/65 s, recadrages pleine résolution) : bords et détails lointains équivalents, avion à peine
      plus doux, pas de traînées. Coût +0,3–0,5 ms GPU.
- [x] **L2.3** Bloom (`BloomNode`) à seuil physique (soleil, reflets spéculaires).
      Fait : `bloom()` sur l'image TRAA (pas de scintillement des reflets sous-pixel), ajouté avant
      tone mapping. Seuil = max(radiance d'une surface diffuse blanche face au soleil,
      (E_soleil + E_ciel)/π ; radiance du ciel à 0,5° du centre du soleil) : à soleil bas, l'auréole de
      Preetham (≈ 14 à 10° d'élévation) dépasse de loin toute surface diffuse (1,6) et aurait voilé le
      ciel. Genou de la largeur du seuil. Disque de `SkyMesh` ≈ 6·10⁴, donc seuls le disque et les
      reflets spéculaires du soleil passent. Strength 0,015, radius 0,8 (comparé à 0,03/0,4, cœur
      saturé trop large, et 0,008/1, soleil trop petit). Vue 1 inchangée (écart moyen 0,17 %, bruit
      TRAA). Coût +0,26–0,33 ms ; désactivable (panneau, `bloomEnabled`), coupé en SAR.
- [x] **L2.4** Résolution dynamique : `AdaptiveQualityManager` pilote l'échelle de rendu interne
      reconstruite par TRAA, au lieu du `pixelRatio`.
      Fait : le `TRAANode` r187 suppose des tampons de même taille ; three r187 fournit `TAAUNode`
      (même accumulation, reconstruction à la résolution de sortie par filtre gaussien sur 9
      échantillons). TAAU remplace TRAA, aussi à l'échelle 1 (pas de recompilation de la chaîne quand
      l'échelle change ; image indiscernable de TRAA, +0,1 à +0,8 ms). `AdaptiveQualityManager` règle
      `PassNode.setResolutionScale` d'après la médiane du temps GPU sur 30 frames, budget 60 FPS :
      baisse proportionnelle à la surcharge au-delà de 90 % du budget, hausse de 0,05 sous 80 % après
      2 s sans changement, plancher 0,5 ; repli sur l'intervalle entre frames sans mesure GPU.
      Surcharge simulée (5 rendus par frame, ≈ 24 ms) : échelle 1 → 0,57 en 2 s, 68 FPS, retour à 1
      en ≈ 17 s sans oscillation. Échelle 0,75 indiscernable de 1 ; 0,5 plus douce, marches sur les
      crêtes lointaines. Gain limité (−0,7 à −2,3 ms à 0,5) : la frame est dominée par la géométrie
      et TAAU, bloom et sortie restent à pleine résolution. `renderScale` et `dynamicResolution`
      dans `config.js` ; l'échelle est enregistrée dans les benchmarks et les captures.
- [x] **L2.5** Rétablir le frustum culling des tuiles (`GeoTerrainManager.js:154`) avec des boîtes
      englobantes calculées depuis l'altitude min/max de chaque tuile.
      Fait : `DisplacedTileGeometry` (`TerrariumShaderLoader.ts`) élargit ses bornes de la plage
      d'altitude de la tuile ; culling rétabli. **Aucun gain** : sur les 5 vues, aucune tuile visible
      n'est hors du frustum (three-tile ne raffine que les tuiles dans le champ, les grosses tuiles
      grossières le recoupent toujours) ; draw calls identiques. Les bornes justes serviront au culling
      des cascades d'ombre (L5.3). Le point de mesure LOD reste au centre de la tuile au niveau de la
      mer (voir Décisions).
- [~] **L2.6** Réduire les saccades (p1) : précompilation des pipelines (`compileAsync`), matériaux de
      tuiles partagés au lieu d'un `clone()` par tuile, décodage d'image dans un worker. Chaque tuile a
      son propre graphe de nœuds (clone + `positionNode` propre) reconstruit sur le CPU à son arrivée ;
      c'est ce qui interdit pour l'instant la carte d'environnement sur le terrain (L1.4). Une fois les
      matériaux partagés, passer la PMREM en `scene.environment` et retirer la `HemisphereLight`.
      Fait : three indexe les graphes compilés par clé de matériau, et la clé d'un nœud est son `id` :
      le `positionNode` propre à chaque tuile forçait une compilation (graphe + WGSL) par tuile. Un seul
      graphe d'élévation est désormais partagé ; la texture d'altitude est liée par objet
      (`onObjectUpdate` sur le nœud de texture de base, lu par ses clones `load()` / `size()`), la taille
      de grille lue par `textureSize`. Toute la scène tient en 11 graphes compilés. Frames > 33 ms
      46 → 3 et p1 33 → 62 (vol par défaut). PMREM ensuite passée en `scene.environment`, sans effet sur
      les saccades. Reste, optionnel : décodage d'altitude dans un worker (≈ 1,1 ms par tuile sur le
      thread principal), `compileAsync`.
- [x] **L2.7** Presets de qualité (Low / Medium / High / Ultra) dans `config.js` et le panneau MFD.
      Réglages disponibles dans `config.js` : `maxPixelRatio` (résolution de sortie), `renderScale` et
      `dynamicResolution` (`AdaptiveQualityManager`), `bloomEnabled`, `autoExposure`, `maxTotalTiles`,
      `lodRingRadius` ; dans three-tile : `LODThreshold` (1,2) et l'anisotropie des textures, fixés
      dans `GeoTerrainManager.js`. Un preset = un jeu de valeurs appliqué par `update()`, un réglage
      modifié à la main fait passer en « Custom ». Mesurer chaque preset sur les vues de référence
      (coût GPU, vues 1 et 6 pour les petits écarts) et en vol (p1). Dépend de L2.10.
      Implémenté avec L2.10 (2026-11-24) : `maxTotalTiles` et `lodRingRadius` n'étaient plus lus par
      personne (vestiges de l'ancien moteur de terrain), supprimés ; three-tile n'offre pas de
      « distance de vue » (les tuiles grossières couvrent tout jusqu'à l'horizon), seulement
      `LODThreshold` (à chaud) et l'anisotropie (tuiles chargées ensuite, donc rechargement du
      terrain). Réglages utilisateur : Image sharpness → `renderScale` (même effet sur écran Retina ou
      standard ; `maxPixelRatio` reste un réglage brut de l'onglet Developer, appliqué à chaud),
      Prioritise smoothness → `dynamicResolution`, Terrain detail → `terrainLodThreshold` +
      `textureAnisotropy`, Sun glow → bloom, Eye adaptation → exposition automatique. Preset High =
      état d'avant.
      Mesures (lignes « L2.7 » de **Mesures**, `benchmarks/render/preset-*/`, captures à échelle fixe) :
      High reproduit la référence `ae` (vol p1 62,5 contre 62,9). Low −40 à −55 % de coût GPU,
      Medium −20 à −40 %, p1 en vol ≈ 79 pour les deux (LODThreshold 0,9 : −35 % de triangles et de
      draw calls) ; Low visiblement plus flou, crêtes légèrement crénelées. Ultra à LODThreshold 1,6 :
      gain visuel à peine perceptible (pentes lointaines un peu plus nettes), +55 % de draw calls,
      vol saccadé (p5 76, p1 48,5) ; ramené à 1,4 : p5 85,5, p1 53,5. Ces saccades viennent du CPU,
      pas du GPU : la soumission du rendu passe de 2,8 ms (High) à 3,7 ms (Ultra 1,4) en moyenne,
      le p95 du temps de frame de 9,4 à 11,7 ms ; au-delà de 8,3 ms à 120 Hz, mais dans le budget de
      60 Hz. Ultra reste un preset optionnel pour machines puissantes ; à revoir si le coût CPU par
      draw call baisse (regroupement des tuiles, décodage d'altitude en worker de L2.6).
      Révision après retour de l'utilisateur (« tuiles toutes de qualité moyenne ») : en profil
      vierge, High rend les mêmes tuiles que `main` (vue 2 comparée en pleine résolution, `main`
      servi depuis un worktree) ; mais Terrain detail Normal (LODThreshold 0,9) affiche bien moins
      de tuiles fines que ne le disait la note du menu — tuiles affichées dans la vue 2, z15 / z14 :
      High 16 / 17, Medium 6 / 7, Ultra 22 / 15 (`window.osf.tileLevels()`, aussi dans l'onglet
      Developer). Medium garde donc Terrain detail High (seule l'échelle baisse : −5 à −28 % de
      coût GPU, 85 % de High en moyenne ; vol p1 63,3) ; seul Low utilise Normal.
      La résolution dynamique applique désormais tout de suite un plafond relevé (changement de
      Image sharpness dans le menu) au lieu de remonter par pas de 0,05 toutes les 2 s.
- [x] **L2.8** Exposition automatique : histogramme de luminance en compute shader, adaptation temporelle.
      Fait : `AutoExposureNode` — passe compute sur une grille fixe de 256×144 points de l'image TAAU
      (avant bloom), histogramme de 64 classes de log₂ luminance sur [−8, 10], moyenne entre les
      percentiles 40 et 90 (soleil et ombres profondes exclus), adaptation exponentielle (3/s vers le
      clair, 1/s vers le sombre), état sur le GPU, sans relecture. Correction de l'exposition de base
      (0,35) : 60 % de l'écart à une luminance de référence de 1,32 (moyenne géométrique des vues de
      jour), bornée à [−1,5 ; +1] EV. Luminances mesurées : 2,35 / 0,77 / 1,32 / 0,22 / 1,86 / 0,88
      (vues 1 à 6), soit −0,5 / +0,5 / 0 / +1 (borne) / −0,3 / +0,3 EV. Compensation totale (100 %)
      essayée d'abord : vallées de la vue 1 trop sombres, coucher de soleil de la vue 4 sans ambiance.
      Coût ≈ +0,03 ms. Coupée en SAR et sur WebGL2 (pas d'atomiques) ; case du panneau.
- [x] **L2.10** Panneau de configuration : définir son rôle, son intégration à l'application et son
      design, puis le reconstruire (préalable à L2.7). **Conception à valider avec l'utilisateur.**
      État des lieux (2026-11-24) :
      - `index.html` (balisage écrit à la main, contrôle par contrôle) + `js/ui/ControlPanel.js`
        (liaison de chaque contrôle à `CONFIG` via `update()` / `onChange()`) + `css/main.css`
        (`#control-panel`, `.mfd-*`). Thème « MFD » militaire : vert sur fond sombre, lignes de
        balayage, en-tête « MFD-01 / TERRAIN SYS ».
      - Ouverture au survol d'une bande de 20 px au bord droit (`#panel-trigger`), fermeture 300 ms
        après la sortie. Incompatible avec le vol : la souris est capturée (pointer lock) pour
        piloter, il faut la libérer pour atteindre le panneau ; aucune touche ne l'ouvre.
      - Sections : SIMULATION (vitesse, logs, niveau de log), CONFIGURATION (recherche de lieu,
        lat/lon, mode de texture, chargement), ATMOSPHERE (soleil, turbidité, nuages, brouillard) ;
        les réglages de rendu ajoutés par le lot 2 (bloom, exposition automatique) sont rangés
        faute de mieux sous ATMOSPHERE. Réglages de développement (logs) mêlés aux réglages
        utilisateur.
      - Réglages de `CONFIG` absents du panneau : `maxPixelRatio`, `renderScale`,
        `dynamicResolution`, `skyRayleigh`, `cloudOpacity`, `fogDensity`, `mouseSensitivity`,
        `maxTotalTiles`, `lodRingRadius`, `minimapZoom` ; d'autres ne sont accessibles qu'au clavier
        (`cameraMode` V, `showHud` H, `showMinimap` M, `hiResMode` R, texture T).
      - Aucune persistance : tout réglage est perdu au rechargement (seule la baseline de benchmark
        est en `localStorage`) ; pas de paramètres d'URL hors `?view=N`.
      - Une quinzaine de raccourcis (X, H, M, R, T, V, I, L, N, P, G, B, K…), listés dans l'aide
        `#help` (touche I), sans lien avec le panneau. Menu des plans de vol séparé
        (`#flightplan-menu`).
      Questions à trancher :
      - Rôle : réglages rapides en vol, menu d'options complet façon jeu (onglets Graphismes /
        Simulation / Lieu / Commandes…), outil de développement, ou une séparation explicite entre
        réglages utilisateur et outils de mise au point (logs, vues de référence, benchmark,
        mesures GPU) ?
      - Intégration : ouverture par une touche (Échap, F1, Tab ?) qui libère la souris et met ou non
        la simulation en pause ; place des infos en direct (FPS, coût GPU, échelle de rendu,
        exposition) ; persistance (`localStorage`) et paramètres d'URL ; place de l'aide des
        raccourcis et du menu des plans de vol.
      - Architecture : générer le panneau depuis un schéma des réglages (libellé, type, plage, pas,
        groupe, appartenance aux presets, besoin de recharger le terrain) plutôt que du HTML écrit
        à la main, avec `CONFIG_VALIDATION` dans le même schéma.
      - Design : garder l'esthétique MFD (cohérente avec le HUD) ou une interface plus sobre ;
        lisibilité, densité, sélecteur de preset, comportement sur petit écran.
      Décisions de l'utilisateur (2026-11-24) :
      - Menu d'options à onglets : Graphics / World / Flight / Controls / Developer. Les réglages
        doivent être compréhensibles par l'utilisateur, sans exposer les paramètres techniques : chaque
        réglage utilisateur pilote des valeurs techniques, réglables une à une dans l'onglet Developer.
      - Échap ouvre le menu et met le vol en pause ; la scène reste rendue derrière le panneau
        translucide pour voir l'effet des réglages. Reprise par « Resume » ou un clic dans la scène.
      - Style sobre (verre sombre, typographie lisible) avec le vert du HUD comme seul accent.
      - Persistance `localStorage` + paramètres d'URL prioritaires (non mémorisés).
      - Onglet Developer et raccourcis K, X, B caché sauf `?dev=1` (mémorisé jusqu'à `?dev=0`).
      - Interface en anglais.
      Fait : `settingsSchema.js` (libellé, aide, type, plage, onglet, section, persistance,
      rechargement du terrain ; la validation de `config.js` en dérive), `ControlPanel.js` réécrit
      (génération depuis le schéma, aide de la ligne survolée en pied de panneau, mesures en direct
      dans Developer, rechargement du terrain différé à la fermeture), `settingsStore.js`,
      `shortcuts.js` (onglet Controls, remplace l'aide `#help`), indication « Click to fly · Menu Esc »
      tant que la souris est libre. Zone de survol du bord droit et thème MFD du panneau supprimés.
      Vérifié dans Chrome : presets, passage en Custom puis reconnaissance d'un preset, persistance
      après rechargement, Échap, largeur 400 px, captures sans HUD ni indication.
      Refonte visuelle demandée ensuite par l'utilisateur (« plus gaming ») : trois maquettes
      proposées (Hangar, Arcade, Tactical HUD), **Hangar** retenue avec navigation clavier, impact sur
      les performances, sons d'interface et animations. Menu plein écran : colonne de catégories,
      presets en cartes avec leur coût GPU relatif à High (`PRESET_GPU_COST`), sélecteurs ◀ ▶ à
      niveaux, fiche du réglage sélectionné avec jauges coût / gain (`impact` du schéma, tirés des
      mesures), barre de raccourcis. Clavier : ↑ ↓, ← →, Q / E, R (valeur par défaut), Échap ; les
      raccourcis de vol sont bloqués menu ouvert. Sons synthétisés en Web Audio (`uiSounds.js`) sur
      le canal interface d'un mixeur (`js/audio/AudioMixer.js` : volume général et canaux
      interface, moteurs, radio ; onglet Audio ; moteurs et radio prêts pour des sons à venir). Police Rajdhani (OFL) dans `assets/fonts/rajdhani/`. HUD, réticule et
      mini-carte masqués pendant la pause.
- [x] **L2.9** Fiabiliser les mesures : `GPUTimer` avec une mesure par frame (horodatages de passe
      attribués à la frame) exportée par sous-système (terrain, ciel, post-traitement) ; `summary.fps.avg`
      calculé comme frames / durée au lieu de la moyenne des FPS instantanés.
      Fait : three r183 attribuait déjà les requêtes à la frame ; la bimodalité venait du chevauchement
      des passes additionnées et du régulateur de fréquence du GPU (voir Outillage). `GPUTimer` mesure
      la durée couverte par les passes de la frame ; `render:capture` mesure le coût GPU saturé
      (12 rendus par frame) : deux captures successives concordent à ±4 %. Découpage par sous-système
      abandonné au profit de mesures par différence (passes non additives).

## Lot 3 — Atmosphère physique et heure du jour

- [x] **L3.1** Décision : intégrer `@takram/three-atmosphere` (vérifier le support WebGPU/TSL) ou
      implémenter le modèle de Hillaire 2020 en TSL. Consigner dans **Décisions**.
      Fait : `@takram/three-atmosphere` 0.19.1 (entrée `/webgpu`, TSL) et `@takram/three-geospatial`
      0.9.1 copiés et corrigés dans `vendor/takram/` (correctifs listés dans son `README.md`), servis
      par l'import map. Prototype validé sur three r187 : WebGPU et repli WebGL2, profondeur inversée,
      ciel, perspective aérienne et `AtmosphereLight`.
- [~] **L3.2** LUT : transmittance, diffusion multiple, vue du ciel, volume de perspective aérienne.
      Fait : LUT de la bibliothèque (transmittance, diffusion multiple de Hillaire, diffusion 4D de
      Bruneton, irradiance), calculées une fois par compute shader. Reste : **volume de perspective
      aérienne** (froxels, Hillaire 2020) calculé par compute à partir des fonctions de la bibliothèque,
      pour remplacer la perspective aérienne évaluée par pixel (≈ 1 ms à pleine résolution, voir
      **Mesures**) ; repli sur l'évaluation par pixel en WebGL2.
- [~] **L3.3** Perspective aérienne appliquée au terrain, à l'avion et à l'eau ; suppression de `FogExp2`.
      Fait : `aerialPerspective` après la passe de scène, avant TAAU, à la résolution de la passe
      (`ScenePipeline.setAtmosphere`) ; ciel évalué dans la même passe sur les seuls pixels sans
      profondeur, derrière la couche de nuages transparente ; `FogExp2`, `SkyMesh`, `SkyEnvironment`
      et `preethamSky.js` supprimés ; le réglage « Distance haze » (`fogEnabled`) active la
      perspective aérienne. Reste : coût (L3.2), réglage « Air clarity » à rétablir (voir État courant).
- [~] **L3.4** Couleur et intensité du soleil et de l'ambiance dérivées de l'atmosphère.
      Fait : `AtmosphereLight` (soleil direct avec sa transmittance en chaque point), PMREM du ciel
      (`skyEnvironment`) pour la lumière du ciel et les reflets, seuil du bloom calculé sur le GPU depuis
      les LUT, exposition et plage de mesure recalées (×24,3, moyenne géométrique des vues de jour).
      Reste : contraste de l'éclairage (voir État courant).
- [ ] **L3.5** Position astronomique du soleil (date, heure, lat/lon) ; curseur d'heure et accélération
      du temps dans l'onglet World du menu de réglages (entrées du schéma `settingsSchema.js`, réglages
      compréhensibles par l'utilisateur, voir les décisions sous L2.10).
- [ ] **L3.6** Nuit : ciel étoilé, lune, lumières des villes (tuiles NASA Black Marble via le proxy de
      `scripts/serve.js`) en émissif sur le terrain.
- [ ] **L3.7** Vérifier les modes `sar` et `elevation` (ciel désactivé).

## Lot 4 — Nuages volumétriques

- [ ] **L4.1** Textures de bruit 3D générées par compute shader (Perlin-Worley 128³, Worley 32³).
- [ ] **L4.2** Carte météo (couverture, type de nuage) et vent.
- [ ] **L4.3** Ray marching dans la couche, éclairage Beer + powder + Henyey-Greenstein double lobe,
      ambiance issue de l'atmosphère.
- [ ] **L4.4** Rendu à 1/4 de résolution + reprojection temporelle, composition tenant compte de la
      profondeur du terrain.
- [ ] **L4.5** Ombres des nuages sur le terrain.
- [ ] **L4.6** Traversée des nuages (caméra dans la couche).
- [ ] **L4.7** Rayons crépusculaires (`GodraysNode`) et reflet d'objectif (`LensflareNode`).
- [ ] **L4.8** Retirer l'ancien `CloudLayer` plan ; adapter les contrôles du panneau.

## Lot 5 — Terrain, ombres et eau

- [~] **L5.1** Carte d'altitude : réduction bilinéaire au lieu du plus proche voisin
      (`TerrariumShaderLoader.ts:40`), pas de texel cohérent avec la grille (`TerrariumTSL.ts:70`),
      normales par pixel depuis la carte d'altitude 256 px complète.
      Fait : décodage Terrarium sur le CPU en texture float (une altitude par sommet, lue par
      `textureLoad`), réduction bilinéaire aux positions exactes des sommets, normales sur les sommets
      voisins. Reste : normales par pixel depuis la carte 256 px complète, raccord exact des bords entre
      tuiles voisines (l'échantillonnage est borné au pixel de bord, les jupes masquent l'écart).
- [ ] **L5.2** Geomorphing entre niveaux de LOD (suppression du « pop »).
- [ ] **L5.3** Ombres du relief (cartes d'horizon ou ray marching sur la carte d'altitude) +
      `CSMShadowNode` pour l'avion et le terrain proche.
- [ ] **L5.4** Occlusion ambiante (`GTAONode`).
- [ ] **L5.5** Neutralisation de l'éclairage incrusté dans l'imagerie satellite.
- [ ] **L5.6** Détail procédural : occupation du sol (ESA WorldCover), roche triplanaire sur les
      pentes, neige selon altitude/pente, textures de détail selon la distance.
- [ ] **L5.7** Eau : masque (OSM/JRC), matériau Fresnel + reflet du ciel + scintillement solaire,
      vagues FFT en compute, `SSRNode` sur les lacs.

## Lot 6 — Contenu et effets

- [ ] **L6.1** Avion : cartes métal/rugosité/normales, verrière en clearcoat.
- [ ] **L6.2** Particules GPU : post-combustion, traînées de condensation, tourbillons de bout d'aile,
      cône de vapeur, distorsion de chaleur.
- [ ] **L6.3** Effets caméra : flou de mouvement, étalonnage `Lut3DNode`, grain et vignettage légers.
- [ ] **L6.4** Végétation instanciée placée par compute shader selon l'occupation du sol, impostors au loin.
- [ ] **L6.5** Décision puis implémentation du bâti : extrusion OSM ou Google Photorealistic 3D Tiles
      (clé d'API, conditions d'utilisation incompatibles avec la mise en cache du proxy).

---

## Problèmes hors rendu relevés

- Minicarte : les tuiles OpenStreetMap passées par le proxy renvoient 403 « Access blocked » (politique
  d'usage des tuiles OSM : User-Agent/Referer identifiables exigés, usage intensif interdit).

## Mesures

Machine de référence : Apple M4 Max (40 cœurs GPU), écran 120 Hz · Chrome 157, WebGPU (Metal 3),
fenêtre visible, vsync · Canevas 2056×1290 ×2 (4112×2580 px rendus) · Cache de tuiles chaud.

Notes de lecture :
- « FPS moy » = nombre de frames / durée (égal à `summary.fps.avg` depuis L2.9 ; avant, ce champ
  moyennait les FPS instantanés : 127,7 au lieu de 113,8 sur le vol par défaut de la baseline).
- GPU ms des vols = médiane (p95 entre parenthèses) à vsync : charge du GPU, pas coût (voir
  Outillage). Jusqu'à « Lot 1 + altitude décodée sur CPU » : somme des passes (≈ +60 %) ; depuis
  L2.9 : durée couverte par les passes.
- Frames lentes = nombre de frames > 33,3 ms / > 50 ms.

### Benchmarks de vol

| Date | État | Scénario | Durée | FPS moy | p5 | p1 | GPU ms | Frames lentes | Triangles moy | Draw calls méd. |
|---|---|---|---|---|---|---|---|---|---|---|
| 2026-11-23 | Baseline | Vol par défaut | 128 s | 113,8 | 76,3 | 35,2 | 7,0 (10,6) | 124 / 28 | 2,28 M | 557 |
| 2026-11-23 | Baseline | Plan 1 (basse alt.) | 93 s | 113,4 | 67,1 | 39,4 | 7,4 (11,1) | 57 / 4 | 2,73 M | 651 |
| 2026-11-23 | Lot 1, PMREM en `scene.environment` (abandonné) | Vol par défaut | 128 s | 106,5 | 80,6 | 22,3 | 6,3 (10,1) | 352 / 121 | 2,11 M | 539 |
| 2026-11-23 | Lot 1, PMREM en `scene.environment` (abandonné) | Plan 1 (basse alt.) | 94 s | 104,2 | 64,9 | 24,4 | 5,9 (9,3) | 396 / 44 | 2,67 M | 651 |
| 2026-11-23 | Lot 1 | Vol par défaut | 128 s | 113,9 | 78,7 | 34,7 | 6,2 (10,3) | 122 / 28 | 2,12 M | 539 |
| 2026-11-23 | Lot 1 | Plan 1 (basse alt.) | 94 s | 113,6 | 65,8 | 39,7 | 5,3 (8,6) | 49 / 4 | 2,67 M | 651 |
| 2026-11-23 | Lot 1 + altitude décodée sur CPU | Vol par défaut | 128 s | 114,6 | 73,0 | 33,6 | 6,0 (10,3) | 50 / 4 | 2,12 M | 539 |
| 2026-11-23 | Lot 1 + altitude décodée sur CPU | Plan 1 (basse alt.) | 94 s | 114,3 | 62,5 | 43,1 | 5,8 (8,9) | 5 / 0 | 2,67 M | 651 |
| 2026-11-23 | L2.9 (mesure seule) | Vol par défaut | 128 s | 114,6 | 71,9 | 33,0 | 3,8 (6,1) | 46 / 0 | 2,12 M | 539 |
| 2026-11-23 | L2.9 (mesure seule) | Plan 1 (basse alt.) | 94 s | 114,2 | 61,7 | 43,5 | 3,8 (6,1) | 4 / 0 | 2,67 M | 651 |
| 2026-11-23 | Graphe d'élévation partagé | Vol par défaut | 128 s | 119,4 | 106,4 | 61,7 | 4,0 (6,2) | 3 / 1 | 2,13 M | 539 |
| 2026-11-23 | Graphe d'élévation partagé | Plan 1 (basse alt.) | 94 s | 119,3 | 80,6 | 59,5 | 3,9 (6,1) | 2 / 0 | 2,67 M | 651 |
| 2026-11-23 | PMREM sur la scène | Vol par défaut | 128 s | 119,4 | 106,4 | 61,3 | 4,0 (5,9) | 1 / 0 | 2,12 M | 539 |
| 2026-11-23 | PMREM sur la scène | Plan 1 (basse alt.) | 94 s | 119,3 | 83,3 | 59,9 | 3,9 (6,0) | 1 / 0 | 2,67 M | 651 |
| 2026-11-23 | L2.5 (bornes + culling) | Vol par défaut | 128 s | 119,5 | 106,4 | 62,5 | 3,9 (6,0) | 0 / 0 | 2,12 M | 539 |
| 2026-11-23 | L2.5 (bornes + culling) | Plan 1 (basse alt.) | 94 s | 119,5 | 81,3 | 61,0 | 4,0 (6,0) | 1 / 0 | 2,67 M | 651 |
| 2026-11-24 | L2.1 (RenderPipeline, r183) | Vol par défaut | 128 s | 119,6 | 106,4 | 63,7 | 4,0 (6,0) | 0 / 0 | 2,12 M | 539 |
| 2026-11-24 | L2.1 (RenderPipeline, r183) | Plan 1 (basse alt.) | 94 s | 119,4 | 82,6 | 60,6 | 3,9 (6,0) | 1 / 0 | 2,67 M | 651 |
| 2026-11-24 | three r187 | Vol par défaut | 128 s | 119,5 | 105,3 | 64,5 | 4,2 (6,2) | 0 / 0 | 2,12 M | 539 |
| 2026-11-24 | three r187 | Plan 1 (basse alt.) | 94 s | 119,6 | 83,3 | 62,5 | 4,4 (6,3) | 0 / 0 | 2,67 M | 651 |
| 2026-11-24 | L2.2 (TRAA) | Vol par défaut | 128 s | 119,5 | 106,4 | 64,9 | 4,1 (6,3) | 2 / 0 | 2,12 M | 540 |
| 2026-11-24 | L2.2 (TRAA) | Plan 1 (basse alt.) | 94 s | 119,4 | 83,3 | 62,1 | 4,7 (6,3) | 0 / 0 | 2,67 M | 652 |
| 2026-11-24 | L2.3 (bloom) | Vol par défaut | 128 s | 119,3 | 106,4 | 61,3 | 4,0 (6,3) | 1 / 0 | 2,12 M | 552 |
| 2026-11-24 | L2.3 (bloom) | Plan 1 (basse alt.) | 94 s | 119,3 | 81,3 | 61,3 | 5,0 (6,3) | 1 / 0 | 2,67 M | 664 |
| 2026-11-24 | L2.4 (TAAU, résolution dynamique ; échelle 1 tout le vol) | Vol par défaut | 128 s | 119,3 | 106,4 | 62,9 | 4,1 (6,3) | 0 / 0 | 2,12 M | 552 |
| 2026-11-24 | L2.4 (TAAU, résolution dynamique ; échelle 1 tout le vol) | Plan 1 (basse alt.) | 94 s | 119,4 | 84,7 | 59,9 | 5,1 (6,3) | 0 / 0 | 2,67 M | 664 |
| 2026-11-24 | L2.8 (exposition automatique) | Vol par défaut | 128 s | 119,3 | 105,3 | 62,9 | 4,1 (6,3) | 1 / 0 | 2,12 M | 552 |
| 2026-11-24 | L2.8 (exposition automatique) | Plan 1 (basse alt.) | 94 s | 119,2 | 82,0 | 61,0 | 5,3 (6,5) | 1 / 0 | 2,67 M | 664 |
| 2026-11-24 | L2.7 preset Low (échelle 0,6) | Vol par défaut | 128 s | 119,8 | 107,5 | 79,4 | 4,5 (5,8) | 1 / 0 | 1,28 M | 384 |
| 2026-11-24 | L2.7 preset Medium (échelle 0,8) | Vol par défaut | 128 s | 119,9 | 108,7 | 78,7 | 4,5 (6,0) | 1 / 0 | 1,28 M | 394 |
| 2026-11-24 | L2.7 preset High (défaut) | Vol par défaut | 128 s | 119,3 | 106,4 | 62,5 | 3,9 (6,3) | 0 / 0 | 2,12 M | 552 |
| 2026-11-24 | L2.7 preset Ultra, LODThreshold 1,6 (écarté) | Vol par défaut | 128 s | 112,5 | 76,3 | 48,5 | 5,5 (6,7) | 4 / 0 | 3,50 M | 846 |
| 2026-11-24 | L2.7 preset Medium révisé (échelle 0,8, Terrain detail High) | Vol par défaut | 128 s | 119,3 | 105,3 | 63,3 | 4,0 (6,4) | 3 / 0 | 2,12 M | 552 |
| 2026-11-24 | **Clôture du lot 2** (preset High) | Vol par défaut | 128 s | 119,3 | 106,4 | 61,3 | 4,0 (6,3) | 4 / 0 | 2,12 M | 552 |
| 2026-11-24 | **Clôture du lot 2** (preset High) | Plan 1 (basse alt.) | 94 s | 119,4 | 81,3 | 61,7 | 5,1 (6,2) | 0 / 0 | 2,67 M | 664 |
| 2026-11-24 | L2.7 preset Ultra, LODThreshold 1,4 | Vol par défaut | 128 s | 115,6 | 85,5 | 53,5 | 5,0 (6,5) | 1 / 0 | 2,84 M | 714 |

Pour mémoire, la configuration n°4 de `BENCHMARKS.md` (même machine, Chrome 146, ancien moteur
geo-three) donnait avg 83,8 / p5 47,8 / p1 17,0 (avg biaisé, comparable à 127,7 / 76,3 / 35,2).

### Vues de référence

| Date | État | Vue 1 | Vue 2 | Vue 3 | Vue 4 | Vue 5 | Vue 6 |
|---|---|---|---|---|---|---|---|
| 2026-11-23 | Baseline — GPU ms méd. | 7,7 | 6,8 | 6,4 | 6,6 | 10,3 |
| 2026-11-23 | Baseline — FPS moy / p1 | 120 / 109 | 120 / 108 | 120 / 111 | 120 / 106 | 120 / 109 |
| 2026-11-23 | Lot 1 — GPU ms méd. | 9,8 | 9,7 | 9,7 | 9,6 | 10,3 |
| 2026-11-23 | Lot 1 — FPS moy / p1 | 120 / 108 | 120 / 106 | 120 / 108 | 120 / 108 | 120 / 108 |
| 2026-11-23 | Lot 1 + altitude CPU — FPS moy / p1 | 120 / 108 | 120 / 108 | 120 / 106 | 120 / 109 | 120 / 106 |
| 2026-11-23 | L2.9 — coût GPU ms (12 rendus/frame), capture 1 | 1,28 | 1,45 | 1,49 | 1,37 | 1,43 |
| 2026-11-23 | L2.9 — coût GPU ms (12 rendus/frame), capture 2 | 1,28 | 1,46 | 1,47 | 1,32 | 1,42 |
| 2026-11-23 | L2.9 — FPS moy / p1 | 120 / 106 | 120 / 108 | 120 / 108 | 120 / 108 | 120 / 108 |
| 2026-11-23 | PMREM sur la scène — coût GPU ms (12 rendus/frame) | 1,26 | 1,43 | 1,47 | 1,39 | 1,43 |
| 2026-11-23 | PMREM sur la scène — FPS moy / p1 | 120 / 110 | 120 / 106 | 120 / 109 | 120 / 108 | 120 / 110 |
| 2026-11-23 | L2.5 — coût GPU ms (12 rendus/frame) | 1,27 | 1,47 | 1,48 | 1,38 | 1,44 |
| 2026-11-23 | L2.5 — draw calls / triangles | 525 / 1,93 M | 633 / 2,60 M | 639 / 2,61 M | 579 / 2,03 M | 605 / 2,19 M |
| 2026-11-23 | Essai LOD mesuré au point le plus haut (écarté) — coût GPU ms | 1,47 | 1,46 | 1,53 | 1,54 | 1,65 |
| 2026-11-23 | Essai LOD mesuré au point le plus haut (écarté) — draw calls / triangles | 561 / 2,28 M | 633 / 2,60 M | 639 / 2,61 M | 639 / 2,57 M | 665 / 2,74 M |
| 2026-11-24 | L2.1 (RenderPipeline, r183) — coût GPU ms | 1,32 | 1,42 | 1,44 | 1,33 | 1,39 |
| 2026-11-24 | three r187 — coût GPU ms | 1,04 | 1,20 | 1,22 | 1,09 | 1,22 |
| 2026-11-24 | L2.2 (TRAA) — coût GPU ms | 1,32 | 1,68 | 1,69 | 1,50 | 1,65 | |
| 2026-11-24 | L2.2, mesure corrigée (frame entière répétée) — coût GPU ms | 1,19 | 1,59 | 1,62 | 1,42 | 1,52 | 1,46 |
| 2026-11-24 | L2.3 (bloom) — coût GPU ms | 1,52 | 1,90 | 1,92 | 1,73 | 1,82 | 1,72 |
| 2026-11-24 | L2.3 (bloom) — draw calls / triangles | 538 / 1,93 M | 646 / 2,60 M | 652 / 2,61 M | 592 / 2,03 M | 618 / 2,19 M | 592 / 2,05 M |
| 2026-11-24 | **Pleine résolution** — TRAA sans bloom (état L2.2) | 2,65 | 3,74 | 2,87 | 2,64 | 2,40 | 2,50 |
| 2026-11-24 | **Pleine résolution** — TRAA + bloom (état L2.3) | 2,86 | 4,23 | 3,54 | 3,21 | 3,27 | 3,41 |
| 2026-11-24 | **Pleine résolution** — TAAU sans bloom, échelle 1 | 2,93 | 4,37 | 2,97 | 3,21 | 2,93 | 3,11 |
| 2026-11-24 | **Pleine résolution** — L2.4 : TAAU + bloom, échelle 1, capture 1 | 3,08 | 5,07 | 3,64 | 3,33 | 3,13 | 3,27 |
| 2026-11-24 | **Pleine résolution** — L2.4 : TAAU + bloom, échelle 1, capture 2 (référence) | 3,08 | 4,46 | 3,63 | 3,33 | 3,51 | 3,26 |
| 2026-11-24 | **Pleine résolution** — TAAU + bloom, échelle 0,75 | 2,82 | 3,88 | 2,95 | 2,71 | 2,65 | 2,99 |
| 2026-11-24 | **Pleine résolution** — TAAU + bloom, échelle 0,5 | 2,13 | 2,77 | 2,57 | 2,25 | 2,43 | 2,28 |
| 2026-11-24 | **Pleine résolution** — L2.8 sans exposition automatique | 3,09 | 4,66 | 4,11 | 3,76 | 3,53 | 3,26 |
| 2026-11-24 | **Pleine résolution** — L2.8, capture 1 | 3,12 | 5,10 | 4,14 | 4,03 | 3,28 | 3,90 |
| 2026-11-24 | **Pleine résolution** — L2.8, capture 2 | 3,12 | 4,49 | 3,66 | 3,37 | 3,16 | 3,30 |
| 2026-11-24 | **Pleine résolution** — L2.7 preset Low (échelle 0,6, sans bloom) | 1,75 | 2,21 | 2,26 | 2,06 | 1,76 | 1,84 |
| 2026-11-24 | **Pleine résolution** — L2.7 preset Medium (échelle 0,8) | 2,35 | 3,02 | 3,07 | 2,63 | 2,48 | 2,59 |
| 2026-11-24 | **Pleine résolution** — L2.7 preset Medium révisé (échelle 0,8, Terrain detail High) | 2,66 | 3,65 | 3,10 | 3,19 | 2,76 | 3,14 |
| 2026-11-24 | **Pleine résolution** — L2.7 preset High | 3,10 | 5,08 | 3,65 | 3,36 | 3,15 | 3,36 |
| 2026-11-24 | **Pleine résolution** — L2.7 preset Ultra, LODThreshold 1,6 (écarté) | 3,64 | 5,92 | 4,97 | 4,75 | 4,03 | 4,20 |
| 2026-11-24 | **Pleine résolution** — L2.7 preset Ultra, LODThreshold 1,4 | 3,88 | 4,83 | 4,31 | 4,09 | 3,49 | 3,73 |
| 2026-11-24 | **Pleine résolution** — **Clôture du lot 2** (preset High) | 3,11 | 5,09 | 4,01 | 3,80 | 3,34 | 3,72 |
| 2026-11-24 | L2.7 Low et Medium (LODThreshold 0,9) — draw calls / triangles | 382 / 1,26 M | 412 / 1,53 M | 454 / 1,69 M | 388 / 1,30 M | 384 / 1,21 M | 382 / 1,26 M |
| 2026-11-24 | L2.7 Ultra 1,4 — draw calls / triangles | 712 / 2,66 M | 790 / 3,36 M | 820 / 3,45 M | 730 / 2,77 M | 768 / 2,78 M | 724 / 2,69 M |

Les lignes « GPU ms méd. » antérieures à L2.9 ne sont pas exploitables (somme des passes, fréquence
du GPU fixée par le régulateur). Les lignes « coût GPU » de L2.9 à L2.3 ont été mesurées à 1028×645
(résolution abaissée par l'ancienne qualité adaptative, voir Outillage) : comparables entre elles
pour la géométrie seulement. Le coût GPU réel d'une frame est ≈ 3–5 ms à 4112×2580 sur M4 Max (lignes
« Pleine résolution »), loin du budget de 16,6 ms.

Bilan du lot 2 (état de clôture contre lot 1 + altitude CPU) : vol par défaut p5 73,0 → 106,4 et
p1 33,6 → 61,3 (frames > 33 ms 50 → 4), plan 1 p5 62,5 → 81,3 et p1 43,1 → 61,7 ; coût GPU d'une frame
3,1 à 5,1 ms à 4112×2580, loin du budget de 16,6 ms. Critère de sortie respecté (p1 en hausse).

Constats visuels après le lot 2 (`docs/screenshots/render/lot2/`, preset High, 6 vues) :
- Image HDR stable : TAAU sans crénelage ni scintillement, bords et détails lointains comme avec MSAA.
- Soleil avec halo (bloom) sur la vue 6, sans voile sur la neige ni sur l'auréole du ciel ; avion
  éclairé par la carte d'environnement du ciel.
- Exposition automatique : vue de coucher de soleil (4) éclaircie d'≈ 1 EV, ciel plus clair et faces à
  l'ombre moins bouchées qu'au lot 1, au prix d'une ambiance de crépuscule un peu moins marquée.
- Détail des tuiles identique au lot 1 en High (vérifié contre `main` en pleine résolution).
- Restent : premier plan flou en vue rasante (imagerie z15), lac plat sans reflet (L5.7), nappe
  nuageuse plane (lot 4), aucune ombre portée du relief ni de l'avion (lot 5), image un peu terne
  (étalonnage L6.3).

Constats visuels après le lot 1 (`docs/screenshots/render/lot1/`, état avec l'altitude décodée sur CPU) :
- Ciel de Preetham visible, dégradé zénith/horizon, lueur solaire au couchant ; terrain et ciel se
  fondent à l'horizon (brouillard à la couleur du ciel).
- Relief à sa vraie pente : massif du Mont-Blanc et vallée de Chamonix nettement plus raides.
- Faces au soleil chaudes et faces à l'ombre bleutées au coucher du soleil (vue 4).
- Restent : premier plan flou en vue rasante (résolution
  de l'imagerie), lac plat (L5.7), nappe nuageuse plane à peine visible avec un bord net à l'horizon
  (plan de 80 km, lot 4), image un peu terne (AgX, à compenser par l'étalonnage L6.3).

Constats visuels de la baseline (`docs/screenshots/render/baseline/`) :
- Ciel uni sur toutes les vues (couleur du brouillard, voir L1.6), saumon uniforme au coucher du soleil.
- Faces à contre-jour quasi noires (vue 4) : ambiante plate trop faible, aucune lumière du ciel.
- Premier plan très flou en vue rasante (vue 2) : filtrage anisotrope absent, imagerie z15.
- Lac d'Annecy : photo plate, aucun reflet (vue 3).
- Nuages : nappe plane texturée, sans volume ni éclairage (vue 5) ; c'est la vue la plus coûteuse
  en GPU (+50 %) à cause de la transparence plein écran.

## Décisions

| Date | Sujet | Décision | Raison |
|---|---|---|---|
| 2026-11-23 | Mesures | Chrome en fenêtre visible avec vsync, piloté par Playwright (`playwright-core` + Chrome installé) | Le headless/sans vsync ne présente pas toutes les frames (482 FPS affichés pour 3,8 ms GPU) et a planté |
| 2026-11-23 | Scénarios | Vol par défaut + plan de vol 1 | Le premier est comparable à l'historique, le second stresse le streaming à basse altitude |
| 2026-11-23 | Bundle three-tile | Non versionné ; construction documentée comme obligatoire (README, Quick Start) | Un clone neuf ne démarre pas sans lui |
| 2026-11-23 | Tone mapping | AgX, exposition fixe 0,35 | ACES, comparé sur les 5 vues, contraste davantage mais surexpose la vue 1 et décale les teintes (neige à l'ombre bleu vif) ; le peps viendra de l'étalonnage (L6.3) et de l'exposition automatique (L2.8) |
| 2026-11-23 | Échelle d'éclairage | Soleil, ciel, ambiance et brouillard dérivés du modèle de `SkyMesh` (port CPU) | Une seule échelle de radiance ; auparavant le terrain était 50 fois moins lumineux que le ciel. Provisoire jusqu'au lot 3 |
| 2026-11-23 | Lumière du ciel sur le terrain | `HemisphereLight` (ciel / rebond du sol) au lieu de la PMREM | La PMREM en `scene.environment` alourdit le graphe de nœuds reconstruit pour chaque tuile : frames > 33 ms 57 → 396 sur le plan 1. Remplacée après L2.6 (ligne suivante) |
| 2026-11-23 | Lumière du ciel sur la scène | PMREM du ciel en `scene.environment`, `HemisphereLight` retirée | Graphe d'élévation partagé entre tuiles : plus de compilation par tuile, la PMREM ne coûte plus de saccades (1 frame > 33 ms sur chaque vol) ni de temps GPU mesurable |
| 2026-11-23 | Unités du monde | Carte réduite horizontalement de cos(lat) : 1 unité = 1 m (option préférée par l'utilisateur à la multiplication de l'altitude) | Altitudes, HUD, vues de référence, nuages et y des plans inchangés ; vitesse en vrais m/s ; seuls x/z des plans de vol changent (champ `units`) |
| 2026-11-23 | Mesure du temps GPU | Durée couverte par les passes de la frame ; coût mesuré GPU saturé (12 rendus par frame) dans `render:capture` | À vsync le régulateur de fréquence du GPU fixe la durée mesurée (≈ 75 % de l'intervalle) ; les passes se chevauchent. Mesure saturée reproductible à ±4 % |
| 2026-11-23 | Point de mesure du LOD des tuiles | Centre de la tuile au niveau de la mer (comportement inchangé) | Avec des bornes justes, three-tile mesurerait la distance au point le plus haut : +7 à +10 % de draw calls et +0,1–0,2 ms GPU sur les vues de montagne, sans différence visible (tuiles concernées à mi-distance, sous le brouillard), et `LODThreshold` 1,2 a été réglé pour le niveau de la mer |
| 2026-11-24 | Version de three.js | r187 (au lieu de r183) | TRAA compatible profondeur inversée depuis r184 ; internes lus par `GPUTimer` inchangés ; images, modes et cadence identiques, coût GPU −18 %. Plutôt que r184 : dernière version, publiée il y a plus de trois semaines |
| 2026-11-24 | Anti-crénelage | TRAA, MSAA désactivé | Exigé par TRAA ; qualité équivalente au MSAA sur captures fixes et en vol, stabilité temporelle en plus, +0,3–0,5 ms |
| 2026-11-24 | Bloom | Après TRAA, seuil = radiance la plus forte hors soleil (surface diffuse blanche au soleil ou ciel au bord du disque) | Ordre des moteurs AAA : les reflets sous-pixel, stabilisés par TRAA, ne scintillent pas dans le halo (pas de comparaison en vol : aucun reflet ne dépasse le seuil sur les vols de référence). Seuil dérivé de l'éclairage plutôt que fixe : pas de bloom sur la neige ni sur l'auréole, quelle que soit la hauteur du soleil |
| 2026-11-24 | Mesure du coût GPU | Répétitions = frames de nœuds successives | Mise à jour « par rendu » impossible pour TRAA et bloom : three compte chaque rendu de quad comme un rendu, d'où des rendus imbriqués de la scène |
| 2026-11-24 | Anti-crénelage | TAAU (`TAAUNode`) au lieu de TRAA, à toutes les échelles | Seul nœud de three r187 qui reconstruit la résolution de sortie depuis une passe de scène réduite ; changer de nœud selon l'échelle recompilerait la chaîne au moment d'une surcharge. Image identique à l'échelle 1, +0,1 à +0,8 ms |
| 2026-11-24 | Signal de la résolution dynamique | Temps GPU par rendu (médiane sur 30 frames), budget 60 FPS, hausse par paliers après 2 s | L'intervalle entre frames vaut l'intervalle de rafraîchissement à vsync (un écran 60 Hz semble toujours au budget) et grimpe pendant la mesure saturée ; le régulateur de fréquence masque la marge, d'où une hausse par essais, défaite en une fenêtre si elle surcharge |
| 2026-11-24 | Exposition automatique | Compensation partielle (60 %) autour de l'exposition de base, bornée à [−1,5 ; +1] EV, calée sur les vues de jour | La compensation totale uniformise les scènes (neige grise, crépuscule comme en plein jour) ; l'exposition de base, réglée sur les vues de référence, reste l'aspect de jour. Correction appliquée sur le GPU (pas de latence de relecture) |
| 2026-11-24 | three-tile | Garder la copie 0.11.8 modifiée (`vendor/three-tile`), sans reprendre la branche `dev` de `sxguojf/three-tile` | Aucune version publiée depuis la 0.11.8 (`master` : README seulement) ; `dev` (future 0.11.10, inachevée, inactive depuis mars 2026) apporte des formats inutilisés ici (ArcGIS, TIFF, DEM, VirtualEarth) et refond `Tile`, `TileLoader` et `TileMap`, là où portent nos modifications, avec des choix contraires à nos mesures (LOD au point le plus haut, allocations par tuile et par frame) ; toujours WebGL seulement. À revoir si une version publiée apporte le WebGPU |
| 2026-11-24 | Atmosphère | `@takram/three-atmosphere` 0.19.1 (WebGPU/TSL), copie corrigée dans `vendor/takram/`, plutôt qu'un modèle de Hillaire écrit en TSL ou un chargement depuis le CDN | Modèle de Bruneton (LUT 4D) avec la LUT de diffusion multiple de Hillaire, perspective aérienne par ray marching, `AtmosphereLight` compatible avec les matériaux standard, environnement PMREM, étoiles, lune et light shafts sur CSM (utiles à L4.7 et L5.3), repli WebGL2, licence MIT ; un modèle maison demanderait plusieurs sessions pour moins. La version publiée ne se charge pas avec three ≥ r185 (`struct()`, issue #111, PR #118 non fusionnée, dépôt inactif depuis mai 2026) et suppose `three` = build WebGL : correctifs locaux, à reprendre à chaque mise à jour |
| 2026-11-23 | Vitesse par défaut | 560 m/s | Vitesse réelle de l'ancien défaut (800 unités Mercator/s) : benchmarks comparables à la baseline |

## Journal des sessions

<!-- Entrée la plus récente en haut. -->

### 2026-11-24 (15)
- Fait : branche `feat/render-atmosphere`. L3.1 : prototype de `@takram/three-atmosphere` 0.19.1
  sur three r187 (WebGPU, WebGL2, profondeur inversée) ; choix validé par l'utilisateur (copie corrigée
  plutôt que Hillaire maison ou CDN), consigné dans **Décisions**. Copie dans `vendor/takram/`
  (correctif `struct()` r185+, imports adaptés à l'import map, étoiles et bruit bleu servis en local).
  Intégration : ciel, perspective aérienne, `AtmosphereLight`, PMREM du ciel, seuil du bloom sur le GPU,
  exposition recalée ; réglages Preetham supprimés ; modes `sar` et `elevation` vérifiés (rendu correct,
  `elevation` un peu surexposé, à revoir avec L3.7).
- Mesures (vue 1 seule, coût GPU saturé, bruit ± 0,4 ms) : `main` 3,1–3,5 ms ; atmosphère 4,8–5,5 ms,
  dont lumière + environnement ≈ 0,5, perspective aérienne ≈ 0,8–1,3 (la lumière diffusée surtout ;
  sans ray marching ≈ −0,3), ciel ≈ 0,1–0,3. Séquence des 6 vues : 5,5 / 6,8 / 5,9 / 5,7 / 6,0 / 5,9 ms
  contre 3,1 / 5,1 / 4,0 / 3,8 / 3,3 / 3,7 au lot 2. LUT en HalfFloat ou sans texture d'ordre supérieur :
  pas de gain mesurable.
- Constats visuels : profondeur nettement meilleure au loin (vues 1, 5, 6), contre-jour crédible ; mais
  terrain proche voilé et moins contrasté, ciel gris-bleu délavé (AgX), coucher de soleil (vue 4) moins
  orangé qu'avant. La perspective aérienne n'est pas en cause (sans elle, le versant proche garde le voile) :
  c'est l'éclairage (part de la lumière du ciel).
- Reste : voir État courant (« Prochaine session »). Pas encore de benchmark de vol ni de captures
  versionnées pour le lot 3.

### 2026-11-24 (14)
- Fait : clôture du lot 2 — captures des 6 vues (`docs/screenshots/render/lot2/`), mesures finales
  (`benchmarks/render/lot2/`, non versionné), bilan et constats visuels, lint sans erreur.
- Fait ensuite, avec l'accord de l'utilisateur : `feat/render-hdr-pipeline` fusionnée dans `main`
  (avance rapide) et poussée ; branche de lot supprimée (locale et distante).
- Hors rendu : les 7 alertes Dependabot (js-yaml, brace-expansion, @humanfs/node, toutes tirées par
  ESLint) corrigées par `npm audit fix` ; `vendor/three-tile` signale 18 vulnérabilités d'outils de
  construction (Vite 5, esbuild…), absentes du bundle, laissées en l'état. Branche `dev` de three-tile
  examinée : rien à reprendre (voir **Décisions**).
- Prochaine étape : lot 3, en commençant par L3.1 (voir État courant).

### 2026-11-24 (13)
- Fait : L2.10 (conception validée avec l'utilisateur, voir les décisions sous L2.10) et la partie
  code de L2.7 (presets, réglages utilisateur et leur correspondance technique).
- Constat : `maxTotalTiles` et `lodRingRadius` étaient morts ; « distance de vue » remplacée par
  Terrain detail (`LODThreshold` + anisotropie).
- Fait ensuite : mesures des presets (L2.7 terminée) ; Ultra ramené à LODThreshold 1,4 ; plafond de
  la résolution dynamique relevé appliqué immédiatement ; `render:capture` passe `--set` dans l'URL.
- Fait ensuite : refonte visuelle du menu de réglages en style « Hangar » (maquettes A / B / C
  proposées, A retenue), navigation clavier, jauges d'impact, sons, animations.
- Retour de l'utilisateur : tuiles moins détaillées qu'avant. Vérifié contre `main` : identiques en
  High ; c'était Terrain detail Normal, trop agressif pour Medium, qui garde désormais High.
  Volumes ajoutés (mixeur audio, onglet Audio).
- Prochaine étape : clôture du lot 2.

### 2026-11-24 (12)
- Fait : L2.8. Commit : exposition automatique par histogramme GPU (`AutoExposureNode`), case du
  panneau, luminance adaptée dans les captures (`window.osf.adaptedLuminance()`), README.
- Vérifié : luminances mesurées identiques d'une capture à l'autre ; adaptation vue 1 → vue 4 à 90 %
  en ≈ 2,3 s, retour en ≈ 1 s ; coût ≈ +0,03 ms ; vols p1 62,9 / 61,0 ; SAR sans correction,
  `elevation` avec.
- Problème ouvert : dispersion du coût GPU des vues 2 à 5 (±0,5 ms entre captures identiques).
- Prochaine étape : L2.10 puis L2.7 (voir État courant), puis clôture du lot 2. À la demande de
  l'utilisateur, la conception du panneau de configuration devient une tâche à part entière (L2.10),
  à définir avec lui avant tout code ; état des lieux et questions consignés sous L2.10.

### 2026-11-24 (11)
- Fait : L2.4. Trois commits : TAAU à la place de TRAA, résolution dynamique pilotée par le temps GPU
  (échelle de la passe de scène, `renderScale`, `dynamicResolution`, échelle dans les rapports),
  README.
- Découvert : l'ancienne qualité adaptative abaissait le canevas à 1028×645 pendant chaque mesure
  saturée : tous les coûts GPU consignés de L2.9 à L2.3 sont à cette résolution. Re-mesuré à pleine
  résolution : ≈ 3–5 ms par vue, bloom +0,2 à +0,9 ms. Le `TRAANode` r187 ne sait pas reconstruire
  une résolution supérieure ; `TAAUNode` (r187) le fait.
- Vérifié : TAAU échelle 1 indiscernable de TRAA ; 0,75 indiscernable, 0,5 acceptable en secours ;
  surcharge simulée absorbée en 2 s et résorbée sans oscillation ; vols à l'échelle 1 de bout en
  bout, p1 62,9 / 59,9 ; modes `sar` et `elevation`, aucune erreur de page.
- Prochaine étape : L2.8 (voir État courant).

### 2026-11-24 (10)
- Fait : L2.3. Trois commits : mesure GPU répétant la frame entière, vue de référence 6 (face au soleil
  bas) et options `--views` / `--set` de `render:capture`, bloom à seuil dérivé de l'éclairage.
- Découvert : l'ancienne mesure saturée re-rendait la scène dans la résolution TRAA et ne comptait
  TRAA qu'une fois par frame (coûts L2.2 surestimés de 5–9 %) ; l'auréole de Preetham dépasse toute
  surface diffuse à soleil bas ; le disque solaire de `SkyMesh` vaut ≈ 6·10⁴ (proche du maximum
  HalfFloat, 65 504).
- Vérifié : vue 1 sans bloom sur la neige, vue 6 avec halo, modes `sar` (sans bloom) et `elevation` ;
  vols p1 61,3 / 61,3 (contre 64,9 / 62,1, dans la dispersion 61–65 des sessions précédentes).
- Prochaine étape : L2.4 (voir État courant).

### 2026-11-24 (9)
- Fait : L2.1 et L2.2. Commits : `RenderPipeline` avec passe de scène HDR, three r183 → r187, TRAA à la
  place du MSAA.
- Découvert : la passe de scène d'un `RenderPipeline` ne se rend qu'une fois par frame (la mesure GPU
  répétée ne mesurait plus que la passe finale : 0,37 ms, `gpuBusy` 0,54) ; le `TRAANode` de r183
  ignore la profondeur inversée. Avec r187, la vue 2 descend à `gpuBusy` 0,88 à 12 rendus/frame
  (GPU plus rapide) ; TRAA la remonte à 0,95.
- Vérifié : vues identiques à la référence avant TRAA ; TRAA comparé au MSAA en vol sans traînées ;
  modes `sar` et `elevation` ; vols p1 64,9 / 62,1.
- Prochaine étape : L2.3 (voir État courant).

### 2026-11-23 (8)
- Fait : L2.5. Trois commits : bornes des tuiles élargies de leur plage d'altitude et culling rétabli,
  typage du nœud de texture partagé (la vérification de types de three-tile retombe à ses 5 erreurs
  antérieures, dues à des `@types/three` anciens), draw calls et triangles par vue dans
  `render:capture` (`window.osf.renderInfo`).
- Découvert : le culling n'élimine rien sur les vues de référence (0 tuile visible hors frustum,
  vérifié tuile par tuile). Le point de mesure du LOD de three-tile prenait son altitude dans les
  bornes plates, donc au niveau de la mer ; des bornes justes l'auraient déplacé au sommet de la
  tuile, d'où un raffinement plus fort en montagne sans gain visible : écarté (voir Décisions).
- Vérifié : vues identiques à la référence, aucune tuile manquante en bord d'écran (vue 2) ; vols
  p1 62,5 / 61,0, au plus 1 frame > 33 ms.
- Prochaine étape : L2.1 (voir État courant).

### 2026-11-23 (7)
- Fait : L2.6 en grande partie et fin de L1.4. Deux commits : graphe d'élévation partagé entre tuiles
  (three-tile, bundle reconstruit), PMREM du ciel en `scene.environment` (`HemisphereLight` et
  conversion des matériaux de l'avion retirées).
- Découvert : la clé de cache d'un graphe de nœuds three contient l'`id` de chaque nœud ; un graphe
  construit par tuile se compile donc par tuile. Les clones de `TextureNode` (`load`, `size`) lisent la
  texture du nœud de base mais n'héritent pas de son callback de mise à jour : le nœud de base doit
  être dans le graphe (ici via `size()`).
- Vérifié : relief identique à la référence (vue 2), modes `sar`, `elevation` et retour en satellite ;
  vols : p1 61,3 / 59,9 (contre 33,0 / 43,5), frames > 33 ms 46 → 1 et 4 → 1 ; coût GPU inchangé.
- Prochaine étape : L2.5 (voir État courant).

### 2026-11-23 (6)
- Fait : branche `feat/render-hdr-pipeline` ; L2.9. Deux commits : temps GPU par frame et coût GPU
  saturé dans `render:capture`, `summary.fps.avg` = frames / durée.
- Découvert : three r183 attribue déjà les horodatages à la frame (l'hypothèse « une valeur couvre
  une ou deux frames » était fausse). Les deux passes d'une frame (scène, puis conversion de sortie)
  se chevauchent : 9,9 ms additionnées pour 6,0 ms couvertes. Et à vsync la durée couverte reste
  ≈ 6–6,4 ms que l'on rende la scène 1, 2 ou 4 fois par frame : le régulateur de fréquence du GPU
  vise ≈ 75 % d'occupation. Le coût réel n'apparaît que GPU saturé : ≈ 1,3–1,5 ms par vue.
- Vérifié : deux captures successives à ±4 % ; vols inchangés (p1 33,0 / 43,5 contre 33,6 / 43,1).
- Prochaine étape : L2.6 (voir État courant).

### 2026-11-23 (5)
- Fait : `feat/render-quick-wins` fusionnée dans `main` et poussée ; branches de lot supprimées. README mis
  à jour (altitude décodée sur CPU, monde en mètres, éclairage, feuille de route, scripts de rendu).
  Ajout de `npm run render:summary` (indicateurs du tableau Mesures, auparavant calculés à la main).
- Prochaine étape : créer `feat/render-hdr-pipeline`, puis L2.9 (voir État courant).

### 2026-11-23 (4)
- Signalé par l'utilisateur : stries sur certaines tuiles (vues 2 et 4 du lot 1). Deux motifs : terrasses
  à bords en dents de scie le long des courbes de niveau, traînées claires en travers des pentes.
- Cause : le shader décodait l'encodage Terrarium RGBA8 en échantillonnant la texture. Le canal R vaut
  256 m par unité ; filtré en demi-précision par le GPU, il dérive jusqu'à ±16 m, d'une valeur constante
  par tranche de 256 m d'altitude, d'où une marche à chaque changement de R. Les données source sont
  lisses (vérifié : 1 à 3 m entre pixels voisins).
- Corrigé (three-tile) : décodage sur le CPU en float, réduction bilinéaire, normales sur la grille
  (L5.1 en partie). Coût ≈ 1,1 ms CPU par tuile (médiane, max 4 ms).
- Mesuré sur l'écran 120 Hz : frames > 33 ms 122 → 50 (vol par défaut) et 49 → 5 (plan 1) ; p1 33,6
  (−4,5 % vs baseline) et 43,1 (+9 %) ; p5 en légère baisse (73,0 et 62,5), compatible avec le décodage
  ajouté sur le thread principal. Captures du lot 1 remplacées par cet état.
- Prochaine étape : inchangée (fusion de `feat/render-quick-wins`, puis lot 2 en commençant par L2.9).

### 2026-11-23 (3)
- Fait : lot 1 complet (L1.4 partiel : PMREM sur l'avion seulement). `feat/render-baseline` fusionnée dans
  `main` ; branche `feat/render-quick-wins`. Benchmarks de clôture dans les tolérances (p1 34,7 / 39,7
  contre 35,2 / 39,4), temps GPU de vol en baisse.
- Découvert : `SkyMesh` r183 dessine des nuages procéduraux et un disque solaire (ce dernier double la
  lumière du soleil s'il entre dans la PMREM) ; `WebGPURenderer` rend déjà la scène dans une cible
  HalfFloat puis applique la conversion de sortie (le tone mapping ne recompile aucun matériau) ; la
  construction des nœuds par tuile est le goulot des saccades (L2.6).
- Problèmes ouverts : marches d'altitude (L5.1) ; temps GPU des vues statiques bimodal (L2.9) ; bord net
  de la nappe nuageuse à l'horizon (lot 4).
- Prochaine étape : décider avec l'utilisateur de la fusion de `feat/render-quick-wins`, créer
  `feat/render-hdr-pipeline`, puis L2.9 (`GPUTimer` par frame) et L2.6.

### 2026-11-23 (2)
- Fait : lot 0 complet. Bundle three-tile construit, vues de référence + `window.osf`, scripts
  `render:capture` / `render:benchmark`, baseline mesurée, `TextureProvider.js` supprimé.
- Corrigé en chemin (l'outil de mesure en dépendait) :
  - benchmark par défaut inopérant : `createDefaultFlightPlan` recevait la caméra, sans `yaw`, d'où un
    cap `NaN` et une scène vide pendant tout le vol ; il reçoit désormais le `FlightController` ;
  - `MetricsCollector` enregistrait `info.render.calls` (cumulé depuis le démarrage) au lieu de
    `info.render.drawCalls` (par frame).
- Découvert : ciel masqué par le brouillard (L1.6), soleil au nord par défaut (L1.7), relief à 70 %
  de sa hauteur (L1.8), mesures GPU/FPS moyennes biaisées (L2.9), minicarte OSM bloquée (hors rendu).
- Commité sur la branche `feat/render-baseline` ; README : construction de three-tile obligatoire.
- Prochaine étape : décider avec l'utilisateur de la fusion de `feat/render-baseline`, créer
  `feat/render-quick-wins`, puis L1.6 : `sky.material.fog = false` dans `AtmosphericSky.js`, capturer
  les 5 vues et vérifier que le ciel de Preetham apparaît (dégradé zénith/horizon, disque solaire).
  Attention : sans tone mapping (L1.2), le ciel de Preetham risque d'être surexposé ; c'est attendu
  et sera recalé à L1.2.

### 2026-11-23
- Fait : analyse du rendu existant, création de cette feuille de route.
- Problèmes ouverts : bundle three-tile absent en local (L0.1).
- Prochaine étape : L0.1 puis L0.2.
