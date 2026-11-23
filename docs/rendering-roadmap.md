# Feuille de route — rendu de qualité AAA

Objectif : amener le rendu d'OpenSkyFlight au niveau des techniques des jeux AAA, avec une seule
contrainte : l'application doit continuer à fonctionner dans un navigateur (WebGPU, repli WebGL2).

Ce document est la **source de vérité de l'avancement**. Il est lu en début de session et mis à jour
en fin de session.

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
# Captures + FPS/temps GPU des 5 vues de référence
npm run render:capture -- --out benchmarks/render/<label>
# Benchmark de vol (sans --plan : vol par défaut ; --plan 1 : flight-over-the-Alps-01)
npm run render:benchmark -- --out benchmarks/render/<label> [--plan 1]
```

- Chrome est lancé en fenêtre visible avec vsync, canevas 2056×1290 ×2 (= configuration n°4 de
  `BENCHMARKS.md`). Le mode headless ou sans vsync ne présente pas chaque frame : ses FPS sont faux.
- Sur un écran 120 Hz, les vues statiques plafonnent à 120 FPS : comparer le **temps GPU**, et le
  p1 des benchmarks de vol pour les saccades.
- Lancer chaque mesure deux fois de suite si le cache de tuiles (`cache/`) est vide : la première
  passe le remplit.
- Le temps GPU vient de `GPUTimer` (`renderer.resolveTimestampsAsync`) qui additionne les requêtes
  résolues depuis le dernier appel : une valeur peut couvrir plus d'une frame. Indicateur relatif
  seulement, jusqu'à L2.9.

## Lot 1 — Gains rapides

- [ ] **L1.1** Filtrage anisotrope ×16 sur les textures de tuiles
      (`vendor/three-tile/.../tileImageLoader/TileImageLoader.ts:43`, valeur issue de
      `renderer.getMaxAnisotropy()`).
- [ ] **L1.2** Tone mapping (AgX ou ACES) + `toneMappingExposure` ; recalibrer les intensités des lumières
      (`constants/rendering.js`, `AtmosphericSky.js`) et le rendu de `SkyMesh`.
- [ ] **L1.3** Tampon de profondeur inversé (`reversedDepthBuffer: true` dans `SceneSetup.js`) ;
      vérifier le z-fighting au loin et la couche de nuages.
- [ ] **L1.4** Carte d'environnement générée depuis le ciel (`PMREMGenerator`), régénérée à chaque
      changement de soleil, assignée à `scene.environment` ; l'ambiante plate est réduite d'autant.
- [ ] **L1.5** Élévation du soleil par défaut plus basse (≈ 35°) pour révéler le relief.
- [ ] **L1.6** Rendre le ciel visible : `NodeMaterial.fog` vaut `true` par défaut et `SkyMesh` ne le
      désactive pas ; avec le dôme à 4,5e6 m et `fogDensity` 1,5e-5, le brouillard recouvre 100 % du
      ciel. Le ciel affiché est la couleur unie du brouillard (visible sur toutes les captures
      baseline). Correctif : `sky.material.fog = false`, puis caler la couleur du brouillard sur le
      ciel à l'horizon en attendant le lot 3.
- [ ] **L1.7** Convention d'azimut du soleil : `CONFIG.sunAzimuth` est le θ sphérique (0 = sud, 90 = est),
      donc la valeur par défaut 180 place le soleil **au nord**, à l'opposé des ombres incrustées dans
      l'imagerie satellite. Passer à un azimut boussole (défaut ≈ 160°), et simplifier
      `compassToSunAzimuth` (`AtmosphericSky.js`) en conséquence.
- [ ] **L1.8** Exagération verticale : three-tile travaille en unités Web Mercator (`mapDepth = 1`).
      À 45,8° de latitude, une unité horizontale vaut 1/cos(lat) ≈ 1,43 m réel, alors que l'altitude est
      en mètres : le relief est affiché à ≈ 70 % de sa hauteur. Multiplier l'élévation par 1/cos(lat)
      dans `TerrariumTSL.ts`, et convertir en conséquence l'altitude affichée (HUD), l'altitude sol
      (`getGroundElevation`), les vues de référence et les plans de vol (y en unités monde).

## Lot 2 — Socle : pipeline HDR et performance

- [ ] **L2.1** `RenderPipeline` : passe de scène en HDR (HalfFloat), tone mapping déplacé en fin de pipeline.
- [ ] **L2.2** TRAA (`TRAANode`) avec tampon de vitesse (MRT) ; retirer le MSAA.
- [ ] **L2.3** Bloom (`BloomNode`) à seuil physique (soleil, reflets spéculaires).
- [ ] **L2.4** Résolution dynamique : `AdaptiveQualityManager` pilote l'échelle de rendu interne
      reconstruite par TRAA, au lieu du `pixelRatio`.
- [ ] **L2.5** Rétablir le frustum culling des tuiles (`GeoTerrainManager.js:154`) avec des boîtes
      englobantes calculées depuis l'altitude min/max de chaque tuile.
- [ ] **L2.6** Réduire les saccades (p1) : précompilation des pipelines (`compileAsync`), matériaux de
      tuiles partagés au lieu d'un `clone()` par tuile, décodage d'image dans un worker.
- [ ] **L2.7** Presets de qualité (Low / Medium / High / Ultra) dans `config.js` et le panneau MFD.
- [ ] **L2.8** Exposition automatique : histogramme de luminance en compute shader, adaptation temporelle.
- [ ] **L2.9** Fiabiliser les mesures : `GPUTimer` avec une mesure par frame (horodatages de passe
      attribués à la frame) exportée par sous-système (terrain, ciel, post-traitement) ; `summary.fps.avg`
      calculé comme frames / durée au lieu de la moyenne des FPS instantanés.

## Lot 3 — Atmosphère physique et heure du jour

- [ ] **L3.1** Décision : intégrer `@takram/three-atmosphere` (vérifier le support WebGPU/TSL) ou
      implémenter le modèle de Hillaire 2020 en TSL. Consigner dans **Décisions**.
- [ ] **L3.2** LUT : transmittance, diffusion multiple, vue du ciel, volume de perspective aérienne.
- [ ] **L3.3** Perspective aérienne appliquée au terrain, à l'avion et à l'eau ; suppression de `FogExp2`.
- [ ] **L3.4** Couleur et intensité du soleil et de l'ambiance dérivées de l'atmosphère.
- [ ] **L3.5** Position astronomique du soleil (date, heure, lat/lon) ; curseur d'heure et accélération
      du temps dans le panneau.
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

- [ ] **L5.1** Carte d'altitude : réduction bilinéaire au lieu du plus proche voisin
      (`TerrariumShaderLoader.ts:40`), pas de texel cohérent avec la grille (`TerrariumTSL.ts:70`),
      normales par pixel depuis la carte d'altitude 256 px complète.
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
- « FPS moy » = nombre de frames / durée. Le champ `summary.fps.avg` du rapport JSON fait la moyenne
  des FPS instantanés, biaisée vers le haut par les frames de rattrapage (127,7 au lieu de 113,8
  sur le vol par défaut) — à corriger avec L2.9.
- GPU ms = médiane (p95 entre parenthèses), indicateur relatif (voir Outillage).
- Frames lentes = nombre de frames > 33,3 ms / > 50 ms.

### Benchmarks de vol

| Date | État | Scénario | Durée | FPS moy | p5 | p1 | GPU ms | Frames lentes | Triangles moy | Draw calls méd. |
|---|---|---|---|---|---|---|---|---|---|---|
| 2026-11-23 | Baseline | Vol par défaut | 128 s | 113,8 | 76,3 | 35,2 | 7,0 (10,6) | 124 / 28 | 2,28 M | 557 |
| 2026-11-23 | Baseline | Plan 1 (basse alt.) | 93 s | 113,4 | 67,1 | 39,4 | 7,4 (11,1) | 57 / 4 | 2,73 M | 651 |

Pour mémoire, la configuration n°4 de `BENCHMARKS.md` (même machine, Chrome 146, ancien moteur
geo-three) donnait avg 83,8 / p5 47,8 / p1 17,0 (avg biaisé, comparable à 127,7 / 76,3 / 35,2).

### Vues de référence

| Date | État | Vue 1 | Vue 2 | Vue 3 | Vue 4 | Vue 5 |
|---|---|---|---|---|---|---|
| 2026-11-23 | Baseline — GPU ms méd. | 7,7 | 6,8 | 6,4 | 6,6 | 10,3 |
| 2026-11-23 | Baseline — FPS moy / p1 | 120 / 109 | 120 / 108 | 120 / 111 | 120 / 106 | 120 / 109 |

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

## Journal des sessions

<!-- Entrée la plus récente en haut. -->

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
- Prochaine étape : lot 1, en commençant par L1.6 (ciel) et L1.1 (anisotrope), puis L1.2 (tone mapping).

### 2026-11-23
- Fait : analyse du rendu existant, création de cette feuille de route.
- Problèmes ouverts : bundle three-tile absent en local (L0.1).
- Prochaine étape : L0.1 puis L0.2.
