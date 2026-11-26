# Feuille de route — rendu de qualité AAA

Objectif : amener le rendu d'OpenSkyFlight au niveau des techniques des jeux AAA, avec une seule
contrainte : l'application doit continuer à fonctionner dans un navigateur (WebGPU, repli WebGL2).

Ce document est la **source de vérité de l'avancement**. Il est lu en début de session et mis à jour
en fin de session.

## État courant (mis à jour le 2026-11-26, session 25)

- **Lot 5 terminé** le 2026-11-26 à la demande de l'utilisateur, sur `feat/render-terrain` (depuis
  `main`, ni poussée ni fusionnée). Faits : L5.1 (raccord exact des bords entre tuiles, altitudes
  dans un worker), L5.2 (geomorphing du relief et fondu de l'imagerie), L5.3 (ombres du relief et de
  l'avion), L5.8 (mode courbes de niveau tactique phosphore), L5.9 (normales par pixel). L5.5
  abandonnée, L5.4 écartée (coût sans gain visible), L5.6 et L5.7 reportées (elles demandent des
  sources de données nouvelles, occupation du sol et masque d'eau, à choisir avec l'utilisateur).
  Bilan dans **Mesures** (lignes « Clôture du lot 5 »), captures `docs/screenshots/render/lot5/`.
  L5.2, L5.3 et L5.9 n'ont pas encore été jugées en vol par l'utilisateur. L'arbre des tuiles est
  mis à jour par `GeoTerrainManager.update`, plus par le rendu. Bundle three-tile à reconstruire après
  chaque `git pull` ou changement de branche (`cd vendor/three-tile && npm run build:lib`) : le worker
  d'altitude y est intégré.
- **Prochaine étape** : au choix de l'utilisateur, fusion du lot 5 dans `main`, lot de jeu G3, lot 6,
  ou reprise de L5.6 / L5.7.

- **Lot 4 terminé** le 2026-11-26 (toutes ses tâches faites, bilan dans **Mesures**, lignes
  « Clôture du lot 4 », captures `docs/screenshots/render/lot4/`), fusionné dans `main` le même jour
  à la demande de l'utilisateur (avance rapide depuis `feat/render-clouds`) et poussé par lui.
- **Lots terminés** : 0 à 4, fusionnés dans `main` (lots 2 et 3 le 2026-11-24, lot 4 le
  2026-11-26). Lot 4 : bilan et constats visuels dans **Mesures** (« Clôture du lot 4 »). Lot 3 : bilan dans
  **Mesures** (lignes « Clôture du lot 3 ») et constats visuels sous les tableaux. Lot 2 : toutes les tâches faites sauf le reste optionnel de
  L2.6 (décodage d'altitude dans un worker, `compileAsync`), reporté : p5 et p1 ne le justifient
  plus. Bilan dans **Mesures** (lignes « Clôture du lot 2 ») et constats visuels sous les tableaux.
- **three.js** : r187 (import map d'`index.html`), mis à jour depuis r183 pour le TRAA compatible avec
  la profondeur inversée.
- **Git** : lots 0 à 4 et lots de jeu G0 à G2 dans `main` (voir `git status -sb` pour les commits
  non poussés). Lot 5 terminé sur `feat/render-terrain`, non fusionné. Plus de worktree de comparaison : en
  recréer un si besoin (voir Outillage).
- **Environnement local** : bundle three-tile construit, `npm install` fait (racine et
  `vendor/three-tile`), cache `cache/` chaud pour les vues de référence et les deux vols. Lancer
  `npm run dev` en tâche de fond avant toute mesure. Mesurer **sur l'écran intégré 120 Hz** : sur un
  écran 60 Hz, Chrome plafonne à 60 FPS (la résolution dynamique ne se déclenche plus à tort depuis
  L2.4, mais les FPS ne sont pas comparables).
- **Référence de comparaison** : `benchmarks/render/lot5/` (état de clôture du lot 5, 6 vues) et vols
  `lot5-flight`, `lot5-plan1` (p1 87,7 et 87,7 ; leur colonne GPU est faussée par la passe d'ombre de
  l'avion, voir Mesures), captures versionnées dans `docs/screenshots/render/lot5/`. Avant elle :
  `benchmarks/render/lot4/` (état de clôture du lot 4, 6 vues ; la vue
  5 seule a des nuages) et vols `lot4-flight`, `lot4-plan1` (nuages désactivés, le réglage par défaut)
  et `lot4-flight-clouds`, `lot4-plan1-clouds` (nuages activés) ; captures versionnées dans
  `docs/screenshots/render/lot4/`. Avant elle : `benchmarks/render/lot3/` (état de clôture du lot 3 ; coût GPU des
  vues : seconde capture `lot3-cap2/`, la première ayant un pic thermique sur la vue 6 ; second vol du
  plan 1 dans `lot3-flight2/`), captures versionnées dans `docs/screenshots/render/lot3/` (6 vues et
  deux vues de nuit). Ancienne référence : `benchmarks/render/lot2/` (état de clôture du lot 2, preset High :
  captures des **6** vues avec coût GPU **à pleine résolution**, échelle, luminance adaptée, draw
  calls et triangles, deux benchmarks de vol, non versionnés). Chiffres dans **Mesures**, lignes
  « Clôture du lot 2 » ; captures versionnées dans `docs/screenshots/render/lot2/`. **Les coûts GPU antérieurs à L2.4 ont été mesurés à
  1028×645** (voir Outillage) : ne comparer qu'aux lignes « pleine résolution ».
- **Vue 6** (face au soleil bas, massif en contre-jour) ajoutée pour le bloom, et plus tard les rayons
  crépusculaires et le reflet d'objectif (L4.7).
- **Lire les temps GPU** (voir Outillage) : seul le « coût GPU » de `render:capture` (`gpuMedianMs`,
  mesuré GPU saturé) compare deux états du code ; la colonne GPU des vols indique la charge, pas le coût.
- **Rendu** : `js/rendering/ScenePipeline.js` — `RenderPipeline` : passe de scène HalfFloat (profondeur
  float32, MRT couleur + vitesse, sans MSAA, échelle réglable, fond transparent noir) → atmosphère
  (perspective aérienne + ciel sur les pixels vides, `rtt` à l'échelle de la passe, voir
  `setAtmosphere`) → `taau()` (reconstruction à la
  résolution de sortie) → `bloom()` ajouté à l'image TAAU → × correction d'exposition automatique
  (`AutoExposureNode`, histogramme mesuré sur l'image TAAU) → tone mapping et espace couleur en sortie.
  Seuil du bloom : nœud TSL fourni par `AtmosphericSky` (`setBloomThreshold`) ; exposition de base 8,5
  et plage de l'histogramme [−13 ; 5] (échelle de luminance du modèle takram, voir `constants/rendering.js`) ; échelle de la passe de scène pilotée par
  `AdaptiveQualityManager` (voir L2.4), plafonnée par `CONFIG.renderScale`.
- **Réglages** : menu ouvert par Échap (`js/ui/ControlPanel.js`), généré depuis
  `js/utils/settingsSchema.js` ; presets et correspondance réglages utilisateur → valeurs techniques
  dans `js/utils/qualityPresets.js` ; `localStorage` et paramètres d'URL dans
  `js/utils/settingsStore.js`. `render:capture` et `render:benchmark` ouvrent l'app avec `?dev=1`
  (et HUD / mini-carte masqués par l'URL pour les captures), dans un profil vierge : preset High,
  identique à l'état d'avant L2.10, donc les mesures de référence restent comparables.
- **Lot 3 terminé** (L3.1 à L3.10). Code : `js/atmosphere/AtmosphericSky.js`
  (contexte d'atmosphère dans `renderer.contextNode`, uniformes dans le groupe `render`, repère ECEF
  recalé chaque frame sous la caméra, horloge, soleil, lune, pré-exposition de nuit, aérosols tirés de
  la visibilité), `AerialPerspectiveVolume.js` (froxels par compute), `sunPosition.js`,
  `ephemeris.js`, `skyIlluminance.js`, `js/terrain/CityLights.js`, `js/aircraft/AircraftLights.js`,
  `js/rendering/ScenePipeline.js` (passe de halos, vision nocturne). Le proxy sert une nouvelle source
  `nightlights` : **redémarrer `npm run dev`** après la mise à jour. Correctifs du vendor listés dans
  `vendor/takram/README.md` (lignes `OSF:` dans `three-atmosphere/build/webgpu.js`).
  Pièges rencontrés : la direction de la lune doit être un vecteur unitaire même sans lune (sinon la
  PMREM du ciel se régénère à chaque frame, +2 ms) ; `renderer.info.autoReset` coupé (la remise à zéro
  de three tournait parfois après la frame de l'app : draw calls à 0) ; le ciel en `scene.backgroundNode`
  coûtait ≈ 0,5 ms (évalué sous tout le terrain), d'où son calcul dans la passe d'atmosphère ;
  `uniform()` de three tombe par défaut dans le groupe par objet (comparé et téléversé à chaque draw
  call) : tout uniforme commun à la frame doit passer en `renderGroup` ; le ray marching de takram lit
  un bruit bleu à `screenCoordinate`, absent d'un compute (`raymarchSampleOffset`) ; comparer
  WebGPU et WebGL2 avec `autoExposure=false` (exposition automatique WebGPU seulement).
- **Pause terminée le 2026-11-25** : les lots G0 à G2 de `docs/gameplay-roadmap.md` (socle de
  simulation, modèle de vol, réacteurs et jets) sont faits et fusionnés dans `main` (poussée le
  2026-11-25) ; les lots de vol et de rendu alternent désormais, le lot 4 d'abord. Conséquences pour les
  mesures de rendu :
  - l'app démarre en mode Simulation (l'avion vole) ; les vues de référence passent en Exploration
    (immobile) et `render:benchmark` ouvre l'app avec `flightMode=exploration` ;
  - **le preset High inclut la brume de chaleur** derrière les tuyères (réglage `heatHaze`,
    ≈ +0,1 ms sur chaque vue : passe de décalages et lectures décalées dans la passe d'atmosphère) :
    nouvelle référence des vues `benchmarks/render/haze-true-1` et `haze-true-2` ; pour comparer à
    `lot3-cap2`, capturer avec `--set heatHaze=false` (`haze-false-*` : identique au lot 3) ;
  - la lumière de postcombustion (`afterburnerLight`, +0,1 à 0,2 ms même éteinte) n'est active qu'en
    Ultra : le coût relatif d'Ultra (`PRESET_GPU_COST`) passe de 1,12 à 1,16 ;
  - le vol du plan 1 montre la flamme de PC tout le trajet (trajectoire imposée au-delà de
    300 m/s) : référence `benchmarks/render/g2-haze-flight` (p1 60,2, contre 64,1 au lot 3) ;
  - les écarts de +0,4 ms (jusqu'à +1,3) qui sautent d'une vue à l'autre d'une série de captures à
    l'autre touchent aussi l'ancien code : seules des captures alternées (worktree de l'ancien état
    sur le port 3001, ou `--set` d'un réglage sur le même code) tranchent une régression.
- **Lot 4** sur `feat/render-clouds` (depuis `main`, après la fusion de `feat/flight-model`
  le 2026-11-25). Toutes les tâches faites. Le réglage « Clouds » (`showClouds`, désactivé par
  défaut) dessine les nuages volumétriques en WebGPU (aucun en WebGL2) ; `cloudAltitude` fixe la base
  des cumulus, `cloudCover` la part du ciel couverte. Code : `js/clouds/`,
  `js/constants/clouds.js`, passe des nuages (`CloudsTemporalNode`) dans
  `ScenePipeline.setAtmosphere(apply, clouds)`, composition dans `AtmosphericSky._overScene`. Référence
  des vues : `benchmarks/render/clouds-8` (rayons crépusculaires ; vue 5 : 7,38 ms, 7,14 dans `clouds-8b`), avant elle
  `clouds-7` (traversée des nuages ; vue 5 : 7,43 ms, rien de mesurable
  sur les vues de référence, caméra loin des couches), avant elle `clouds-6` (ombres des nuages ; vue 5 : 7,51 ms, contre 7,13 dans
  `clouds-5`, marche stratifiée, 6,99 dans `clouds-4`, cirrus fibreux, et 6,80 dans `clouds-3`, l'état
  de la session 21 ; d'une série à l'autre ±0,4 ms : les captures alternées de la vue 5 donnent
  cirrus fibreux −0,08 ms, marche stratifiée +0,15 ms, ombres +0,12 ms). Les vues de référence remettent le vent à zéro,
  sinon la couverture en vue dérive pendant une capture et le coût de la vue 5 varie de ±0,6 ms. Une
  instance de l'app ouverte ailleurs (navigateur de l'utilisateur) double tous les coûts GPU d'une
  capture : vérifier qu'aucune ne tourne avant de mesurer. Tout est commité (dernier commit de code :
  traversée des nuages), branche non poussée ni fusionnée.
- **Prochaine étape** : lot 5 en cours (voir le premier point) ; le lot G3 du jeu suivra.
  Outils pour les défauts en mouvement : variantes passées dans l'URL que l'utilisateur essaie en
  vol, vol rejoué à pas de temps fixe (crochets temporaires `window.__advance(n)` et
  `window.__move(m)` dans la boucle de rendu de `js/app.js`, à recréer : les patchs du scratchpad ne
  survivent pas à la session). Fait avec l'utilisateur : scintillement (rognage de l'historique,
  L4.4), cirrus gris, contraste de l'ombre propre et forme des cirrus (L4.3), lumière dans un nuage
  et avion visible dans un nuage (L4.6).
- **Suite** : lot 4 (nuages volumétriques). Points ouverts : culling des tuiles par three presque
  inopérant (sphère englobante calculée en coordonnées locales où l'épaisseur est en mètres et la
  largeur en tuiles : rayon démesuré une fois mis à l'échelle), piste CPU et GPU pour le lot 5 ; coût CPU de soumission (≈ 5 µs par
  draw call) qui limitait Ultra à 120 Hz, à remesurer depuis qu’une tuile ne coûte plus qu’un draw call ; minimap OSM bloquée par la politique d'usage des tuiles
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
- Comparer avec un état antérieur : `git worktree add ../osf-<nom> <commit>`, liens symboliques vers
  `cache/` et `node_modules/` du dépôt, `cd vendor/three-tile && npm run build:lib` dans le worktree,
  puis `node scripts/serve.js --port 3001` et `--url http://localhost:3001/` pour les scripts de mesure.
  Faire les mesures sur un port autre que 3000 (serveur de l'utilisateur), et n'arrêter que son propre
  serveur (tâche de fond ou PID) : `pkill -f scripts/serve.js` arrête aussi celui de l'utilisateur.
- Scintillement des nuages (scripts Playwright ad hoc, non versionnés) : vue 5 caméra fixe, 40
  captures 1280×800 ×1 à ≈ 120 ms d'intervalle, écart moyen de luminance entre captures successives
  (sur 255) dans des zones de nuages seuls (`magick … -compose difference`), comparé à la même zone
  sans nuages (`setConfig('showClouds', false)` après la vue) ; dérive = premier contre dernier. Pour
  le mouvement : `cameraSpeed` 560, `cloudAltitude` 5000 (nuages juste sous l'avion), touche W
  maintenue. Pour voir où l'historique est rejeté ou rogné : teinter ces pixels en rouge dans la
  résolution ; pour les valeurs exactes, lire les cibles de `CloudsTemporalNode` par
  `renderer.readRenderTargetPixelsAsync` via un export temporaire dans `window.osf`.

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
      thread principal), `compileAsync`. Décodage dans un worker fait avec le raccord des bords (voir
      L5.1, session 24) : p1 59,2 → 77,5 (plan 1) et 62,9 → 80,6 (vol par défaut). Reste
      `compileAsync`.
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
- [x] **L3.2** LUT : transmittance, diffusion multiple, vue du ciel, volume de perspective aérienne.
      Fait : LUT de la bibliothèque (transmittance, diffusion multiple de Hillaire, diffusion 4D de
      Bruneton, irradiance), calculées par compute shader au démarrage et à chaque changement de
      visibilité. Volume de perspective aérienne (`js/atmosphere/AerialPerspectiveVolume.js`) :
      128 × 64 × 64 cellules alignées sur le frustum, espacement quadratique jusqu'à 1 000 km, calculé
      à chaque frame par compute avec `getIndirectLuminanceToPoint` (ray marching, échantillon au
      milieu de chaque segment : correctif `raymarchSampleOffset` du vendor), lu par chaque pixel en
      deux lectures 3D trilinéaires. Images identiques à l'évaluation par pixel (PSNR 47–51 dB, de 20 à
      220 km de visibilité), −0,6 à −1,4 ms par vue ; le volume coûte ≈ 0,2–0,5 ms. Repli par pixel en
      WebGL2 et via la case « Aerial perspective volume » de l'onglet Developer.
- [x] **L3.3** Perspective aérienne appliquée au terrain, à l'avion et à l'eau ; suppression de `FogExp2`.
      Fait : `aerialPerspective` après la passe de scène, avant TAAU, à la résolution de la passe
      (`ScenePipeline.setAtmosphere`) ; ciel évalué dans la même passe sur les seuls pixels sans
      profondeur, derrière la couche de nuages transparente ; `FogExp2`, `SkyMesh`, `SkyEnvironment`
      et `preethamSky.js` supprimés ; le réglage « Distance haze » (`fogEnabled`) active la
      perspective aérienne. Réglage « Visibility » (onglet World, 10 à 280 km au niveau de la mer,
      curseur logarithmique, défaut 220 km ≈ aérosols de Hillaire d'avant) : extinction des aérosols
      tirée de la visibilité météorologique (Koschmieder, seuil de contraste 2 %, moins l'extinction
      de Rayleigh) ; coefficients de Mie passés en uniformes dans le vendor (correctif décrit dans son
      `README.md`), LUT recalculées sur quelques frames sans recompiler les matériaux ni saccade
      (curseur glissé en continu : aucune frame > 33 ms, WebGPU comme WebGL2).
- [x] **L3.4** Couleur et intensité du soleil et de l'ambiance dérivées de l'atmosphère.
      Fait : `AtmosphereLight` (soleil direct avec sa transmittance et lumière diffuse du ciel, toutes
      deux évaluées en chaque point), PMREM du ciel (`skyEnvironment`) pour les seuls reflets
      (`ReflectionEnvironmentNode`, appliqué à tous les matériaux PBR), seuil du bloom calculé sur le GPU depuis
      les LUT, exposition et plage de mesure recalées (×24,3, moyenne géométrique des vues de jour).
      Choix de l'utilisateur : lumière du ciel en chaque point (option « B ») ; il préfère la nouvelle
      atmosphère, surtout en altitude, mais l'avion se détache moins du terrain voilé en vue rapprochée.
      Uniformes du contexte d'atmosphère (matrices ECEF, correction d'altitude, soleil, aérosols) dans
      le groupe `render` de three au lieu du groupe par objet : voir **Décisions** et **Mesures**.
- [x] **L3.5** Position astronomique du soleil (date, heure, lat/lon) ; curseur d'heure et accélération
      du temps dans l'onglet World du menu de réglages (entrées du schéma `settingsSchema.js`, réglages
      compréhensibles par l'utilisateur, voir les décisions sous L2.10).
      Fait : `js/atmosphere/sunPosition.js` (déclinaison par la série de Fourier du calculateur NOAA,
      angle horaire depuis le temps solaire vrai, sans réfraction, sans dépendance) ; réglages « Time of
      day » (temps solaire local, pas de 5 min), « Date » (jour de l'année, « 3 Mar ») et « Time speed »
      (Frozen, Real time, ×60, ×600 ; défaut Real time) à la place de « Sun height » / « Sun direction ».
      Horloge dans `AtmosphericSky` : avance avec la simulation (arrêtée menu ouvert), soleil placé à la
      latitude sous la caméra, heure publiée dans CONFIG à chaque minute. Défaut 3 mars 10 h 55 (soleil
      35,1° / 160,2°, ≈ l'ancien défaut) ; vues de référence converties en date + heure qui redonnent
      leur soleil à 0,15° près, horloge figée (captures identiques, PSNR 50–64 dB). PMREM du ciel
      régénérée après 0,5° de course du soleil au lieu de 0,1° : ×600 sans saccade.
- [x] **L3.6** Nuit : ciel étoilé, lune, lumières des villes (tuiles NASA Black Marble via le proxy de
      `scripts/serve.js`) en émissif sur le terrain.
      Fait : éphémérides basse précision (`js/atmosphere/ephemeris.js` : lune à 0,3°, rotation
      terrestre pour les étoiles, année 2026, UTC déduit du temps solaire et de la longitude) ;
      `StarsNode` et `MoonNode` de takram dans le ciel, diffusion lunaire du ciel ; la lune devient la
      lumière de la scène (`AtmosphereLight` en corps « moon », phase d'Allen) quand elle éclaire 4 fois
      plus que le crépuscule, et la source de la perspective aérienne et du seuil du bloom (plancher à
      2 × la luminance de référence). **Pré-exposition** (`AtmosphericSky.preExposure`) : éclairement
      du sol (table du crépuscule, lune, ciel nocturne 0,008 lux) → exposition appliquée avant les
      cibles HDR sous 4° de hauteur du soleil, 25 % de la baisse restant visible (`luminanceScale` de
      takram passé en uniforme) ; sans elle, le sol au clair de lune est sous la précision du
      HalfFloat. Lumière ambiante et lueur du ciel nocturnes (étoiles, lueur atmosphérique, halo des
      villes). **Vision nocturne** par pixel (`ScenePipeline._nightVision`) : désaturation bleutée sous
      3 cd/m², totale sous 0,003, sauf pour les pixels ≥ 2–10 × la luminance d'adaptation (sources).
      Lumières des villes (`js/terrain/CityLights.js`) : mosaïque Black Marble 2016 de 8 × 8 tuiles
      (zoom 8, ≈ 450 m/pixel) autour de la caméra, lumières isolées par leur teinte chaude, lissée,
      lue par un nœud émissif partagé par toutes les tuiles (aucune compilation ni draw call de plus),
      motif procédural de lampes (cellules de 30 m, hameaux dans les campagnes) fondu dans la moyenne
      au loin, allumage entre 2° et −4° de hauteur du soleil, sauté le jour (branche sur uniforme).
- [x] **L3.8** (ajoutée à la demande de l'utilisateur) Feux de l'avion et lueur des réacteurs.
      Fait : `js/aircraft/AircraftLights.js` : feux de position (rouge gauche, vert droit, blanc de
      queue, avec leurs secteurs de visibilité), gyrophares rouges (dérive, ventre) et éclats blancs
      doubles (saumons) ; lentilles ajoutées au modèle (verre coloré le jour, émissives) et halos dans
      une **passe de halos** (`ScenePipeline.setGlowLayer` : calque dédié, demi-résolution, ajoutée
      après le TAAU, test d'occultation contre la profondeur de la scène). Tuyères du modèle repeintes
      en métal nu, fond de tuyère lumineux selon la poussée (touche avant ou pilote automatique),
      flamme de postcombustion à diamants de choc au-dessus de 300 m/s. Les sources ponctuelles prennent
      la racine de la pré-exposition (`emissiveExposure`) pour ne pas noyer l'image d'éblouissement ;
      les lumières des villes, sources étendues, prennent la pré-exposition complète. 4 draw calls
      (instanciation, géométries fusionnées). Interrupteur des feux anticollision (gyrophares et
      éclats ; demande de l'utilisateur) : réglage « Anti-collision lights » de l'onglet Flight,
      touche O (celle des feux à éclats dans les simulateurs courants) ; les feux de position restent allumés.
- [x] **L3.9** (ajoutée) Horizon : courbure de la Terre et sol lointain.
      Fait : terrain abaissé de d²/2R autour de la caméra dans le nœud d'élévation partagé de
      three-tile (`tile/curvature.ts`), test de visibilité des tuiles abaissé d'autant, couche nuageuse
      sous-divisée et courbée ; sous l'horizon, la passe du ciel dessine le sol de l'ellipsoïde (albédo
      `DISTANT_GROUND_ALBEDO`, éclairé par le soleil ou la lune et le ciel, vu à travers l'air) au lieu
      de la diffusion seule de takram, dont la table saute à l'horizon (trait clair) et laissait une
      bande de brume entre le bord du terrain et l'horizon. Images de jour inchangées ailleurs qu'à
      l'horizon (PSNR ≥ 42 dB), coût GPU inchangé.
- [x] **L3.10** (ajoutée) Villes survolées de près sans lune.
      Fait : la moyenne logarithmique de la luminance des lumières des villes sur un disque devant la
      caméra (rayon 3 × la hauteur sol, 1,5 à 20 km), suivie au rythme de l'œil, s'ajoute à
      l'éclairement qui fixe la pré-exposition (`CityLights.viewLuminance`). Une ville qui remplit la
      vue n'est plus une plaque grise saturée mais des points orangés sur un sol sombre ; vue de haut,
      où elle n'occupe qu'une petite part de la vue, rien ne change (la moyenne arithmétique
      assombrissait la montagne au clair de lune à cause de Chamonix).
- [x] **L3.7** Vérifier les modes `sar` et `elevation` (ciel désactivé).
      Fait : SAR sans atmosphère (ciel noir, éclairage latéral, sans tone mapping) ; `elevation` avec
      ciel et perspective aérienne, un peu clair (albédo élevé de la palette hypsométrique), accepté.
      Captures `benchmarks/render/l3-sar/` et `l3-elevation/`.

## Lot 4 — Nuages volumétriques

- [x] **L4.1** Textures de bruit 3D générées par compute shader (Perlin-Worley 128³, Worley 32³).
      `js/clouds/tileableNoise.js` (Worley et Perlin périodiques, hachage entier PCG3D au lieu du hachage
      en sinus de Hillaire, qui plaçait tous les points de Worley sur la diagonale de leur cellule) et
      `js/clouds/CloudTextures.js` (forme 128³, détail 32³, carte météo 512², en `rgba8unorm` : un format à
      un canal ne s'écrit pas en compute). Générées une fois au démarrage : ≈ 20 ms (300 ms au premier
      lancement, compilation comprise). Comparées côte à côte aux textures livrées par takram : même
      structure, sans leurs coutures.
- [x] **L4.2** Carte météo (couverture, type de nuage) et vent.
      Fait : carte météo générée avec les autres textures (cumulus en rouge, nuages moyens en vert,
      cirrus en bleu, 100 km par répétition), couverture (uniforme `coverage`), vent constant
      (`CLOUD_WIND`, la carte et la forme dérivent ensemble). Couverture réglable dans le menu avec
      L4.8 (« Cloud cover »). Le vent reste constant, sans réglage : il ne porte que les nuages, pas
      l'avion, et un réglage de vent sans effet sur le vol serait trompeur (à reprendre si le modèle de
      vol prend le vent en compte).
- [x] **L4.3** Ray marching dans la couche, éclairage Beer + powder + Henyey-Greenstein double lobe,
      ambiance issue de l'atmosphère.
      Fait (première version) : `js/clouds/VolumetricClouds.js`, modèle de takram three-clouds porté en
      TSL (trois couches, fonction de forme en demi-cercle, érosion par la forme et le détail, marche
      vers la lumière en 6 pas croissants de 40 m, ≈ 2,5 km, au lieu de leur carte d'ombre BSM,
      diffusion multiple de Wrenninge en 8 octaves, poudre, intégration de Frostbite), lumière du
      soleil (ou de la lune) et du ciel aux altitudes basse et haute des couches tirées des tables de
      takram au point d'entrée du rayon, perspective aérienne à la distance moyenne pondérée par
      l'opacité. Coquilles centrées sur le centre de la Terre sous la caméra (même courbure que le
      terrain). Passe à 0,5 × la résolution de la passe de scène, composée dans la passe d'atmosphère
      (`_overScene`) devant la scène et le ciel. Vue 5 : coût GPU 8,75 ms (≈ +4,8 ms), image granuleuse
      (bruit bleu du point de départ non accumulé). Reste : réglages fins (cirrus gris, contraste de
      l'ombre propre, rebond du sol), grain des nuages proches en mouvement. Coût et grain à l'arrêt
      traités par L4.4.
      Réglé avec l'utilisateur : plus de poudre (elle se règle sur l'extinction ; pensée pour les
      bords des cumulus denses, elle divisait par ≈ 3 la lumière des cirrus, 100 fois moins denses,
      plus sombres que le ciel derrière eux, et ternissait les cumulus). La lumière du ciel à 0,5
      donnait plus de volume aux faces à l'ombre mais grisait le dessus des cumulus : refusée.
      Coefficients de la diffusion multiple en constantes (`CLOUD_SCATTERING_DECAY`, inchangés).
      Grain des nuages proches en vol rapide : plus de points sombres depuis la correction du
      rognage (L4.4), seulement un léger flou en mouvement. Rebond du sol (`groundBounceScale` de
      takram) écarté pour l'instant par l'utilisateur, faute de vue sous la couche.
      Cirrus fibreux (choisis avec l'utilisateur parmi des variantes, mélange de deux d'entre elles) :
      la couche haute était une nappe grise et lisse, proche d'un altostratus. Elle ne se forme plus
      que le long des fibres d'une carte 2D (`CloudTextures.cirrus`, 1024² pour 20 km, générée au
      démarrage) : crêtes de bruit de Perlin étirées 16 fois dans le sens du vent, courbées par un
      bruit large (crochets en « queue de cheval »), seuillées d'autant plus bas que la carte météo
      est dense (`CLOUD_CIRRUS_FIBRES`) ; couche de 175 m au lieu de 500, densité 0,0011 au lieu de
      0,002, sans bruit de forme. Une érosion façon bruit de forme ne creusait que les bords : au cœur
      de la nappe la densité vaut 1 et `remapClamp(1, x, 1)` reste 1. En 512² ou avec des crêtes plus
      fines, une fibre en diagonale se hachait en perles verticales (crête large d'un texel). Coût :
      −0,08 ms sur la vue 5 (captures alternées, couche plus mince). Scintillement caméra fixe dans la
      zone des cirrus 0,11 sur 255 (nappe : 0,06 ; surface des cumulus : 0,50) ; vérifié en vol.
      Marche stratifiée : en vol, l'utilisateur voyait le contenu des nuages « rouler » comme le nuage
      d'une explosion, surtout en périphérie et au loin, et l'avion se couvrir de points dans un nuage.
      Ni le vent (sa dérive est une translation rigide : 6 s de vent donnent l'image d'un décalage
      instantané de 51 m) ni la reconstruction temporelle (effet identique en marchant tous les pixels
      sans historique) n'en étaient la cause, mais la marche : seul le départ était tiré au hasard,
      dans le premier pas, alors que les pas grandissent avec la distance. Au loin, les échantillons
      tombaient à des places fixes de leurs pas, qui suivent la caméra (ils partent de l'entrée dans la
      couche) : le crénelage du bruit de forme glissait avec l'avion à travers les nuages. Et le dernier
      pas n'était pas raccourci à la scène : l'avion, à 25 m dans un nuage, recevait selon le tirage
      zéro ou un échantillon intégrant 60 m de nuage. Désormais un échantillon tiré au hasard dans toute
      la largeur de chaque pas, et le dernier pas s'arrête à la scène. Écart à une marche de référence
      (pas de 20 à 50 m, 4096 pas ; image convergée de la vue 5) : nuages lointains 1,45 % → 1,10 %,
      moyens 1,05 → 0,82, proches inchangés (bruit). Validé en vol par l'utilisateur, avion voilé
      uniformément dans un nuage. Coût : +0,15 ms sur la vue 5 (captures alternées).
- [x] **L4.4** Rendu à 1/4 de résolution + reprojection temporelle, composition tenant compte de la
      profondeur du terrain.
      `js/clouds/CloudsTemporalNode.js` : chaque frame marche un pixel de chaque bloc 4×4 de la passe
      de scène (ordre de Bayer, comme takram) dans une cible qui garde aussi la distance du front des
      nuages et de la scène ; la résolution, à la pleine résolution de la passe de scène, reprojette
      l'image précédente au point que montre chaque pixel (distance de sa propre scène ou du front des
      nuages voisins, la plus proche), la garde si la distance de scène qu'elle avait concorde à 10 %,
      la borne à l'étendue des nuages marchés autour (variance × 2, élargie de la précision des
      demi-flottants de l'historique), et mêle à 20 % les pixels marchés dans la frame. Sinon (désocclusion, bords) : moyenne des voisins pondérée par la ressemblance de
      leur distance de scène, ceux dont les nuages commencent derrière la surface du pixel comptant
      pour clairs (sans quoi un liseré de nuage bordait l'avion en roulis). Historique en ping-pong
      (les deux copies plein écran coûtaient de l'ordre de 0,5 à 0,75 ms, mesure faite avant la remise à
      zéro du vent). Vue 5 : nuages ≈ 2,65 ms (≈ 4,8 ms avant), essentiellement la marche. Vérifié en roulis rapide : pas de traînée ni de halo aux
      silhouettes de l'avion et du relief.
      Scintillement de la surface des nuages corrigé ensuite : au cœur des nuages, l'opacité de
      tous les voisins vaut exactement 1 (étendue nulle) et l'historique, arrondi en demi-flottant,
      en sortait toujours, si bien que la boîte ramenait à chaque frame toute la couleur sur le bruit
      de la frame. Mesure (vue 5, caméra fixe, écart moyen de luminance entre captures à ≈ 120 ms,
      sur 255) : cumulus 2,77 → 0,50, horizon 2,86 → 1,57 (relief seul : 1,07 et 1,20). Le bruit de
      détail suit désormais le vent avec la forme (il restait fixe, et les nuages glissaient dessous).
      Un rognage limité aux pixels marchés, essayé d'abord, laissait en vol une trame de nuage périmé
      sur le relief découvert : le rognage à chaque frame reste nécessaire.
- [x] **L4.5** Ombres des nuages sur le terrain.
      `js/clouds/CloudShadow.js` : carte de 512² sur 60 km centrée sous la caméra, recalée par texel
      (les échantillons restent fixes sur le sol), redessinée tous les 4 rendus (`CLOUD_SHADOW_REFRESH` ;
      entre deux, la lecture recale le centre gardé en coordonnées monde, en doubles). Chaque texel suit
      le rayon vers la lumière qui croise la base des cumulus en ce point et garde l'épaisseur optique
      des nuages au-dessus de quatre hauteurs : la base, le tiers et les deux tiers jusqu'au sommet des
      nuages moyens, ce sommet (au-delà, les cirrus seuls) ; 8 pas par tiers, 2 dans les cirrus, bruit
      de forme sans détail, sauté là où la carte météo est vide. Un point qui reçoit les ombres est
      projeté le long de la lumière sur la base, et l'épaisseur interpolée à sa hauteur : un sommet
      qui dépasse dans la couche n'est pas ombré par les nuages en dessous. Fondu vers les bords de la
      carte (au-delà de ≈ 24 km, plus d'ombre) ; élévation de la lumière prise d'au moins 3° pour la
      projection. Branchement : `light.shadow.shadowNode` de three sur l'`AtmosphereLight` (soleil ou
      lune), avec `renderer.shadowMap.enabled` et `castShadow` mais sans carte de profondeur (le nœud
      personnalisé remplace celle de three : aucun draw call de plus) ; le facteur ne multiplie que la
      lumière directe, pas celle du ciel ni l'émission des villes. Le terrain reçoit les ombres
      (`tileMap.receiveShadow`, recopié par three-tile sur chaque tuile), et la cellule de l'avion
      (ajoutée à la demande de l'utilisateur ; ses feux et ses jets restent lumineux) : sous un nuage
      ou dedans, il n'est plus éclairé que par le ciel, comme le sol autour de lui. Dans un nuage,
      cette lumière du ciel est celle d'un ciel clair (bleutée) : la lumière diffusée par le nuage
      lui-même, plus blanche, reste à ajouter (traversée des nuages, L4.6). La carte est
      dessinée avant chaque rendu du pipeline (`ScenePipeline.setBeforeRender`), donc comptée dans les
      rendus répétés de la mesure GPU. Coût (vue 5, captures alternées) : +0,12 ms (carte redessinée à
      chaque rendu : +0,45 à +0,75 ms ; lecture par fragment : rien de mesurable). En vol, carte
      redessinée tous les 4 rendus ou à chaque rendu : mêmes images à chaque phase du cycle.
- [x] **L4.6** Traversée des nuages (caméra dans la couche).
      Lumière dans un nuage : au cœur d'un nuage épais, les octaves de la diffusion multiple de
      Wrenninge s'éteignent en quelques centaines de mètres et seule restait la lumière du ciel, d'où
      un brouillard gris bleuté. S'y ajoute la lumière diffusée en profondeur, qui décroît en
      1 / (1 + rate × τ) vers le soleil (`CLOUD_DIFFUSION`, on garde le plus grand des deux termes).
      Choisie par l'utilisateur parmi quatre réglages sur des planches (dedans et vue 5 de dehors) :
      rate 0,05, scale 0,5 ; plus fort (0,1 ; 1), l'intérieur était plus blanc mais les flancs ombrés
      des cumulus, vus de dehors, s'aplatissaient.
      Brouillard proche : en vol à 560 m/s, l'entrée dans un nuage se couvrait de taches de la taille
      de trois blocs 4×4. Le contenu des 100 premiers mètres change trop vite pour la reconstruction
      temporelle (un pixel marché toutes les 16 frames, reprojeté à une seule distance pour tout un
      volume) : marcher tous les pixels à chaque frame donnait une image propre ; ni la marche en pas
      fins près de la caméra, ni le bruit de détail atténué, ni un noyau de repli plus large n'y
      changeaient rien. Les nuages à moins de `CLOUD_NEAR_DISTANCE` (200 m) de la caméra, quand elle
      est à moins de 200 m d'une couche, sont donc marchés à chaque frame
      (`VolumetricClouds.nearFog`, 6 échantillons stratifiés) dans une cible à demi-résolution de la
      passe de scène, filtrée en la posant sur le reste dans `_overScene` ; la marche temporelle part
      au-delà. L'épaisseur optique vers la lumière y est lue dans la carte des ombres (L4.5) : la
      marche vers la lumière à chaque pixel coûtait +6,5 ms en pleine résolution, +2,5 ms avec la
      carte, +0,7 ms à demi-résolution (vue 5 dans la couche, `cloudAltitude` 6000 et avion avancé de
      600 m). Pas de halo visible autour de l'avion. Reste un grain fin dans le brouillard proche en
      mouvement (tirage stratifié par frame) ; des échantillons à places fixes l'effacent mais
      risquent de ramener le contenu qui « roule » (voir L4.3), gardé tel quel.
      Avion visible dans un nuage (demande de l'utilisateur) : la densité entre la caméra et l'avion
      monte de 0 à 30 % de sa distance jusqu'à sa pleine valeur à l'avion (`CLOUD_CLEARING`) ; rien
      en vue cockpit.
      Lumière des nuages sur l'avion (`js/clouds/CloudAmbient.js`) : à chaque rendu, 16 rayons par
      face d'un cube partent de l'avion (tirés selon le cosinus autour de l'axe de la face, marche
      des nuages ordinaire depuis un point décalé de la caméra) ; la moyenne de chaque face, mêlée à
      10 % aux rendus précédents, donne l'éclairement des nuages et la part de ciel restante (cube
      ambiant de Valve). À moins de 60 m de l'avion, la lumière du ciel de l'`AtmosphereLight`
      (sous-classe `CloudLitAtmosphereLightNode`, qui intercepte l'irradiance ajoutée par
      `setupDirect`) et les reflets de l'environnement sont en partie masqués et complétés par la
      lumière des nuages. Coût : +0,18 ms sur la vue 5 (captures alternées).
      Défaut trouvé au passage : three force à 1 l'alpha de la couleur d'un matériau opaque ; la
      carte des ombres gardait l'épaisseur des seuls cirrus dans ce canal, si bien qu'un point entre
      le sommet des nuages moyens et les cirrus (l'avion de la vue 5) ne recevait que 37 % du soleil
      sous un ciel clair. Les passes plein écran écrivent désormais leur `outputNode`.
      Capture `clouds-7` : coûts des vues de référence inchangés (vue 5 : 7,43 ms).
- [x] **L4.7** Rayons crépusculaires (`GodraysNode`) et reflet d'objectif (`LensflareNode`).
      Rayons crépusculaires des nuages, sans `GodraysNode` (il marche la carte de profondeur d'une
      lumière, que le soleil n'a pas : ses ombres viennent de la carte des nuages, L4.5). L'air à
      l'ombre des nuages ne diffuse plus le soleil : un second volume, 256×128×32 sur les 25 km que
      couvre la carte des ombres (`LIGHT_SHAFT_*`), suit le rayon de chaque colonne, lit la part de
      lumière cachée en 4 points de chaque cellule et cumule la lumière diffusée sur la cellule (écart
      du volume de perspective aérienne entre ses bouts) pondérée par cette part ; les pixels la
      retranchent à leur distance, le ciel celle de toute la colonne. Première version par la
      longueur d'ombre de Bruneton dans la bibliothèque (`shadowLength`, un seul tronçon par rayon) :
      +1,3 ms (évaluation « précise » des tables dans chaque cellule) et marches d'escalier sur les
      bords d'ombre à 128×64 ; la version retenue ne coûte rien de mesurable (vue 6 sous les nuages,
      captures alternées) et ses colonnes, décalées à chaque frame, sont lissées par l'anticrénelage.
      Intensité choisie par l'utilisateur sur planche (vue 6, nuages à 5000 m) : 70 % de la lumière
      ôtée (`LIGHT_SHAFT_STRENGTH`), l'air à l'ombre diffusant encore celle du ciel ; à 100 %, la
      brume disparaissait à l'ombre. Les reliefs ne font pas encore de rayons (pas de carte d'ombre du
      terrain avant L5.3).
      Reflet d'objectif (`LensflareNode` de three, images fantômes du bloom à travers le centre de
      l'image, adoucies par un flou gaussien) : réglage « Lens flare » du menu, désactivé par défaut et
      hors presets (choix de l'utilisateur). Seul le cœur du bloom fait des fantômes (20 fois son
      seuil, `LENS_FLARE`) : son halo large en faisait des disques de la moitié de l'image. Coût
      +0,15 à +0,5 ms sur la vue 6 (d'abord +1,3 ms : les nœuds passés sans `getTextureNode()` étaient
      recopiés dans des cibles plein écran).
      Captures `clouds-8` et `clouds-8b` : coûts des vues de référence inchangés.
- [x] **L4.8** Retirer l'ancien `CloudLayer` plan ; adapter les contrôles du panneau.
      `js/atmosphere/CloudLayer.js` supprimé (et `CLOUD_RENDER_ORDER`) : en WebGL2, plus de nuages du
      tout (ils demandent des compute shaders), l'aide du réglage « Clouds » le dit. Réglage « Cloud
      density » (`cloudOpacity`, opacité de la couche plane) remplacé par « Cloud cover »
      (`cloudCover`, 0 à 100 %, 50 % par défaut) : la part du ciel que les nuages semblent couvrir,
      convertie en couverture de la carte météo par une table (`CLOUD_COVER_TO_COVERAGE`) établie sur
      la vue 5, la couverture agissant très raide (rien sous 0,15, ciel couvert au-delà de 0,6). 50 %
      donne la couverture 0,4 des captures précédentes ; les vues de référence remettent le réglage à
      sa valeur par défaut. Ciel couvert (100 %) : +0,16 ms sur la vue 5. « Cloud altitude » désigne la
      base des nuages les plus bas. README : nuages volumétriques dans les fonctionnalités, dossier
      `js/clouds/`.

## Lot 5 — Terrain, ombres et eau

- [x] **L5.1** Carte d'altitude : réduction bilinéaire au lieu du plus proche voisin
      (`TerrariumShaderLoader.ts:40`), pas de texel cohérent avec la grille (`TerrariumTSL.ts:70`),
      normales par pixel depuis la carte d'altitude 256 px complète.
      Fait : décodage Terrarium sur le CPU en texture float (une altitude par sommet, lue par
      `textureLoad`), réduction bilinéaire aux positions exactes des sommets, normales sur les sommets
      voisins. Puis (session 24) **raccord exact des bords** : mesuré avant (script Playwright, surface
      de chaque tuile affichée échantillonnée le long des arêtes partagées), écart au p90 de 5–9 m en
      z13–z14, 19–21 m en z12, 33–36 m en z11, jusqu'à 77 m (même niveau aussi bien qu'entre niveaux :
      chaque tuile bornait l'échantillonnage à son dernier pixel), d'où des courbes de niveau coupées.
      Code (`vendor/three-tile/.../terrariumShaderLoader/`) : une seule fonction d'altitude pour le
      globe (`heights.ts` : tuiles sources échantillonnées par-delà leurs bords, positions de sommets en
      entiers sur puissances de 2, donc exactes en flottant : deux voisines de même niveau ont des
      arêtes identiques au bit près) ; grilles emboîtées (`grid.ts` : 16 cellules sous z4, 32 de z4 à
      z9, 64 dès z10, au lieu de 15 à 67 sans rapport entre niveaux) ; chaque tuile porte, pour chaque
      arête, le profil qu'y trace une voisine 1 à 4 niveaux plus grossière (lignes supplémentaires de
      la texture d'altitude) ; `GeoTerrainManager._updateEdgeLevels` trouve à chaque frame le niveau des
      voisines affichées (tuile affichée contenant le milieu de l'arête, juste dehors, à son niveau ou
      au-dessus) dans `mesh.userData.edgeLevels`, que le shader de sommets lit pour caler l'arête sur
      le profil (un coin suit la plus grossière de ses deux voisines) ; couronne d'un sommet autour de
      la grille : normales centrées jusqu'aux bords (plus de marche d'éclairage entre tuiles). Le
      calcul (téléchargement, décodage, cache LRU de 400 tuiles sources, altitudes) tourne dans un
      worker (`heights.worker.ts`), ce qui solde le reste de L2.6. Après : p90 de 0 m à tous les
      niveaux, moyenne de quelques cm, pics isolés aux coins de tuiles lointaines (une diagonale plus
      grossière que les deux voisines directes, non vue). Mesures dans **Mesures** (`terrain-stitch-*`).
      Normales par pixel : sorties en L5.9.
- [x] **L5.2** Geomorphing entre niveaux de LOD (suppression du « pop »).
      Fait : morphing **dans le temps** plutôt qu'à la distance par sommet (CDLOD) : three-tile choisit
      ses niveaux tuile par tuile (distance au centre / diagonale, renfort au centre de la vue qui
      dépend de l'orientation de la caméra, hystérésis), un morph fonction de la distance n'aurait
      pas suivi cette sélection. Chaque tuile a un `morph` (`Tile.ts`, 0 : surface du parent, 1 : la
      sienne) parcouru en 0,75 s (`TileMap.morphDuration`, avancé à chaque frame par
      `TileMap.updateMorph`). **Subdivision** : les quatre enfants apparaissent sur la surface exacte
      du parent (ses triangles, diagonale sud-est – nord-ouest, calculés dans le worker : W lignes de
      plus dans la texture d'altitude, `parentRow`), puis rejoignent la leur ; un parent encore en
      cours de morph finit d'abord, quatre fois plus vite. **Fusion** : les enfants restent affichés
      et reviennent sur la surface du parent, les niveaux les plus fins d'abord, puis le parent
      s'affiche (`_merging` hérité des ancêtres, plus de subdivision dessous). **Raccords** : une
      tuile de niveau z au morph m dessine la surface du niveau z − 1 + m ; chaque bord suit le côté
      le plus grossier (`edgeLevels` devient fractionnaire : d + f mélange les profils d et d + 1,
      profil 0 = la tuile elle-même), les voisines restent jointives même quand elles ne se
      transforment pas ensemble ; normales tirées de la surface mélangée. **Imagerie** en fondu au
      même rythme : la texture du parent (gardé chargé tant que ses enfants sont affichés),
      échantillonnée sur le quart couvert, liée par objet comme la carte d'altitude
      (`applyTerrariumImagery`, un seul graphe compilé). `groundHeight` suit le morph.
      Trouvé en chemin : three mettait à jour l'arbre des tuiles pendant `render()` (TileMap est un
      objet LOD), après le calcul des bords : une tuile affichée par une fusion était dessinée une
      frame avec des bords périmés, et chaque rendu de la scène (cascades d'ombre de L5.3 comprises)
      aurait évalué les LOD depuis sa propre caméra. `autoUpdate` coupé, arbre mis à jour au début
      de la phase terrain (`GeoTerrainManager.update(camera, delta)`), puis morph, puis bords.
      Vérifié (scripts Playwright, vue 2, seuil de LOD abaissé à 0,4 puis rétabli) : plus grand
      saut du sol d'une frame à l'autre 58,8 m sans morph, 1,0 m avec ; morph figé, aucune variation
      du sol au remplacement (surface du parent reproduite exactement) ; écart entre les bords des
      voisines reconstruits sur le CPU pendant les transitions ≤ 0,24 mm sur 46 M sommets (hors
      dernière cellule grossière avant un coin, défaut connu de L5.1) ; imagerie des parents figée
      à morph 0 : alignée, sans décalage. Mesures dans **Mesures** (`morph-*`).
- [x] **L5.3** Ombres du relief (cartes d'horizon ou ray marching sur la carte d'altitude) +
      `CSMShadowNode` pour l'avion et le terrain proche.
      Fait : **ray marching sur une carte d'altitude** (`js/terrain/TerrainShadow.js`), sans
      `CSMShadowNode` (voir Décisions). Deux cartes centrées sous la caméra (30 km en 2048², 240 km en
      1024², `TERRAIN_SHADOW_CASCADES`) : le terrain affiché est dessiné vu de dessus (caméra
      orthographique, matériau de remplacement qui reprend le `positionNode` des tuiles, donc le
      relief déplacé et en cours de morph) en altitude vraie (courbure retirée), puis chaque texel
      marche vers la lumière (128 pas géométriques jusqu'à 100 km, la carte fine lit la grossière
      au-delà de ses bords) et garde la hauteur sous laquelle un point est à l'ombre (le plus haut
      relief rencontré, abaissé de la montée du rayon et de la courbure d²/2R) et la distance de ce
      relief. Un récepteur (terrain, avion) compare son altitude vraie à cette hauteur, bord adouci
      sur le disque solaire vu depuis le relief (0,27°, un texel au moins) : une lecture de texture
      par carte. Redessin quand la caméra a parcouru 15 % de la carte, quand la lumière a tourné de
      0,1°, ou quand les tuiles affichées ont changé (1 s / 4 s d'écart au moins, jusqu'à la fin de
      leur morph) ; étalé sur plusieurs frames (carte d'altitude dans une frame, puis la marche par
      tranches de lignes dans une seconde carte d'ombre, lue une fois complète). Ombre de la lune la
      nuit, élévation bornée à 0,6°. **Ombre de l'avion** (`js/aircraft/AircraftShadow.js`) : un
      `ShadowNode` de three sur une lumière fictive dont la caméra d'ombre 2048² est ajustée autour
      de l'avion le long de la lumière ; seul l'avion y est dessiné (calque `SHADOW_CASTER_LAYER`) ;
      l'ombre s'efface vers le bout de l'ombre pure (≈ 1,6 km : au-delà l'avion cache trop peu du
      disque solaire). Les trois facteurs (nuages, relief, avion) multiplient la lumière directe
      (`AtmosphericSky._updateShadowNode`). Réglage « Shadows » (onglet Graphics, section Light),
      coupé dans le preset Low. Vérifié : carte d'altitude contre `groundHeight` (écart médian 0,2 m,
      deux cartes) ; vues 4 et 6 (soleil bas) nettement plus lisibles, sans acné ; ombre de l'avion
      nette à 15 m du sol, auto-ombrage aile/fuselage propre. Trouvé : un redessin attendant une
      durée fixe laissait la carte large vide (dessinée avant l'arrivée des tuiles) ; une seule
      frame pour la carte fine coûtait ≈ 9 ms (mesure GPU au repos, surestimée).
- [-] **L5.4** Occlusion ambiante (`GTAONode`) : écartée (voir Décisions). Essai : `ao()` de three sur
      la profondeur de la passe de scène (normales reconstruites), demi-résolution, filtrage temporel,
      appliquée à la couleur de scène avant l'atmosphère. Rayon 1,5 m : seuls les creux de l'avion
      foncent un peu, +1,0 à +1,2 ms (vues 2, 4, 6 : 3,90 / 3,85 / 3,97 → 4,96 / 4,83 / 5,14 ms) ;
      rayon 30 m : fonds de vallée à peine plus sombres, +0,6 à +1,7 ms.
- [-] **L5.5** Neutralisation de l'éclairage incrusté dans l'imagerie satellite (abandonnée, voir
      Décisions).
- [ ] **L5.6** Détail procédural : occupation du sol (ESA WorldCover), roche triplanaire sur les
      pentes, neige selon altitude/pente, textures de détail selon la distance. Reportée à la
      clôture du lot 5 (source d'occupation du sol à choisir avec l'utilisateur).
- [ ] **L5.7** Eau : masque (OSM/JRC), matériau Fresnel + reflet du ciel + scintillement solaire,
      vagues FFT en compute, `SSRNode` sur les lacs. Reportée à la clôture du lot 5 (source du
      masque d'eau à choisir avec l'utilisateur).
- [x] **L5.8** (ajoutée à la demande de l'utilisateur) Refonte du mode « Contour lines »
      (`textureMode=elevation`), jugé peu moderne. Quatre styles proposés sur planches (carte topo,
      tactique, maquette, isobandes), puis six coloris du style tactique, puis l'affinage avec la
      distance ; choix de l'utilisateur : **tactique, coloris « phosphore »**, utile plus tard aux
      missions. `js/terrain/ContourMap.js`, réglages `CONTOUR_*` dans `js/constants/terrain.js` : sol
      vert très sombre éclairé comme la scène, courbes émissives `#9dff3a` tous les 50 / 250 / 1 000 m
      (épaisseur et intensité croissantes), à l'altitude vraie (le terrain est abaissé de la courbure
      autour de la caméra : l'ancien mode décalait les courbes de ≈ 30 m à 20 km), trait d'épaisseur
      constante à l'écran jusqu'à 4 km puis inversement proportionnelle à la distance, plancher 40 %
      (un trait sous le pixel garde un pixel et s'atténue d'autant), courbes fines effacées quand elles
      se serrent à moins de 10 px. Luminance des traits 0,08 unité de scène (au-delà, AgX les blanchit
      et les coloris se confondent), multipliée par la pré-exposition de nuit comme les villes : la
      nuit, seules les courbes restent visibles. Mode radar vérifié. Reste possible : atténuer la brume
      sur le sol sombre (sol gris-bleu de jour).
- [x] **L5.9** Normales par pixel depuis la carte d'altitude 256 px complète (reste de L5.1) : texture
      de normales RG8 avec mipmaps calculée au chargement (dans le worker), normales en mètres Mercator
      ramenées dans l'espace local de la tuile dans le shader (taille Mercator de la tuile en uniforme
      par objet) ; gain attendu surtout sur les reliefs lointains (maille de sommets ≈ 4 px de la source).
      Fait : carte de normales 256² par tuile (`NORMAL_MAP_SIZE`), calculée dans le worker
      (`heights.buildNormals`) par différences centrées sur une grille d'altitudes aux centres des
      texels (un texel de marge), lue dans la même fonction d'altitude que la géométrie : les normales
      de tuiles voisines se raccordent sans couture. Vecteurs unitaires x est, y nord, z haut, axes
      horizontaux en mètres Mercator, stockés en `rg8snorm` avec leurs mipmaps (moyenne 2 × 2
      renormalisée, calculées dans le worker : un format snorm n'est pas rendu par WebGPU, three ne
      peut pas générer ses mipmaps), filtrage anisotrope comme l'imagerie. Dans le shader de
      fragments, la normale est mélangée avec celle du parent pendant le morph (même quart que
      l'imagerie) puis passée en monde sans uniforme par tuile : l'espace « mètres Mercator » est
      commun à toutes les tuiles, seule l'échelle horizontale de la carte (`setTerrainHorizontalScale`)
      et sa rotation interviennent. Normales par sommet supprimées (quatre lectures de moins par
      sommet). Corrigé en passant : les textures d'altitude des tuiles n'étaient jamais libérées
      (`TerrariumShaderLoader.unload`) ; nombre de textures borné après deux tours des vues. Coût GPU
      des vues inchangé, p1 en vol en hausse (`pixel-normals-*`). Rendu : ravines et arêtes des
      versants visibles là où la grille les lissait. Corrigé ensuite : sur les tuiles fines (z13 et
      plus) les différences sur un pixel source dessinaient en stries les marches d'un mètre de
      l'altitude (SRTM en mètres entiers, rééchantillonné au-delà de ses 30 m) ; elles portent
      désormais sur au moins 25 m vrais de part et d'autre (`NORMAL_BASELINE`, latitude comprise),
      les sources lues par ces échantillons entrant dans `sourceRanges`. Stries disparues, détail
      lointain intact (`pixel-normals-2`).

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
| 2026-11-24 | L3 atmosphère, uniformes par objet (CPU de rendu méd. 3,7 ms contre 2,6) | Vol par défaut | 128 s | 116,0 | 90,9 | 55,6 | 4,8 (6,1) | 4 / 0 | 2,11 M | 552 |
| 2026-11-24 | L3 atmosphère, uniformes par objet (CPU de rendu méd. 4,6 ms contre 3,4) | Plan 1 (basse alt.) | 94 s | 111,2 | 69,9 | 53,5 | 5,7 (6,5) | 2 / 0 | 2,66 M | 664 |
| 2026-11-24 | L3 atmosphère, uniformes dans le groupe `render` (CPU méd. 3,4 ms) | Vol par défaut | 128 s | 118,7 | 103,1 | 59,2 | 4,8 (6,4) | 4 / 0 | 2,12 M | 552 |
| 2026-11-24 | L3 atmosphère, uniformes dans le groupe `render` (CPU méd. 4,1 ms) | Plan 1 (basse alt.) | 94 s | 118,0 | 76,9 | 57,1 | 5,9 (6,8) | 2 / 0 | 2,67 M | 664 |
| 2026-11-24 | L3 nuit, feux de l'avion, villes | Vol par défaut | 128 s | 118,4 | 101,0 | 58,5 | 5,2 (6,5) | 2 / 0 | 2,14 M | 567 |
| 2026-11-24 | L3 nuit, feux de l'avion, villes (CPU méd. 4,6 ms), capture 1 | Plan 1 (basse alt.) | 94 s | 117,0 | 75,8 | 54,6 | 6,2 (6,8) | 2 / 0 | 2,69 M | 679 |
| 2026-11-24 | L3 nuit, feux de l'avion, villes, capture 2 | Plan 1 (basse alt.) | 94 s | 116,8 | 74,6 | 55,2 | 6,2 (6,8) | 3 / 0 | 2,69 M | 679 |
| 2026-11-24 | L3 feux instanciés (4 draw calls) | Vol par défaut | 128 s | 118,6 | 102,0 | 58,8 | 5,2 (6,5) | 0 / 0 | 2,14 M | 558 |
| 2026-11-24 | L3 feux instanciés, capture 1 | Plan 1 (basse alt.) | 94 s | 115,8 | 71,4 | 52,6 | 6,5 (7,5) | 4 / 0 | 2,69 M | 670 |
| 2026-11-24 | L3 feux instanciés, capture 2 | Plan 1 (basse alt.) | 94 s | 117,2 | 76,3 | 55,2 | 6,2 (6,8) | 0 / 0 | 2,69 M | 670 |
| 2026-11-24 | L3 sans fond de tuile three-tile (CPU de rendu 2,8 ms contre 3,8) | Vol par défaut | 128 s | 119,3 | 108,7 | 63,7 | 4,6 (6,3) | 0 / 0 | 1,11 M | 316 |
| 2026-11-24 | L3 sans fond de tuile three-tile, capture 1 | Plan 1 (basse alt.) | 94 s | 118,7 | 98,0 | 58,1 | 6,5 (7,5) | 0 / 0 | 1,38 M | 372 |
| 2026-11-24 | L3 sans fond de tuile three-tile, capture 2 | Plan 1 (basse alt.) | 94 s | 119,4 | 104,2 | 62,1 | 6,0 (6,6) | 0 / 0 | 1,38 M | 372 |
| 2026-11-24 | L3 tuiles opaques | Vol par défaut | 128 s | 119,4 | 108,7 | 63,7 | 4,3 (6,4) | 0 / 0 | 1,11 M | 316 |
| 2026-11-24 | L3 tuiles opaques, capture 1 | Plan 1 (basse alt.) | 94 s | 119,5 | 105,3 | 63,7 | 4,8 (6,5) | 1 / 0 | 1,38 M | 372 |
| 2026-11-24 | L3 tuiles opaques, capture 2 | Plan 1 (basse alt.) | 94 s | 119,5 | 105,3 | 62,5 | 4,9 (6,5) | 0 / 0 | 1,38 M | 372 |
| 2026-11-24 | **Clôture du lot 3** (preset High) | Vol par défaut | 128 s | 119,3 | 108,7 | 63,3 | 4,3 (6,3) | 0 / 0 | 1,11 M | 316 |
| 2026-11-24 | **Clôture du lot 3** (preset High), capture 1 | Plan 1 (basse alt.) | 94 s | 119,2 | 105,3 | 64,1 | 4,8 (6,6) | 1 / 1 | 1,39 M | 372 |
| 2026-11-24 | **Clôture du lot 3** (preset High), capture 2 | Plan 1 (basse alt.) | 94 s | 119,5 | 105,3 | 64,1 | 4,8 (6,5) | 0 / 0 | 1,38 M | 372 |
| 2026-11-26 | **Clôture du lot 4** (preset High, nuages désactivés par défaut) | Vol par défaut | 128 s | 119,3 | 109,9 | 62,9 | 4,4 (6,3) | 1 / 0 | 1,11 M | 316 |
| 2026-11-26 | **Clôture du lot 4** (preset High, nuages désactivés par défaut) | Plan 1 (basse alt.) | 94 s | 119,3 | 105,3 | 59,2 | 4,7 (6,4) | 0 / 0 | 1,38 M | 372 |
| 2026-11-26 | **Clôture du lot 4**, nuages activés (`showClouds=true`) | Vol par défaut | 129 s | 115,4 | 82,6 | 57,1 | 8,1 (9,8) | 3 / 1 | 1,10 M | 320 |
| 2026-11-26 | **Clôture du lot 4**, nuages activés (`showClouds=true`) | Plan 1 (basse alt.) | 94 s | 117,5 | 86,2 | 56,5 | 8,0 (9,6) | 0 / 0 | 1,38 M | 377 |
| 2026-11-26 | Raccord des bords, altitudes calculées sur le thread principal (abandonné) | Vol par défaut | 128 s | 112,1 | 97,1 | 26,3 | 4,6 (6,3) | 186 / 69 | 1,30 M | 316 |
| 2026-11-26 | Raccord des bords, altitudes calculées sur le thread principal (abandonné) | Plan 1 (basse alt.) | 94 s | 108,8 | 79,4 | 24,9 | 4,8 (6,4) | 194 / 50 | 1,57 M | 372 |
| 2026-11-26 | L5.1 raccord des bords, altitudes dans un worker (`terrain-stitch-flight`) | Vol par défaut | 128 s | 119,8 | 107,5 | 80,6 | 4,7 (6,3) | 0 / 0 | 1,30 M | 316 |
| 2026-11-26 | L5.1 raccord des bords, altitudes dans un worker (`terrain-stitch-plan1`) | Plan 1 (basse alt.) | 94 s | 119,8 | 103,1 | 77,5 | 4,8 (6,3) | 0 / 0 | 1,57 M | 372 |
| 2026-11-26 | L5.2 geomorphing du relief (`morph-flight`) | Vol par défaut | 128 s | 119,7 | 107,5 | 85,5 | 4,8 (6,4) | 0 / 0 | 1,37 M | 322 |
| 2026-11-26 | L5.2 geomorphing du relief (`morph-plan1`) | Plan 1 (basse alt.) | 94 s | 119,9 | 104,2 | 84,0 | 4,9 (6,3) | 0 / 0 | 1,65 M | 387 |
| 2026-11-26 | L5.2 relief + fondu de l'imagerie (`morph-fade-flight`) | Vol par défaut | 128 s | 119,6 | 105,3 | 83,3 | 5,0 (6,5) | 0 / 0 | 1,37 M | 322 |
| 2026-11-26 | L5.2 relief + fondu de l'imagerie (`morph-fade-plan1`) | Plan 1 (basse alt.) | 94 s | 119,9 | 103,1 | 82,0 | 4,8 (6,1) | 0 / 0 | 1,65 M | 387 |
| 2026-11-26 | L5.3 ombres du relief, redessin en une frame (`terrain-shadow-flight`) | Vol par défaut | 128 s | 119,4 | 104,2 | 80,6 | 4,9 (6,4) | 0 / 0 | 1,37 M | 322 |
| 2026-11-26 | L5.3 ombres du relief, redessin en une frame (`terrain-shadow-plan1`) | Plan 1 (basse alt.) | 94 s | 119,7 | 101,0 | 80,0 | 4,9 (6,1) | 0 / 0 | 1,65 M | 387 |
| 2026-11-26 | L5.3 ombres du relief, marche étalée (`terrain-shadow-flight-2`) | Vol par défaut | 128 s | 119,4 | 104,2 | 81,3 | 5,1 (7,0) | 1 / 0 | 1,37 M | 322 |
| 2026-11-26 | L5.3 ombres du relief, marche étalée (`terrain-shadow-plan1-2`) | Plan 1 (basse alt.) | 94 s | 119,8 | 101,0 | 81,3 | 4,9 (6,7) | 0 / 0 | 1,65 M | 387 |
| 2026-11-26 | L5.3 + ombre de l'avion, scène entière dans la passe d'ombre (`shadows-plan1`) | Plan 1 (basse alt.) | 94 s | 119,4 | 99,0 | 76,9 | 7,9 (9,5) | 0 / 0 | 1,70 M | 440 |
| 2026-11-26 | L5.3 réglage « Shadows » coupé (comparaison) | Plan 1 (basse alt.) | 94 s | 119,8 | 103,1 | 82,6 | 4,9 (6,2) | 0 / 0 | 1,65 M | 387 |
| 2026-11-26 | **L5.3 relief + avion** (`shadows-flight-2`) | Vol par défaut | 128 s | 119,3 | 103,1 | 80,0 | 8,4 (9,5) | 0 / 0 | 1,41 M | 375 |
| 2026-11-26 | **L5.3 relief + avion** (`shadows-plan1-2`) | Plan 1 (basse alt.) | 94 s | 119,7 | 100,0 | 79,4 | 7,9 (9,4) | 0 / 0 | 1,70 M | 440 |
| 2026-11-26 | L5.9 normales par pixel (`pixel-normals-flight`) | Vol par défaut | 128 s | 119,2 | 101,0 | 86,2 | 8,6 (9,6) | 0 / 0 | 1,41 M | 375 |
| 2026-11-26 | L5.9 normales par pixel (`pixel-normals-plan1`) | Plan 1 (basse alt.) | 94 s | 119,4 | 99,0 | 87,0 | 8,4 (9,8) | 0 / 0 | 1,70 M | 440 |
| 2026-11-26 | **Clôture du lot 5** (preset High) (`lot5-flight`) | Vol par défaut | 128 s | 119,3 | 102,0 | 87,7 | 8,5 (9,7) | 0 / 0 | 1,41 M | 375 |
| 2026-11-26 | **Clôture du lot 5** (preset High) (`lot5-plan1`) | Plan 1 (basse alt.) | 94 s | 119,5 | 99,0 | 87,7 | 8,4 (9,8) | 0 / 0 | 1,70 M | 440 |
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
| 2026-11-24 | **Pleine résolution** — L3 atmosphère, perspective aérienne par pixel (visibilité 220 km) | 4,78 | 6,13 | 5,85 | 5,47 | 5,94 | 5,78 |
| 2026-11-24 | **Pleine résolution** — L3 atmosphère, volume de perspective aérienne | 3,96 | 6,22 | 5,17 | 4,41 | 4,18 | 4,37 |
| 2026-11-24 | **Pleine résolution** — L3 nuit, feux de l'avion, villes (jour) | 4,93 | 6,28 | 5,52 | 4,89 | 4,63 | 4,77 |
| 2026-11-24 | **Pleine résolution** — L3 sans fond de tuile three-tile | 4,23 | 5,65 | 5,53 | 4,74 | 4,43 | 4,68 |
| 2026-11-24 | **Pleine résolution** — L3 tuiles opaques | 3,46 | 3,44 | 3,94 | 3,88 | 4,35 | 4,00 |
| 2026-11-24 | **Pleine résolution** — **Clôture du lot 3** (courbure, sol lointain ; seconde capture) | 3,44 | 3,43 | 3,49 | 3,40 | 3,80 | 3,48 |
| 2026-11-26 | **Pleine résolution** — **Clôture du lot 4** (nuages sur la vue 5 seule, brume de chaleur) | 3,61 | 3,61 | 3,69 | 4,06 | 7,55 | 3,85 |
| 2026-11-24 | L3 sans fond de tuile — draw calls (contre 549 / 657 / 663 / 603 / 631 / 603) | 307 | 361 | 364 | 334 | 348 | 334 |
| 2026-11-24 | L2.7 Low et Medium (LODThreshold 0,9) — draw calls / triangles | 382 / 1,26 M | 412 / 1,53 M | 454 / 1,69 M | 388 / 1,30 M | 384 / 1,21 M | 382 / 1,26 M |
| 2026-11-24 | L2.7 Ultra 1,4 — draw calls / triangles | 712 / 2,66 M | 790 / 3,36 M | 820 / 3,45 M | 730 / 2,77 M | 768 / 2,78 M | 724 / 2,69 M |
| 2026-11-26 | **Pleine résolution** — L4 nuages, rognage élargi et sans poudre (`clouds-3`) | 3,61 | 3,77 | 3,78 | 3,73 | 6,80 | 3,80 |
| 2026-11-26 | **Pleine résolution** — L4 cirrus fibreux (`clouds-4`) | 3,54 | 3,97 | 3,83 | 3,75 | 6,99 | 3,69 |
| 2026-11-26 | **Pleine résolution** — L4 marche stratifiée (`clouds-5`) | 3,55 | 3,55 | 4,06 | 3,50 | 7,13 | 4,08 |
| 2026-11-26 | **Pleine résolution** — L4 ombres des nuages (`clouds-6`) | 3,60 | 3,60 | 3,71 | 3,74 | 7,51 | 3,82 |
| 2026-11-26 | **Pleine résolution** — L5.1 raccord, grilles 64 cellules dès z8 (`terrain-stitch`, écarté) | 4,16 | 3,80 | 4,36 | 3,86 | 7,79 | 4,20 |
| 2026-11-26 | **Pleine résolution** — L5.1 raccord, grilles 64 cellules dès z10 (`terrain-stitch-2`) | 4,12 | 3,72 | 3,82 | 3,81 | 7,63 | 3,85 |
| 2026-11-26 | L5.1 raccord — triangles (contre 1,01 / 1,34 / 1,35 / 1,06 / 1,14 / 1,07 M au lot 4) | 1,17 M | 1,51 M | 1,54 M | 1,24 M | 1,36 M | 1,27 M |
| 2026-11-26 | **Pleine résolution** — L5.2 geomorphing du relief (`morph-3`) | 3,69 | 4,22 | 3,86 | 3,68 | 7,12 | 3,78 |
| 2026-11-26 | **Pleine résolution** — L5.2 relief + fondu de l'imagerie (`morph-fade-1`) | 3,70 | 3,79 | 3,88 | 3,87 | 7,97 | 4,27 |
| 2026-11-26 | **Pleine résolution** — L5.3 ombres du relief (`terrain-shadow-1`) | 3,75 | 3,85 | 3,96 | 3,90 | 7,82 | 4,32 |
| 2026-11-26 | **Pleine résolution** — L5.3 relief + avion (`terrain-shadow-2`) | 3,86 | 4,01 | 4,10 | 4,01 | 8,06 | 4,11 |
| 2026-11-26 | **Pleine résolution** — L5.9 normales par pixel (`pixel-normals-1`) | 3,82 | 3,93 | 4,02 | 4,25 | 8,06 | 4,38 |
| 2026-11-26 | **Pleine résolution** — L5.9 normales sur 25 m au moins (`pixel-normals-2`) | 3,83 | 3,96 | 4,09 | 4,04 | 8,03 | 4,02 |
| 2026-11-26 | **Pleine résolution** — **Clôture du lot 5** (`lot5`) | 3,85 | 4,37 | 4,00 | 3,79 | 7,67 | 4,37 |
| 2026-11-26 | **Clôture du lot 5** — draw calls / triangles | 361 / 1,21 M | 415 / 1,55 M | 421 / 1,59 M | 388 / 1,28 M | 404 / 1,41 M | 388 / 1,32 M |

Raccord des bords (L5.1) : captures alternées contre `main` (worktree, port 3001), vues 1 et 6, deux
séries : `main` 3,62 / 3,98 ms (vue 1) et 4,15 / 3,66 ms (vue 6), raccord 3,64 / 3,64 et 4,16 / 4,17 ms :
aucune différence mesurable malgré +16 à +18 % de triangles ; l'écart de la vue 1 contre la clôture
du lot 4 (+0,5 ms) est celui d'une série à l'autre. Grilles de 64 cellules dès z8 : +30 à +45 % de
triangles, écartées.

Geomorphing (L5.2) : vues identiques une fois les transitions finies (draw calls et triangles égaux à
`terrain-stitch-2`, 0,03 % de pixels différents : bruit du TAA). Coût du fondu de l'imagerie (une
lecture de texture de plus par pixel de terrain) : captures alternées des vues 1 et 6 avec et sans
fondu (bascule temporaire par l'URL), quatre séries : avec 3,83 / 3,89, 4,67 / 4,57 (pic thermique),
3,71 / 3,79, 3,71 / 3,80 ms ; sans 3,70 / 4,18, 3,81 / 3,81, 3,75 / 4,08, 3,70 / 3,75 ms : aucune
différence mesurable. Une seconde capture complète (`morph-fade-2`, 4,19 ms en vue 1) a été prise
machine chaude, à ignorer. En vol, +5 % de triangles : les tuiles fines restent affichées 0,75 s le
temps de leur fusion.

Ombres (L5.3) : coût permanent des récepteurs (deux lectures de texture par pixel éclairé) dans le
bruit ; l'ombre de l'avion ajoute ≈ 0,1 à 0,2 ms (passe d'ombre 2048², 53 draw calls). Redessin d'une
carte (mesuré GPU au repos, donc surestimé) : carte fine ≈ 2–4 ms d'altitude + 4–6 ms de marche,
carte large ≈ 4 + 0,7 ms ; la marche de la carte fine est étalée sur 4 frames. En vol, la colonne GPU
passe de 4,9 à 7,9–8,4 ms avec l'ombre de l'avion : artefact de mesure (le minuteur prend l'écart
entre le début de la première passe et la fin de la dernière ; la passe d'ombre est soumise avant
l'encodage de la passe de scène, l'écart inclut ce temps CPU). Coût réel en vol : CPU de la passe
d'ombre, qui parcourait toute la scène (p1 76,9) ; avec le calque des projeteurs, p1 79,4 contre 82,6
ombres coupées.

Les lignes « GPU ms méd. » antérieures à L2.9 ne sont pas exploitables (somme des passes, fréquence
du GPU fixée par le régulateur). Les lignes « coût GPU » de L2.9 à L2.3 ont été mesurées à 1028×645
(résolution abaissée par l'ancienne qualité adaptative, voir Outillage) : comparables entre elles
pour la géométrie seulement. Le coût GPU réel d'une frame est ≈ 3–5 ms à 4112×2580 sur M4 Max (lignes
« Pleine résolution »), loin du budget de 16,6 ms.

Bilan du lot 2 (état de clôture contre lot 1 + altitude CPU) : vol par défaut p5 73,0 → 106,4 et
p1 33,6 → 61,3 (frames > 33 ms 50 → 4), plan 1 p5 62,5 → 81,3 et p1 43,1 → 61,7 ; coût GPU d'une frame
3,1 à 5,1 ms à 4112×2580, loin du budget de 16,6 ms. Critère de sortie respecté (p1 en hausse).

Bilan du lot 5 (état de clôture, `benchmarks/render/lot5*`) : tuiles raccordées sans marche et
altitudes calculées dans un worker, transitions de niveau de détail en fondu (relief et imagerie),
ombres du relief (vallées à l'ombre au soleil bas, avion compris) et de l'avion, normales à la
résolution de la source, mode courbes de niveau refait. Vues : 3,8 à 4,4 ms (lot 4 : 3,6 à 4,1 ;
écarts de série ±0,4 ms ; les ombres ajoutent ≈ 0,1 à 0,2 ms, l'avion dessiné dans sa carte d'ombre
53 draw calls), triangles +16 à +22 % (grilles emboîtées de L5.1). Vols : p1 62,9 → 87,7 (vol par
défaut) et 59,2 → 87,7 (plan 1), sans frame lente : le calcul des altitudes sorti du thread
principal (L5.1) compte pour l'essentiel. Critère de sortie respecté (p1 en hausse).

Constats visuels après le lot 5 (`docs/screenshots/render/lot5/` : 6 vues, courbes de niveau sur la
vue 4, ombre de l'avion à 15 m du sol près d'Annecy) :
- Relief continu, sans fissures ni sauts aux changements de niveau ; versants plus détaillés.
- Au soleil bas (vues 4 et 6) les vallées tombent dans l'ombre des sommets, ce qui rend le massif
  lisible ; l'avion s'assombrit dans l'ombre du relief et porte la sienne.
- Restent : zones sombres de l'imagerie (ombres incrustées, L5.5 abandonnée), lacs plats sans
  reflet (L5.7), premier plan flou à basse altitude (imagerie z15), pas de rayons crépusculaires
  derrière le relief (les ombres du terrain ne touchent pas encore l'air).

Bilan du lot 4 (état de clôture, `benchmarks/render/lot4*`) : nuages volumétriques (cumulus, nuages
moyens et cirrus fibreux) qu'on traverse, ombres sur le sol et l'avion, lumière des nuages sur l'avion,
rayons crépusculaires, reflet d'objectif en option. Vues sans nuages : 3,6 à 4,1 ms (lot 3 : 3,4 à
3,8 ; la brume de chaleur des moteurs, ajoutée entre-temps au preset High, compte pour ≈ 0,1 ms, et
les écarts de série atteignent ±0,4 ms). Vue 5, au-dessus des nuages : 7,55 ms (3,80 au lot 3,
nappe plane). Vols nuages désactivés (réglage par défaut) : vol par défaut p1 63,3 → 62,9, plan 1
p1 64,1 → 59,2 (−8 %, la flamme de postcombustion du lot G2 tout le long du plan 1 compte : 60,2 en
`g2-haze-flight`). Nuages activés : p1 57,1 et 56,5 (−9 % et −5 % contre les mêmes vols sans nuages),
GPU médian ≈ 8 ms à 120 Hz. Critère de sortie respecté (p1 à moins de 10 %).

Constats visuels après le lot 4 (`docs/screenshots/render/lot4/`, preset High, 6 vues ; vue 5 dans
un nuage, à son entrée et sous un ciel couvert à 90 % ; vue 6 sous les nuages, rayons crépusculaires) :
- Nuages : volume, bords érodés, cirrus en fibres, fondu dans la brume au loin ; dans un nuage, un
  brouillard blanchâtre où l'avion reste visible, sans taches à l'entrée en vol rapide.
- Ombres des nuages sur le relief et sur l'avion, et dans l'air : l'air à l'ombre perd 70 % de sa
  lumière diffusée, d'où des faisceaux sous les nuages face au soleil.
- Restent : grain fin du brouillard proche en mouvement, pas de vent réglable ni de météo variable
  (une seule carte météo répétée tous les 100 km), pas de nuages en WebGL2, pas de rayons
  derrière le relief (pas d'ombres du terrain : lot 5).

Bilan du lot 3 (état de clôture contre lot 2) : atmosphère physique, heure du jour, nuit et feux de
l'avion pour un coût GPU par vue de 3,4 à 3,8 ms à 4112×2580 (lot 2 : 3,1 à 5,1), grâce aux tuiles
opaques et sans fond ; vol par défaut p5 106,4 → 108,7 et p1 61,3 → 63,3, plan 1 p5 81,3 → 105,3 et
p1 61,7 → 64,1, draw calls en vol divisés par 1,8. Critère de sortie respecté (p1 en hausse).

Constats visuels après le lot 3 (`docs/screenshots/render/lot3/`, preset High, 6 vues et deux vues de
nuit) :
- Ciel, perspective aérienne et lumière du ciel issus des mêmes tables : profondeur au loin, contre-jour
  crédible (vues 4 et 6), vallées voilées par les aérosols, coucher de soleil rougi.
- Horizon : relief lointain abaissé par la courbure, fondu dans la brume, sans trait ni bande.
- Nuit : étoiles, lune et clair de lune bleuté sur la neige (`night-moon-view-4`), villes en points
  orangés sur un sol sombre de près (`night-town-view-3`), feux et postcombustion de l'avion.
- Restent : terrain proche un peu voilé vu d'altitude, image un peu terne (étalonnage L6.3), nappe
  nuageuse plane (lot 4), pas d'ombres portées (lot 5), lumières des villes en semis aléatoire (pas
  de rues), donnée Black Marble grossière.

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
| 2026-11-24 | Lumière du ciel | Diffuse évaluée en chaque point par `AtmosphereLight` (table d'irradiance) ; PMREM du ciel réduite aux reflets pour tous les matériaux PBR (`ReflectionEnvironmentNode`) | Choix de l'utilisateur sur captures (option « B ») : ombres des versants plus contrastées ; la PMREM est le ciel vu depuis la caméra et ignore l'altitude de la surface. L'avion garde ses reflets sans recevoir deux fois la lumière du ciel |
| 2026-11-24 | Densité des aérosols | Réglage « Visibility » en km (visibilité météorologique au niveau de la mer, 10–280 km, défaut 220 km) plutôt qu'une turbidité | Grandeur parlante pour un pilote (METAR) ; l'extinction de Mie s'en déduit (Koschmieder, moins l'extinction de Rayleigh) ; le défaut redonne les aérosols de Hillaire que l'utilisateur a validés |
| 2026-11-24 | Perspective aérienne | Volume de froxels 128 × 64 × 64 calculé par compute (WebGPU), évaluation par pixel en WebGL2 | Images identiques (PSNR ≥ 47 dB même à 20 km de visibilité face au soleil) pour 0,6 à 1,4 ms de moins par vue ; la bibliothèque n'a pas de volume, il est construit avec ses fonctions (`getIndirectLuminanceToPoint`) |
| 2026-11-24 | Heure du jour | Temps solaire local à la position de l'avion, date en jour de l'année, formules NOAA sans dépendance | Midi = soleil au plus haut, compréhensible sans fuseau horaire ; voler vers l'est ne décale pas l'heure (écart avec un temps UTC fixe : 4 min par degré de longitude, négligeable sur un vol) ; `astronomy-engine` inutile pour le soleil, à reconsidérer pour la lune (L3.6) |
| 2026-11-24 | Uniformes de l'atmosphère | Groupe `render` de three pour les uniformes du contexte takram (et ceux des aérosols) | Dans le groupe par objet (défaut de `uniform()`), les matrices ECEF changées à chaque frame en vol étaient comparées et téléversées à chaque draw call : p1 −10 à −13 % en vol. Après : p1 −3 et −7 % (critère de 10 % respecté) |
| 2026-11-24 | Exposition de nuit | Pré-exposition calculée sur le CPU depuis l'éclairement du sol (soleil, crépuscule, lune, ciel nocturne), 25 % de la baisse visible, plutôt que l'exposition automatique seule | Le sol au clair de lune (10⁻⁶ du plein jour) tombe sous la précision du HalfFloat : l'exposition doit précéder les cibles HDR ; un calcul déterministe n'a ni latence ni boucle de rétroaction, et les vues de jour restent identiques |
| 2026-11-24 | Sources lumineuses de nuit | Racine de la pré-exposition pour les sources ponctuelles (feux, flammes), pré-exposition complète pour les sources étendues (villes) ; vision nocturne épargnant les pixels ≥ 2–10 × la luminance d'adaptation | Avec la pré-exposition complète, un feu de 2 500 cd ou une postcombustion noie l'image d'éblouissement ; l'éclairage public, quelques cd/m², reste physique et coloré |
| 2026-11-24 | Lumières des villes | Mosaïque régionale Black Marble 2016 (GIBS, zoom 8) dans une seule texture lue par un nœud émissif partagé, plutôt qu'une seconde source d'imagerie de three-tile | three-tile superpose ses sources en matériaux multiples : un draw call de plus par tuile, alors que la soumission CPU limite déjà ; la donnée est au mieux à ≈ 450 m/pixel (zoom 8 maximum), d'où le motif procédural de près |
| 2026-11-24 | Halos et flammes | Passe dédiée (calque, demi-résolution) ajoutée après le TAAU, test d'occultation dans le shader | Additifs et transparents dans la passe de scène, ils prendraient la perspective aérienne du terrain derrière eux et le TAAU les traînerait (vitesses du fond) |
| 2026-11-24 | Régression du p1 du plan 1 (−12 % après la nuit) | Réduire le coût plutôt que l'accepter ou réserver des effets aux presets élevés (choix de l'utilisateur) ; cause trouvée dans three-tile, pas dans la nuit | three-tile dessinait chaque tuile deux fois (fond uni à plat au niveau de la mer, invisible sous l'imagerie) : 251 draw calls inutiles en vol, chacun alourdi par l'éclairage de l'atmosphère. Fond masqué (`backgroundMaterial.visible = false`) : CPU de rendu en vol 3,84 → 2,84 ms (`main` : 2,71) |
| 2026-11-24 | Transparence des tuiles | Sources d'imagerie de three-tile déclarées opaques (`transparent: false`, `true` par défaut dans three-tile) | Tuiles dans la liste transparente : triées du loin vers le près, sans rejet précoce par la profondeur, le shader du terrain tournait sur tous les versants cachés. Images identiques (PSNR ≥ 45 dB), coût GPU −0,1 à −2,2 ms selon la vue |
| 2026-11-24 | Courbure de la Terre | Terrain abaissé de d²/2R autour de la caméra dans le nuanceur de sommets (suggestion de l'utilisateur), positions horizontales inchangées | La carte plate ne rejoignait pas l'horizon de la sphère de l'atmosphère et plaçait les sommets lointains trop haut (3 km à 200 km). Repère local recalé sous la caméra : rien ne change près de l'avion (altitude sol, collisions) ; écart corde/arc 4 m à 200 km ; vecteurs de mouvement du TAAU sans la variation de la courbure (0,07 m à 100 km par frame à 560 m/s, sous le pixel) ; la sphère englobante de three, déjà démesurée, ne coupe aucune tuile |
| 2026-11-24 | Sol au-delà des tuiles | Sol diffus de l'ellipsoïde calculé dans la passe du ciel (éclairement et diffusion jusqu'au point de takram) plutôt que la luminance du ciel de takram sous l'horizon | Sous l'horizon, takram ne rend que la lumière diffusée le long du rayon, avec un saut de sa table de diffusion à l'horizon (trait clair) ; un maillage de sol supplémentaire coûterait des draw calls et de la géométrie pour un rendu identique |
| 2026-11-24 | Adaptation aux lumières des villes | Moyenne logarithmique de leur luminance sur la zone en vue, calculée sur le CPU depuis la mosaïque Black Marble, ajoutée à l'éclairement de la pré-exposition | Déterministe comme la pré-exposition (pas de relecture GPU ni de boucle) ; la moyenne arithmétique laissait une ville lointaine assombrir tout un paysage au clair de lune, la moyenne logarithmique (comme l'adaptation de l'œil et le tone mapping de Reinhard) ne compte une ville que si elle remplit la vue |
| 2026-11-25 | Nuages volumétriques | Implémentation propre en TSL, portée du modèle de takram three-clouds 0.7.6 (MIT) | takram three-clouds n'a pas de version WebGPU/TSL (effet `postprocessing` sur le renderer WebGL) ; son modèle (Schneider, Hillaire, Wrenninge) et ses paramètres par défaut sont éprouvés et s'éclairent avec le même contexte d'atmosphère que le reste de la scène |
| 2026-11-26 | Nuages par défaut | Désactivés par défaut (réglage « Clouds »), comme la couche plane avant eux | Choix de l'utilisateur ; ils coûtent ≈ 4 ms GPU sur la vue 5 et 6 de p1 sur le vol par défaut |
| 2026-11-26 | Brouillard des nuages proches | Marché à chaque frame à demi-résolution sur les 200 premiers mètres, lumière lue dans la carte des ombres, plutôt qu'un bloc de marche plus petit dans la couche ou un historique plus long | La reconstruction temporelle ne peut pas suivre un volume qui défile à quelques mètres de la caméra ; marcher 1 pixel sur 4 au lieu de 16 dans la couche quadruplerait le coût de toute la marche, là où le brouillard proche, sans bords nets, se contente de la demi-résolution |
| 2026-11-25 | Repère des nuages | Coquilles sphériques centrées sur le centre de la Terre sous la caméra, coordonnées de texture tirées des x, z de la carte et de l'altitude, origine réduite modulo la répétition sur le CPU | Même courbure que le terrain (abaissé de d²/2R autour de la caméra) ; pas de coutures de projection cube-sphère ; précision des flottants conservée loin de l'origine de la carte |
| 2026-11-25 | Suréchantillonnage temporel des nuages | Un pixel sur 16 marché par frame (Bayer 4×4), reprojection par pixel à la distance de sa scène ou du front des nuages, rejet de l'historique sur la distance de scène, repli pondéré par la ressemblance de profondeur | Comme takram pour le coût (marche à 1/16 des pixels) ; leur vitesse prise au fragment le plus proche d'un voisinage basse résolution laisse des halos aux silhouettes en mouvement, la reprojection à la profondeur pleine résolution de chaque pixel les évite |
| 2026-11-25 | Reconstruction de l'atmosphère en cours de vol | Le TAAU marque ses matériaux internes à recompiler quand la passe d'atmosphère change | `TAAUNode.setup()` leur donne de nouveaux nœuds sans les marquer : couper la brume de distance, la brume de chaleur ou le volume de perspective aérienne depuis le menu ne s'appliquait qu'au rechargement (défaut antérieur, trouvé avec les nuages) |
| 2026-11-26 | Éclairage incrusté dans l'imagerie (L5.5) | Abandonné, aucune correction (choix de l'utilisateur) | Les zones noires des vues 4 et 6 ne viennent pas de tuiles invalides : le cache est sain et les tuiles ESRI retéléchargées sont identiques octet pour octet. Elles viennent des ombres des photos (soleil à ≈ 155°, 50° d'élévation : faces nord-ouest 10 fois plus sombres et bleues, en partie écrasées au noir), de l'absence d'ombres du relief et de lumière renvoyée, et des comblements de lacunes du SRTM dans le MNT Terrarium. Le rééclairage essayé dans le shader (gain par canal tiré de la normale et de la teinte de l'ombre, masque élargi par un mip plus grossier, albédo de repli pour le noir écrasé) laissait des liserés sombres au bord des ombres et des taches dans les forêts : rendu jugé moins bon que l'original |
| 2026-11-26 | Style du mode courbes de niveau (L5.8) | Tactique, coloris phosphore, traits affinés au-delà de 4 km avec plancher à 40 % (choix de l'utilisateur sur planches) | Lisible à l'ombre et la nuit, utile aux missions ; carte topo, maquette et isobandes écartées ; épaisseur constante : plus de notion de profondeur ; affinage dès 2 km : vue haute trop pâle |
| 2026-11-26 | Raccord des bords entre tuiles (L5.1) | Altitude unique échantillonnée par-delà les tuiles, grilles emboîtées, profils d'arête des voisines plus grossières choisis à chaque frame, calcul dans un worker | Exact (au bit près entre voisines de même niveau, sans jonction en T entre niveaux) sans coût GPU mesurable ; calculé sur le thread principal, il faisait tomber le p1 à 25 (3,5 décodages par tuile, 2,2 ms de calcul) ; dans le worker, le p1 monte au-dessus du lot 4 |
| 2026-11-26 | Occlusion ambiante (L5.4) | Écartée, pas de `GTAONode` | En espace écran avec un rayon en mètres, elle ne touche que ce qui est près de la caméra : l'avion (creux à peine plus sombres) ou, avec un grand rayon, les fonds de vallée proches, pour 1 à 1,7 ms, un quart d'une frame ; appliquée à la couleur entière elle assombrirait aussi la lumière directe, et l'appliquer à la seule lumière indirecte demanderait une pré-passe de profondeur et de normales de toute la géométrie, ce qui coûte le plus ici. Pistes si le besoin revient : occlusion du ciel à l'échelle du relief tirée des cartes d'altitude des ombres (L5.3), occlusion précalculée de l'avion avec ses cartes de matériau (L6.1) |
| 2026-11-26 | Ombres du relief et de l'avion (L5.3) | Hauteur d'ombre par ray marching sur une carte d'altitude dessinée vue de dessus (deux cartes), ombre de l'avion par une carte d'ombre ajustée sur lui seul ; pas de `CSMShadowNode` | Des cascades dessinant le terrain depuis le soleil couvriraient mal 100 km de relief au soleil rasant et redessineraient toutes les tuiles à chaque frame ; la hauteur d'ombre est indépendante de l'objet qui la reçoit (terrain et avion lisent la même carte), se redessine rarement et s'étale sur plusieurs frames, et la carte d'altitude réutilise la géométrie affichée (morph et raccords compris). Les cartes d'horizon par texel des tuiles auraient demandé un calcul par tuile et par direction du soleil. L'avion seul justifie une carte d'ombre classique, petite et nette |
| 2026-11-26 | Geomorphing (L5.2) | Dans le temps (0,75 s), fusions différées jusqu'au retour des enfants sur la surface du parent, bords sur le côté le plus grossier, imagerie en fondu | La sélection des niveaux de three-tile dépend de la tuile entière et de l'orientation de la caméra : un morph fonction de la distance (CDLOD) n'aurait pas été terminé au moment du changement ; le temps couvre aussi les changements dus à une rotation. Coût nul sur le GPU, p1 en vol en hausse |
| 2026-11-23 | Vitesse par défaut | 560 m/s | Vitesse réelle de l'ancien défaut (800 unités Mercator/s) : benchmarks comparables à la baseline |

## Journal des sessions

<!-- Entrée la plus récente en haut. -->

### 2026-11-26 (25)
- Fait : L5.2, geomorphing dans le temps (subdivisions et fusions, bords sur le côté le plus
  grossier) et fondu de l'imagerie (validé sur le principe par l'utilisateur, pas encore jugé en
  vol). Corrigé : l'arbre des tuiles mis à jour pendant le rendu (bords périmés une frame).
- Fait (seul, à la demande de l'utilisateur) : L5.3, ombres du relief (cartes d'altitude marchées
  vers la lumière) et de l'avion (carte d'ombre ajustée sur lui), réglage « Shadows ». Pas encore vu
  par l'utilisateur.
- Fait (seul) : L5.9, normales par pixel calculées dans le worker ; corrigé la fuite des textures
  d'altitude des tuiles déchargées, puis les stries des normales sur les tuiles fines.
- Essayé puis écarté : L5.4, `GTAONode` (voir Décisions).
- Lot 5 clôturé à la demande de l'utilisateur (L5.6 et L5.7 reportées) : captures `lot5`, vols
  `lot5-flight` et `lot5-plan1`, captures versionnées `docs/screenshots/render/lot5/`. Branche
  `feat/render-terrain` ni poussée ni fusionnée.
- Outils (scratchpad, non versionnés) : saut du sol d'une frame à l'autre sur 2 500 points par
  `groundHeight` pendant des changements forcés du seuil de LOD, écart entre bords voisins
  reconstruits sur le CPU à chaque frame, morph figé à 0 pour comparer l'imagerie des parents ; accès
  temporaire par `window.__dbg`. Les différences d'images entre frames ne servent à rien ici : le
  bruit du TAA et de l'animation du moteur dépasse le changement de géométrie.

### 2026-11-26 (24)
- Analysé : zones noires dans les massifs (vues 4 et 6). Cache de tuiles sain, causes dans l'imagerie,
  l'éclairage et le MNT (voir Décisions, ligne L5.5).
- Essayé puis annulé : rééclairage de l'imagerie dans le shader ; L5.5 abandonnée par l'utilisateur.
- Lot 5 commencé sur `feat/render-terrain` (depuis `main`), au choix de l'utilisateur.
- Fait : L5.8, refonte du mode courbes de niveau (style tactique phosphore, choisi sur planches).
- Fait : L5.1, raccord exact des bords entre tuiles, altitudes calculées dans un worker (solde aussi
  le reste de L2.6 hors `compileAsync`). Normales par pixel sorties en L5.9.
- Commits : `afcc932` (courbes de niveau), `e5791ce` (raccord des bords), documentation ; branche non
  poussée ni fusionnée.
- Outils (scratchpad, non versionnés) : mesure des écarts le long des arêtes (Playwright, accès
  temporaire au gestionnaire de terrain par `window.__terrain`), vol de 20 s touche W avec compteurs
  de frames lentes, capture de nuit (heure changée après la vue de référence : `--set timeOfDay` est
  écrasé par la vue), planches légendées ouvertes dans Aperçu (`magick -annotate`, police
  `/System/Library/Fonts/Supplemental/Arial.ttf`).
- Prochaine étape : L5.2 (geomorphing), L5.3 (ombres du relief) ou L5.9, au choix de l'utilisateur.

### 2026-11-26 (23)
- Fait : L4.6, traversée des nuages (voir la tâche) : lumière dans un nuage choisie par
  l'utilisateur sur planches, brouillard proche marché à chaque frame, avion visible dans un nuage
  (choix de l'utilisateur), lumière des nuages sur l'avion. Corrigé : canal des cirrus de la carte
  des ombres (alpha forcé à 1). Capture `clouds-7`.
- Outils : vol rejoué à pas de temps fixe avec téléportation de l'avion (`window.__move`), mesure du
  coût GPU dans un nuage par un script Playwright (vue 5, `cloudAltitude` 6000, avion avancé de
  600 m), scripts gardés dans le scratchpad.
- Commits : correctif de la carte des ombres, traversée des nuages, documentation (non poussés).
- Validé en vol par l'utilisateur : au-dessus, en dessous et à travers les nuages.
- Fait ensuite : L4.7, rayons crépusculaires des nuages (intensité choisie sur planche) et reflet
  d'objectif en option (voir la tâche). Captures `clouds-8`, `clouds-8b`.
- Fait ensuite : L4.8 (couche plane retirée, réglage « Cloud cover »), clôture du lot 4 : vols de
  référence nuages désactivés et activés, capture `lot4`, modes SAR et élévation vérifiés, captures
  versionnées `docs/screenshots/render/lot4/`.
- Décidé par l'utilisateur : nuages désactivés par défaut. Lot 4 fusionné dans `main`, poussé par
  l'utilisateur.
- Prochaine étape : G3 ou lot 5 (voir État courant).

### 2026-11-26 (22)
- Mesuré : capture `clouds-3` (état de la session 21) ; une première série à coûts doublés venait
  d'une instance de l'app ouverte en même temps par l'utilisateur.
- Fait : cirrus fibreux (voir L4.3), paramètres choisis avec l'utilisateur sur des planches de la
  vue 5. Capture `clouds-4`, captures alternées contre l'état précédent (worktree supprimé ensuite).
- Corrigé : roulis du contenu des nuages en vol et points sur l'avion dans un nuage (marche
  stratifiée, voir L4.3). Diagnostic : l'utilisateur a volé avec des variantes passées dans l'URL
  (vent coupé, tous les pixels marchés, sans historique, sans détail, pas fins) ; de mon côté, vol
  rejoué à pas de temps fixe (crochet temporaire `window.__advance(n)` dans la boucle de rendu, patch
  gardé dans le scratchpad de la session) pour comparer images en mouvement et images convergées à
  la même pose. Capture `clouds-5`.
- Fait : L4.5, ombres des nuages sur le terrain et sur l'avion (voir la tâche). Capture `clouds-6`.
- Commits : cirrus, marche stratifiée, ombres sur le terrain puis sur l'avion, et leur documentation,
  sur `feat/render-clouds` (non poussée).
- Prochaine étape : L4.6 (traversée des nuages, voir État courant).

### 2026-11-25 (21)
- Corrigé : taches noires après la traversée d'un nuage (NaN de la perspective aérienne à distance
  nulle, gardés pour toujours par l'historique) ; scintillement de la surface des nuages (rognage
  de l'historique, voir L4.4) ; bruit de détail fixe pendant que le vent déplaçait les nuages.
- Réglé avec l'utilisateur (L4.3) : plus de poudre ; lumière du ciel à 0,5 essayée puis refusée
  (dessus des cumulus gris). Rebond du sol écarté.
- Commits : `7c35329`, `f55f231`, `e360847` sur `feat/render-clouds` (non poussée).
- Mesures : scintillement (voir L4.4) ; coût GPU non remesuré (à refaire avant L4.5).
- Prochaine étape : forme des cirrus, puis L4.5 (voir État courant).

### 2026-11-25 (20)
- Lot 4 jusqu'ici commité sur `feat/render-clouds` (correction du TAAU, nuages, documentation).
- Fait : L4.4 (passe temporelle des nuages, voir la tâche). Les vues de référence remettent le vent à
  zéro pour des mesures comparables.
- Mesures : `benchmarks/render/clouds-2` (vues 3,57 / 3,54 / 3,61 / 3,53 / 6,44 / 4,09 ms ; vue 5 sans
  nuages 3,79 ms).
- Prochaine étape : réglage du rendu avec l'utilisateur (voir État courant).

### 2026-11-25 (19)
- `feat/flight-model` (lots G0 à G2) fusionnée dans `main` (avance rapide) et poussée à la demande de
  l'utilisateur ; lot 4 commencé sur `feat/render-clouds`.
- takram three-clouds n'existe qu'en WebGL : modèle porté en TSL (voir **Décisions**).
- Fait : L4.1 ; premières versions de L4.2 (carte météo, couverture, vent) et L4.3 (ray marching,
  éclairage, perspective aérienne). Corrigé au passage : les changements de la passe d'atmosphère après
  la première frame n'atteignaient pas le TAAU.
- Mesures : `benchmarks/render/clouds-1` (vues 3,55 / 3,98 / 3,86 / 3,99 / 8,75 / 3,67 ms ; seule la
  vue 5 a des nuages).
- Prochaine étape : L4.4 (voir État courant).

### 2026-11-24 (18)
- Décision de l'utilisateur sur le p1 du plan 1 : réduire le coût. Profil CPU en vol contre `main`
  (même nombre de draw calls) : le surcoût venait de la mise à jour complète des bindings de chaque
  objet, alourdie par l'éclairage de l'atmosphère (terrain : 11 nœuds `updateBefore` au lieu de 2,
  7 textures au lieu de 4).
- Fait : fond uni de three-tile masqué (deuxième draw call par tuile, invisible) ; sources d'imagerie
  opaques (three-tile les déclare transparentes par défaut) ; interrupteur des feux anticollision
  (demande de l'utilisateur, réglage + touche O). Détails dans **Décisions** et sous L3.8.
- Mesures : draw calls en vol 579 → 326, CPU de rendu 3,84 → 2,84 ms (`main` : 2,71) ; coût GPU des
  vues 3,46 / 3,44 / 3,94 / 3,88 / 4,35 / 4,00 ms (lot 2 : 3,11 / 5,09 / 4,01 / 3,80 / 3,34 / 3,72) ;
  plan 1 p1 63,7 et 62,5, p5 105,3 ; vol par défaut p1 63,7, p5 108,7 (lot 2 : 61,3 et 106,4).
  Images identiques (PSNR ≥ 45 dB), modes `sar` et `elevation` vérifiés.
- Étoiles rendues à chaque frame : < 0,03 ms de CPU au profil, laissées en l'état.
- Ensuite, à la demande de l'utilisateur : L3.9 (courbure de la Terre, suggérée par l'utilisateur, et
  sol lointain sous l'horizon) et L3.10 (adaptation de l'exposition de nuit aux villes en vue). Détails
  sous les tâches et dans **Décisions**.
- Clôture du lot 3 : captures `docs/screenshots/render/lot3/`, mesures « Clôture du lot 3 » (vues 3,40
  à 3,80 ms ; plan 1 p1 64,1 deux fois ; vol par défaut p1 63,3), bilan et constats visuels, lint
  sans erreur ; branche fusionnée dans `main` (avance rapide), poussée par l'utilisateur ; branches
  distantes autres que `main` supprimées à sa demande (lot 3 et Dependabot, PR #6, #8, #9 fermées,
  mises à jour déjà présentes dans `main`) ; worktree `../osf-main` supprimé.
- Prochaine étape : lot 4, L4.1 (voir État courant).

### 2026-11-24 (17)
- Fait : L3.6 (nuit : étoiles, lune et clair de lune, pré-exposition, vision nocturne, lumières des
  villes Black Marble) et, à la demande de l'utilisateur, feux de l'avion et lueur des réacteurs (L3.8).
  Détails sous les tâches, choix dans **Décisions**.
- Mesures : vues de jour inchangées (PSNR ≥ 42 dB, l'écart restant vient de l'intérieur des tuyères
  désormais en métal sombre) ; coût GPU de jour dans le bruit. Vols : défaut p1 58,8 (−4 % contre le
  lot 2), plan 1 p1 ≈ 54 (−12 %) : CPU de rendu +0,5 ms en vol depuis la nuit, à arbitrer.
- Constats visuels : crépuscule et alpenglow, clair de lune désaturé et bleuté, nuit sans lune où la
  neige et les crêtes se devinent, villes orangées vues d'altitude ; feux à éclats et postcombustion
  convaincants de jour comme de nuit. Restent : villes survolées de près sans lune trop claires,
  donnée Black Marble grossière.
- Environnement : le proxy sert `nightlights` (NASA GIBS) ; le serveur de l'utilisateur sur le port
  3000 doit être redémarré. Worktree temporaire `../osf-prev` (état d'avant la nuit, `d5b8ee4`) supprimé.

### 2026-11-24 (16)
- Fait : « Visibility » (aérosols, L3.3) ; volume de perspective aérienne (L3.2) ; heure du jour, date
  et vitesse du temps (L3.5) ; modes `sar` et `elevation` vérifiés (L3.7) ; uniformes de l'atmosphère
  dans le groupe `render`. Détails sous chaque tâche, chiffres dans **Mesures**, choix dans **Décisions**.
- Mesures : 6 vues 3,96 / 6,22 / 5,17 / 4,41 / 4,18 / 4,37 ms avec le volume (contre 4,78 / 6,13 /
  5,85 / 5,47 / 5,94 / 5,78 par pixel ; lot 2 : 3,11 / 5,09 / 4,01 / 3,80 / 3,34 / 3,72). Vols : p1
  59,2 et 57,1 (lot 2 : 61,3 et 61,7) après correction des uniformes (55,6 et 53,5 avant).
- Constats visuels : à 20 km de visibilité, vallées voilées sous la couche d'aérosols, soleil bas
  rougi, halo autour du soleil ; coucher de soleil et alpenglow corrects en temps accéléré ; nuit noire
  (L3.6).
- Problèmes ouverts : voir État courant (« Prochaine session »).

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
- Choix de l'éclairage par l'utilisateur : option B (lumière du ciel en chaque point, PMREM pour les
  seuls reflets). Exposition inchangée (luminance mesurée identique à ±1 %). Le voile restant vient de la
  perspective aérienne : vu d'altitude, le terrain s'éclaircit et l'avion blanc s'en détache moins.
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
