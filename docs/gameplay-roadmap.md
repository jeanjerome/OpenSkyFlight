# Feuille de route — vol, systèmes et combat

Objectif : faire d'OpenSkyFlight un simulateur de vol de combat jouable dans un navigateur : vol physique
du Rafale piloté par commandes de vol électriques, réacteurs et jets crédibles, décollage et
atterrissage sur de vrais aéroports, radar de terrain de nuit, tirs de missiles et escorte par des
drones de combat.

Ce document complète `docs/rendering-roadmap.md` (rendu) et suit les mêmes conventions. Il est la
**source de vérité de l'avancement** des lots G0 à G6.

## État courant (mis à jour le 2026-11-27)

- **Où reprendre** : G0 à G3 et le banc de pilotage sont faits et dans `main` (lot G3 fusionné en
  avance rapide depuis `feat/takeoff-landing` le 2026-11-27, **non poussé** : `git status -sb`). La
  suite est au choix de l'utilisateur en début de session : ses essais en vol (décollage d'une piste,
  tour de piste, approche guidée, atterrissage, de jour et de nuit), puis le lot de rendu 6 (voir
  `docs/rendering-roadmap.md`) ou G4 (radar de nuit). Les branches `feat/takeoff-landing` et
  `feat/render-terrain` existent encore (à supprimer seulement à sa demande).
- **Avant de mesurer ou de voler** : reconstruire le bundle three-tile après un changement de branche
  (`cd vendor/three-tile && npm run build:lib` : l'aplanissement des pistes et le niveau maximal par
  tuile y sont) ; relancer le serveur de l'utilisateur (`npm run dev`, port 3000) s'il date d'avant
  G3.4 (routes `/api/airports` et `/api/runways`). Les données OurAirports sont dans
  `cache/ourairports/` (téléchargées une fois par le serveur).
- **Vérifier un changement de vol de bout en bout** : `npm test` (dont le tour de piste du pilote
  scripté sur piste plate) et `npm run flight:scenario -- --url http://localhost:3002/ --out
  <dossier> --airport LSGG --time-scale 3` sur un serveur de test (`node scripts/serve.js --port
  3002`), voir **Banc de pilotage**. Référence : LSGG 04 et LFPG 08R de nuit, tous deux réussis.
- **Ce que G3 a apporté (pour la suite)** : train animé et poignée `G` (bouton X), physique au sol
  (`GearContact`, loi sol des commandes de vol, centre de gravité `AIRCRAFT_CG`), crash et écran de
  reprise (`GroundStrike`, `CrashScreen`), aéroports d'OurAirports (recherche dans le menu, onglet
  World, section Airports ; `RunwayCatalog` autour de l'avion), terrain aplani sous les pistes (worker
  d'altitude), pistes et marquages peints (`RunwayMarkings`) et tuiles jusqu'au zoom 18 autour,
  balisage lumineux et PAPI (`RunwayLights`), guidage d'approche sur le HUD (`ApproachGuide`), pilote
  automatique de cap et d'altitude (`C`). Les objets placés loin dans le monde (drones, sites, G5)
  devront, comme le terrain et les feux de piste, être abaissés de la courbure `d²/2R` au rendu.
- **Points ouverts relevés** : de nuit, les lumières de ville (Black Marble) font de grandes taches
  floues au sol près des aéroports ; au zoom 18, les vrais marquages de l'imagerie se devinent sous
  la peinture (25 % d'imagerie gardés) ; les pistes en herbe restent celles de l'imagerie ; les zones
  avant un seuil décalé n'ont pas leurs flèches ; le décollage du pilote scripté se fait plein sec
  (sans PC) ; tuiles chargées avant que leurs pistes soient connues non recalculées (aucun cas
  courant).
- **Historique** : G0, G1 et G2 (sauf l'option G2.7) fusionnés et poussés le 2026-11-25, sauf le
  préchargement et les requêtes par lot de G0.4 (reportés) et la récupération automatique de G1.2
  (reportée) ; lots de rendu 4 et 5 fusionnés et poussés le 2026-11-26 ; G3 et le banc de pilotage
  fusionnés le 2026-11-27.
- **Vue orbite** (demandée par l'utilisateur, hors lots) : `CONFIG.cameraMode = 'orbit'`, entre la
  poursuite et le cockpit (`V`), `js/camera/OrbitCameraController.js`. La caméra tourne autour de
  l'avion dans son repère (roulis compris, rattrapé comme la poursuite liée), vise 3 m derrière son
  centre ; souris (pointeur verrouillé) ou stick droit pour tourner (`ControlInputs.freeLook` les
  détourne de la visée, du palonnier et du glissement), molette pour la distance (8 à 150 m) ; HUD
  masqué ; l'avion garde sa visée, les touches et le stick gauche le pilotent toujours. Vérifié dans
  Chrome avec une manette simulée et la molette (le verrouillage du pointeur est refusé à
  l'automatisation : le sens de la souris est à confirmer en vol).
- **Réacteurs et jets (G2)** :
  - `js/flight/exhaust.js` (`exhaustJet()` : rapport de pression de tuyère, Mach du jet, diamètre de
    sortie, espacement des cellules de choc, premier disque de Mach, niveau et longueur de flamme),
    `js/aircraft/EngineExhaust.js` (volets de tuyère, lueur de la turbine, flamme volumique, lumière de
    PC, brume de chaleur), `js/audio/EngineSound.js` (son synthétisé). `AircraftManager.engines` et
    `.jet` donnent le régime affiché et entendu ; `AircraftLights` ne garde que les feux.
  - Réglages graphiques ajoutés : « Heat haze » (High et Ultra, ≈ +0,1 ms) et « Afterburner light »
    (Ultra, +0,1 à 0,2 ms même éteinte). Brume : `ScenePipeline.setHeatLayer()` et couche
    `HEAT_LAYER` ; flamme : passe de halo (`GLOW_LAYER`).
  - La flamme est dessinée par la passe de halo : ses fragments partent de la position de la caméra
    dans le repère du modèle, prise dans `onBeforeRender` (la matrice monde de l'avion de la frame,
    pas celle d'avant : à 300 m/s, un retard d'une frame décale le rayon de 2,5 m).
- **Modèle de vol (G1)** :
  - `js/constants/rafale.js` (chiffres et estimations calées), `js/flight/aerodynamics.js` (CL en
    sinus jusqu'à CLmax 1,7 à 32°, facteur de Mach, polaire `CD0(M) + k(M)·CL²`),
    `js/flight/Engines.js` (deux M88-2, chute de poussée de Mattingly, perte en air raréfié sous 12 %
    de la pression au sol, montée en régime, PC au-delà du cran, consommation),
    `js/flight/FlightModel.js` (6 DDL : translation physique, rotation par les commandes de vol
    électriques — demande de g, tenue de pente au neutre, limiteurs, roulis autour de la trajectoire,
    dérapage nul), `js/flight/performance.js` et `js/flight/benchmarks.js` (banc :
    `npm run flight:bench`, repris par `npm test`).
  - `js/flight/MouseAim.js` (instructeur de visée), `js/flight/SimulatedFlight.js` (mode Simulation :
    manche clavier adouci, manette des gaz à cran, aérofrein, crash au sol en attendant G3),
    `js/aircraft/ControlSurfaces.js` (charnières calculées, gouvernes animées).
  - `CONFIG.flightMode` (`simulation` par défaut, `F` bascule) ; les vues de référence passent en
    Exploration (réglage mémorisé) ; `render:benchmark` ouvre l'app en Exploration pour que le vol par
    défaut parte du même point. Caméra de poursuite : derrière la visée souris, ou liée à la cellule
    (roulis compris) au clavier et à la manette.
  - Corrigé au passage : l'échelle de tangage du HUD était inversée (horizon au-dessus du centre nez
    en piqué).
- **Socle de simulation (G0)** :
  - `js/sim/SimulationClock.js` : pas fixe de 240 Hz (`SIMULATION_RATE`), au plus
    `MAX_DELTA_TIME × 240` pas par frame, fraction restante `alpha` pour interpoler la pose rendue.
  - `js/flight/AircraftState.js` : état de l'avion (position, vitesse, quaternion, cap et assiette
    scalaires) séparé de la caméra ; `interpolate(alpha)` donne la pose que lisent la caméra, le
    modèle, le HUD et la mini-carte.
  - `js/flight/ExplorationFlight.js` : l'ancien vol libre (`FlightController`, supprimé) devenu le mode
    Exploration ; il garde l'interface que lisent le benchmark et les plans de vol (`position`, `yaw`,
    `pitch`, `enabled`, `yawRate`, `pitchRate`) et ajoute `teleport()`.
  - `js/input/ControlInputs.js` : clavier, souris (verrouillage du pointeur) et manette en
    disposition standard, rassemblés une fois par frame en commandes (`lookYaw`, `lookPitch`,
    `yawRate`, `pitchRate`, `forward`, `strafe`) ; boutons de manette par `onButton()` (Y : vue,
    Menu : pause). Réglages « Stick sensitivity » et « Invert stick pitch » (onglet Flight).
  - `GeoTerrainManager.groundHeight(x, z)` : altitude du sol **telle que dessinée** (triangles de la
    tuile affichée la plus fine, grille de hauteurs gardée sur le CPU par le chargeur Terrarium), repli
    sur z12, `null` si rien n'est chargé ; l'ancien `getGroundElevation()` prend la valeur à renvoyer
    quand la tuile manque. `window.osf.aircraft()` et `window.osf.groundHeight()` pour l'automatisation.
  - `js/sim/atmosphere.js` (`isa()`), `js/sim/EntityRegistry.js` (pas fixe + grille de 2 km) ; tests
    `npm test` (`tests/*.test.js`, exécuteur de Node).
  - La courbure de la Terre est appliquée autour de la caméra au rendu seulement (terrain, nuages) : un
    objet lointain (drone, site sol-air, G5) devra être abaissé de `d²/2R` au rendu pour rester posé
    sur le relief dessiné ; la physique reste dans le plan tangent.
- **Point de départ dans le code (avant G0)** :
  - L'ancien `js/camera/FlightController.js` était une caméra libre : la souris donne le cap et
    l'assiette, `W`/`S` avancent à la vitesse fixe `CONFIG.cameraSpeed` (1 à 4 000 m/s), le roulis est
    cosmétique (`app.js`, dérivé du taux de lacet). Aucune gravité, aucune collision avec le sol.
  - `AircraftManager` lit `position`, `quaternion`, `yawRate`, `pitchRate`, `thrust` ; la
    post-combustion s'allume au-dessus de 300 m/s (`AFTERBURNER_SPEED`), pas selon une manette.
  - Le benchmark (`BenchmarkRunner`) et le pilote automatique (`FlightPlanRecorder`) imposent position
    et orientation : ils doivent rester cinématiques pour que les mesures de rendu restent comparables.
  - `GeoTerrainManager.getGroundElevation()` lisait les cartes d'altitude z12 décodées sur le CPU
    (≈ 25–38 m par pixel) et **renvoyait 0 si la tuile n'était pas chargée** (remplacé par
    `groundHeight()`, voir ci-dessus).
  - Le glTF du Rafale (`assets/models/rafale/Rafale.gltf`, export Cheetah3D) contient des maillages
    séparés pour canards, becs, volets, élevons, gouverne de direction, tuyères, train complet
    (roues, jambes, contrefiches, trappes, puits), crosse, pylônes, MICA, Meteor, Exocet et GBU-24.
    Le train est en position sortie et masqué par `AircraftManager.load()`. **Tous les nœuds ont une
    transformation identité** (sommets figés dans le repère avion) : chaque pièce mobile demande un
    pivot calculé (charnière) avant de pouvoir être animée.
  - Les fichiers d'origine (`Rafale.jas` Cheetah3D, `.dae`, `.fbx`, `.obj`, `Textures.zip`) sont dans
    `assets/models/rafale/` (non versionnés au 2026-11-25). Vérifié : **aucun pivot ni animation**
    dans aucun format (`.jas` : `position`/`pivot` à 0 pour toutes les pièces, une prise vide ; `.dae` :
    matrices identité). Les charnières restent à calculer depuis la géométrie. `Rafale-2.gltf` est
    identique à `Rafale.gltf`. `Textures.zip` contient la texture de peinture et un `UVMap.pdf`
    (gabarit UV utile pour peindre les cartes métal/rugosité/normales de L6.1).
  - Le modèle vient de CGTrader (modèle gratuit « Dassault Rafale B ») sous licence Royalty Free,
    incompatible avec sa présence dans le dépôt public (voir Décisions, « Encore ouvert ») : laissé
    tel quel à la demande de l'utilisateur, le 2026-11-25.
- **Points de réglage connus** si l'utilisateur les demande après ses vols : convergence latérale de
  la visée souris (`SIDE_BANK_GAIN`), roulis clavier (`KEY_STICK_TIME`), force de la brume
  (`HAZE_BEND`, `HAZE_FLOW`), au sol la rotation (`GROUND_PITCH_CONTROL`, `GROUND_PITCH_RATE`), le
  freinage (`BRAKE_FRICTION`) et le braquage de la roue avant (`STEERING_SIDE_ACCELERATION`).
- **Outils** : `npm test` (tests Node, dont le banc du modèle de vol et l'instructeur de visée),
  `npm run flight:bench` (tableau du banc), scripts Playwright ad hoc dans le scratchpad de session
  (vue orbite par `?cameraMode=orbit` et la molette pour cadrer l'avion, `window.osf.setConfig(clé,
  valeur)` pour basculer un réglage sur la même vue, Exploration sans gaz pour une image immobile ;
  le verrouillage du pointeur est refusé à l'automatisation, la souris ne s'y teste pas ; manette
  simulée par `navigator.getGamepads` injecté avec `addInitScript` ; `window.osf.aircraft()` donne mode, Mach,
  vitesse, g, incidence, inclinaison, manette, poussée et carburant). Serveur de test sur un autre
  port que celui de l'utilisateur (3000), voir `docs/rendering-roadmap.md`, Outillage.

## Comment reprendre le travail (début de session)

1. Lire **État courant**, puis le lot en cours et **Décisions**.
2. `git status` et `git log --oneline -15` (le lot en cours a sa branche, créée depuis `main`).
3. `npm test` doit passer (banc du modèle de vol compris) avant toute modification.
4. En fin de session : cocher les tâches, consigner mesures et banc, mettre à jour **État courant** et
   ajouter une entrée au **Journal des sessions**.

## Conventions

- Mêmes règles que `docs/rendering-roadmap.md` : les identifiants `Gx.y` ne servent que dans ce
  document ; commits, commentaires, PR et issues décrivent le comportement du code.
- Une branche par lot : `feat/flight-<thème>` (ex. `feat/flight-model`), fusion dans `main` à la clôture.
- Le benchmark de rendu reste reproductible : il garde sa trajectoire imposée, quel que soit le modèle
  de vol.
- Toute nouvelle donnée réelle (chiffre du Rafale, d'une arme, d'un radar) est consignée dans
  **Données de référence** avec sa source et son statut (officiel, essai en vol, estimation).
- Les réglages exposés à l'utilisateur restent compréhensibles (style « Hangar ») ; les coefficients
  techniques vont dans l'onglet Développeur (`?dev=1`).
- Les effets coûteux (jet volumétrique, brume de chaleur, radar) sont rattachés aux presets de qualité
  et se désactivent proprement sur le backend WebGL2 s'ils exigent des compute shaders.

## Critères de sortie communs à chaque lot

- Les critères de rendu de `docs/rendering-roadmap.md` (captures des vues de référence, benchmark,
  p1 à 10 % près, `npm run lint`).
- Pour le modèle de vol : un **banc de vérification** reproductible (script ou page `?dev=1`) qui mesure
  les cibles chiffrées du lot (taux de virage, accélération, vitesse d'approche…) et les compare aux
  **Données de référence**.
- Coût CPU de la simulation mesuré (profil CDP) : budget indicatif 2 ms par frame pour la physique, l'IA
  et les armes réunies.

## Vue d'ensemble et dépendances

```
G0 Socle de simulation ──┬─► G1 Modèle de vol + commandes ──┬─► G3 Décollage / atterrissage
                         │                                  └─► G2 Réacteurs et jets
                         ├─► G4 Radar de terrain (indépendant du modèle de vol)
                         └─► G5 Entités, cibles, missiles ──► G6 Drones de combat
```

| Lot | Thème | Dépend de | Ordre de grandeur |
|---|---|---|---|
| G0 | Socle de simulation (pas fixe, entrées, altitude fiable, entités) | — | 1–2 sessions |
| G1 | Modèle de vol physique, commandes de vol électriques, contrôles, HUD | G0 | 3–4 sessions |
| G2 | Régime moteur, jets selon la poussée, tuyère, brume de chaleur, son | G1 | 1–2 sessions |
| G3 | Train animé, physique au sol, aéroports, pistes, balisage, approche | G1 | 4–5 sessions |
| G4 | Radar de nuit : carte radar du relief, mode TAWS, suivi de terrain | G0 | 2–3 sessions |
| G5 | Entités IA, cibles, menaces, missiles air-air puis air-sol, effets | G1 | 4–5 sessions |
| G6 | Drones de combat : types, missions, formation, commandes | G5 | 3–4 sessions |

Recoupements avec le rendu : L6.2 (particules : post-combustion, distorsion de chaleur, traînées) est
absorbé en partie par G2 et G5 ; L6.1 (matériaux de l'avion) peut accompagner G3 (train visible au
sol) ; les nuages volumétriques (lot 4) n'ont pas de dépendance avec ces lots.

---

## Lot G0 — Socle de simulation

- [x] **G0.1** Boucle de simulation à pas fixe (240 Hz, accumulateur, interpolation de l'état rendu),
      séparée de la boucle de rendu ; `MAX_DELTA_TIME` borne le nombre de pas par frame.
- [x] **G0.2** Séparer l'**état de l'avion** (position ECEF/locale, vitesse, quaternion, vitesse
      angulaire, masse, carburant, manette) de la **caméra**. `FlightController` devient le mode
      « Exploration » (vol libre actuel, vitesse jusqu'à 4 000 m/s, sans collision), conservé pour
      voyager vite et pour les vues de référence.
- [x] **G0.3** Couche d'entrée unique produisant des commandes normalisées (tangage, roulis, lacet,
      manette, freins, armes…) depuis clavier, souris et manette (Gamepad API `mapping: "standard"`,
      zones mortes, inversion, courbes) ; profils mémorisés dans `settingsStore`. HOTAS hors périmètre
      pour l'instant (axes arbitraires en `mapping: ""`, demanderait un assistant de calibration).
      Fait pour le mode Exploration (commandes de visée, avance, glissement, boutons) ; les commandes
      de tangage, roulis, manette des gaz et armes s'ajouteront avec G1 et G5.
- [~] **G0.4** Altitude du sol fiable : interpolation sur la meilleure carte d'altitude chargée (pas
      seulement z12), état « inconnu » au lieu de 0, préchargement des tuiles sous et devant l'avion,
      requête par lot pour les points de contact (roues, saumons, nez) et les sondes de l'IA.
      Fait : altitude telle que dessinée, repli z12, `null` si inconnue. Reste : préchargement devant
      l'avion (avec G3, quand l'approche descend vite vers des tuiles fines) et requêtes par lot (avec
      G5, quand l'IA sonde le relief).
- [x] **G0.5** Atmosphère standard (ISA : température, pression, densité, vitesse du son selon
      l'altitude), partagée par l'avion, l'IA et les missiles ; vent global optionnel (repris du lot 4).
- [x] **G0.6** Registre d'entités minimal (avion joueur, puis IA, missiles, cibles) avec mise à jour
      au pas fixe et grille spatiale pour les requêtes de voisinage ; vecteurs préalloués.
      Fait (registre vide branché sur le pas fixe) ; l'abaissement des objets lointains par la courbure
      au rendu viendra avec le premier objet lointain (G5).

## Lot G1 — Modèle de vol physique et commandes

- [x] **G1.1** Corps rigide à 6 degrés de liberté : forces de portance `CL(α, M)`, traînée
      `CD0(M) + k·CL²`, poussée `T(h, M, manette)`, gravité ; moments pilotés par les commandes de vol
      électriques (voir G1.2) plutôt que par des tables de moments ; Euler semi-implicite à 240 Hz,
      quaternion renormalisé.
- [~] **G1.2** Commandes de vol électriques « carefree » : demande de facteur de charge en tangage
      (neutre = 1 g, auto-trim), limiteur d'incidence (≈ 29°) et de g (+9 / −3,2 en air-air, +5,5 en
      charges lourdes), demande de taux de roulis (270°/s, réduit selon la pression dynamique),
      dérapage maintenu à zéro, réponse courte période du 2ᵉ ordre (ω ≈ 4 rad/s, ζ ≈ 0,7).
      Récupération automatique (remise en montée à 5° et 350 kt) sur une touche.
      Fait, sauf la récupération automatique et le mode charges lourdes (avec G5). Neutre : tenue de
      la pente du moment où le manche est relâché, virage en palier jusqu'à 60° d'inclinaison.
- [x] **G1.3** Moteurs M88-2 : 2 × 50 kN à sec, 2 × 75 kN avec post-combustion, poussée selon
      densité et Mach (`T = T_SL·σ^0,7·(1 + aM)`, `a` calé pour Mach 1,8 en altitude et 1,1 au sol),
      retard du 1ᵉʳ ordre (ralenti → PC plein ≈ 4 s), consommation (22 / 47 g/(kN·s)), masse variable.
      Fait avec la chute de poussée de Mattingly plutôt que `σ^0,7` : la limite de température totale
      d'entrée (rapport 1,07) donne d'elle-même Mach 1,82 à 11 km et 714 kt au sol.
- [x] **G1.4** Contrôles : « mouse aim » par défaut (la souris désigne une direction, un instructeur
      PD la convertit en roulis et demande de g dans les limites de l'avion), clavier direct, manette
      de jeu ; manette des gaz à crans (ralenti, plein sec ≈ 80 %, cran à franchir, PC min → max) ;
      aérofrein (canards et élevons braqués ensemble) ; la vitesse fixe disparaît du mode Simulation.
- [x] **G1.5** Animation des gouvernes depuis les sorties des commandes de vol : pivots calculés par
      pièce, canards (−25° / +20°), élevons ±25° (symétriques en tangage, différentiels en roulis),
      gouverne de direction ±30°, becs 0–20° selon l'incidence, vitesse d'actionneur 60–100°/s.
      Fait (100°/s ; aérofrein : canards bord d'attaque −40°, élevons +12°).
- [x] **G1.6** HUD de vol : marqueur de vecteur vitesse, Mach, facteur de charge et g max, incidence,
      manette et PC, carburant ; caméra de poursuite qui suit le roulis réel.
- [x] **G1.7** Banc de vérification : virage instantané ≈ 30°/s à Mach 0,5 et soutenu ≈ 24°/s à
      Mach 0,6 au niveau de la mer, accélération ≈ 30 kt/s (200 → 500 kt, 5 000 ft, PC), Mach 1,8 en
      altitude, approche 125 kt à 16° d'incidence pour 15 t, plafond ≈ 15 km.
      Fait (voir **Mesures**) ; l'accélération publiée est jugée douteuse (voir Données de référence).
- [~] **G1.8** Benchmark et pilote automatique : trajectoires toujours imposées (cinématiques), avec
      manette et PC déduits de la vitesse pour l'animation des jets ; pilote automatique « vrai »
      (suivi de cap et d'altitude par les commandes de vol) reporté à G3.
      Fait pour les trajectoires imposées ; jets en Exploration et sur trajectoire imposée : plein
      régime en avançant, PC au-dessus de 300 m/s, Mach déduit de la vitesse réglée (G2.1).

## Lot G2 — Réacteurs et jets selon la poussée

- [x] **G2.1** Régime moteur (de G1.3) branché sur `AircraftLights` : lueur de la turbine selon le
      régime, flamme nulle à sec, flamme de PC selon le niveau de PC (min → max).
      Fait : `AircraftManager.engines` (cœur, PC, Mach, en marche) vient du modèle de vol en
      Simulation ; en Exploration et sur les trajectoires imposées, plein régime en avançant et PC
      au-dessus de 300 m/s, avec une montée en régime de 0,8 s. `js/flight/exhaust.js` en déduit le
      jet (testé par `npm test`) ; flamme de 4 m au plus petit cran de PC à 8 m au plein.
- [x] **G2.2** Flamme analytique améliorée (passe de halo existante) : 2–3 coques coniques
      imbriquées, diamants de choc `I ∝ cos²(πx/L)·e^(−x/ℓ)` avec un espacement
      `L ≈ 1,3·D·√(Mj² − 1)` (≈ 0,8–1 m), cellules raccourcies vers l'aval, 4 à 8 m de flamme ;
      couleur bleu-violet (chimiluminescence, visible de nuit) mêlée de blanc-orangé (suies).
      Coût visé 0,1–0,3 ms.
      Fait (`js/aircraft/EngineExhaust.js`) : volume lumineux intégré le long de chaque ligne de vue,
      dessiné sur un cylindre autour de chaque axe de tuyère et arrêté par la profondeur de la scène
      (cellule, relief) ; cœur blanc-jaune, manteau de suies orange, gaine bleu-violet (12 à 24
      échantillons). Les disques de Mach sont des ellipsoïdes gaussiens intégrés exactement le long de
      la ligne (forme fermée), 8 disques, cellules raccourcies de 5 % chacune ; premier disque à
      `0,67·D·√(P0/Pa)`, espacement selon le Mach du jet, qui croît avec la compression dynamique
      (les cellules s'allongent avec la vitesse). La flamme prend l'exposition des sources de nuit à
      la puissance 0,35 : sinon elle vire au blanc. Coût mesuré dans le pire cas (vue arrière à
      11 m, flamme sur une grande part de l'écran) : +0,14 à +0,21 ms, contre +0,8 ms avec un
      échantillonnage fin des diamants (64 échantillons).
- [x] **G2.3** Volets de tuyère animés : diamètre de sortie ≈ 0,55 m à sec → 0,68 m en PC.
      Fait : les volets convergents du modèle (charnière à z = −6,15 m, sortie à −6,64 m) se
      déforment dans le nuanceur de sommets (`positionNode`) : ouverts au ralenti (0,62 m, estimé),
      fermés au plein sec (0,55 m), ouverts en PC (0,68 m, rayon dessiné par le modèle).
- [x] **G2.4** Brume de chaleur en espace écran : tampon de décalage dessiné par un cône derrière les
      tuyères (toujours actif, même à sec), appliqué avant le TAAU, atténué sur les bords ; preset
      High et plus.
      Fait : `ScenePipeline.setHeatLayer()` rend la couche `HEAT_LAYER` dans un tampon de décalages
      (uv) à demi-résolution ; la passe d'atmosphère, qui lit la scène de toute façon, lit sa couleur
      et sa profondeur aux positions décalées (pas de passe plein écran en plus ; pas de brume en mode
      SAR, sans atmosphère). `EngineExhaust._createHaze()` : colonne d'air chaud gaussienne autour de
      chaque axe (0,35 m à la sortie, +0,05 m/m, refroidie sur 8 m, 22 m de long), intégrée en
      6 échantillons le long de la ligne de vue et arrêtée par la scène ; direction donnée par un
      bruit de Perlin (tourbillons de 0,3 m) entraîné à 6 m/s vers l'aval (≈ 10 Hz : plus vite, le TAAU
      le moyennerait en flou) ; déviation angulaire convertie en décalage d'écran par la projection,
      nulle au bord de la colonne ; chaleur selon le régime (0,6 au ralenti → 1 au plein sec → 2,3 en
      PC). Force : 10⁻² rad par mètre de colonne, quatre fois l'estimation physique, pour que le
      scintillement survive au TAAU (quelques pixels près des tuyères) ; à juger en vol. Réglage
      « Heat haze » (Graphics, Light), presets High et Ultra. Coût : ≈ +0,1 ms sur les vues de
      référence (voir **Mesures**), +0,05 à +0,1 ms en vue orbite rapprochée.
- [x] **G2.5** Lumière ponctuelle de PC qui éclaire le fuselage et le sol à basse altitude.
      Fait : `PointLight` 2,5 m derrière les tuyères, 160 000 cd au plein (estimé), orange, avec la
      même exposition que la flamme, pour que ce qu'elle éclaire ne soit pas plus clair qu'elle.
      Même éteinte, elle coûte +0,1 à +0,2 ms sur toutes les vues (chaque fragment éclairé, relief et
      nuages compris, l'évalue) : réglage « Afterburner light » (onglet Graphics, section Light),
      activé par le preset Ultra seulement. Tant qu'il est actif, la lumière reste dans la scène,
      sombre sans PC (l'ajouter ou la retirer recompile tous les matériaux éclairés).
- [x] **G2.6** Son moteur (WebAudio) selon le régime et la PC, canal `engineVolume` existant ;
      sifflement de la turbine, grondement de la PC, effet de proximité en vue extérieure.
      Fait (`js/audio/EngineSound.js`) : sifflement (soufflante et compresseur, fréquences selon le
      régime, entendu surtout de l'avant), grondement du jet (bruit filtré, plus clair avec la
      puissance, surtout de l'arrière), grondement et crépitement de la PC ; niveau selon la distance
      à la caméra, étouffé en cockpit, coupé quand le menu est ouvert ; démarre au premier appui ou
      clic (exigence des navigateurs). Vérifié par les paramètres du graphe audio dans Chrome ; le
      rendu sonore reste à juger à l'oreille.
- [ ] **G2.7** (option) Évaluer `@aeronautic/afterburner` (MIT, TSL, WebGPU) ou un portage de son
      ray marching en demi-résolution ; budget 1,5–3 ms en vue arrière, à mesurer contre G2.2.

## Lot G3 — Décollage et atterrissage

- [x] **G3.1** Animation du train : pivots des jambes, contrefiches, roues et trappes calculés depuis la
      géométrie ; séquence trappes ouvertes → jambes repliées **vers l'avant** (toutes les roues) →
      trappes fermées, ≈ 6 s ; touche dédiée, avertissement au-delà de 230 kt train sorti.
      Fait : `js/flight/GearSequence.js` (position unique de 0, rentré, à 1, sorti et verrouillé, en
      6 s ; trappes ouvertes sur le premier quart, jambes sur la moitié, trappes principales refermées
      sur le dernier quart, les petites trappes portées par les jambes restent ouvertes ; un nouvel
      ordre repart d'où il en est ; tests `tests/gearSequence.test.js`), tenue par `FlightModel.gear`
      et commandée par `controls.gear` (traînée `GEAR_DRAG` 0,02 selon la course des jambes,
      estimation). `js/aircraft/LandingGear.js` : charnières des trappes le long de leur bord
      intérieur (puits principaux) ou extérieur (train avant), trappe avant du modèle (d'une seule
      pièce, antenne comprise) coupée en deux sur l'axe ; jambe principale repliée vers l'avant et
      vers l'intérieur, tournée sur son axe pour coucher la roue à plat dans son puits (rangement
      estimé depuis la forme du puits, `MAIN_WHEEL_STOWED`, vérifié sans dépasser de la peau) ;
      contrefiche latérale orientée chaque frame vers son point d'attache sur la jambe ; jambe avant
      repliée de 90° vers l'avant ; train et puits masqués une fois rentré et trappes fermées.
      Touche `G` et bouton X de la manette (mode Simulation), le pilote automatique des plans de vol
      passe sur `U` ; HUD : `GEAR TRANSIT` / `GEAR DOWN`, en orange avec `SPEED` au-delà de 230 kt
      indiqués. Vérifié dans Chrome (page de test du modèle seul, puis en vol, vue orbite et HUD) ;
      +1 draw call (la seconde moitié de la trappe avant). Le mode Exploration garde le train rentré.
- [x] **G3.2** Physique au sol : 3 jambes ressort-amortisseur (principales ≈ 430 kN/m et 50 kN·s/m,
      avant ≈ 150 kN/m et 15 kN·s/m, course 0,3 m), cercle de frottement (μ 0,8 / 0,5), freins carbone
      (≈ 0,4 g), roue avant orientable (±75° au roulage, faible au-delà de 60 kt), résistance au
      roulement 0,02, effet de sol sous une envergure.
      Fait : `js/flight/GearContact.js` (chaque jambe : ressort et amortisseur le long de l'axe
      vertical de l'avion, butée raide au-delà de la course, pneu sur le plan du sol pris sur la pente
      autour de l'avion, glissements longitudinal et latéral proportionnels sous 0,2 et 0,3 m/s puis
      cercle de frottement μ 0,8 ; freins sur les roues principales, roue avant orientable jusqu'à 75°,
      braquage limité ensuite pour rester sous 3,5 m/s² d'accélération latérale : quelques degrés à
      30 kt, moins d'un au-delà de 60 kt ; vitesse des roues gardée pour leur rotation). Jambe avant
      raidie à 220 kN/m et 20 kN·s/m : à 150 kN/m elle talonnait au freinage. Freins calés à 0,7 sur
      les roues principales (avec antidérapage) pour les 450 m de roulage officiels : le transfert de
      charge sur la roue avant, qui ne freine pas, ne laissait que 0,36 g à 0,45. `FlightModel` :
      roues au sol, l'avion tourne physiquement (inerties estimées `INERTIA`, moments des roues,
      amortissement aérodynamique) et les commandes de vol passent en loi sol : vitesses de tangage
      (5°/s) et de roulis (30°/s) commandées dans la limite de l'autorité des gouvernes à la vitesse
      du moment (`GROUND_PITCH_CONTROL` calé pour lever le nez vers 120 kt), donc attitude tenue
      manche au neutre et nez qui redescend doucement après le toucher ; palonnier direct, stabilité
      de girouette. Au décollage, la loi en vol reprend depuis l'incidence et le roulis du moment.
      Effet de sol : traînée induite réduite (McCormick) sous une envergure. Centre de gravité estimé
      dans le modèle 3D (`AIRCRAFT_CG`, 12 % du poids sur la roue avant) : l'avion est maintenant
      dessiné autour de lui (décalé de 0,7 m vers le haut et 1,5 m vers l'avant par rapport au centre
      de sa boîte englobante). Mode Simulation : espace ou B freinent aussi les roues au sol ; au sol
      la visée souris garde les ailes à plat et oriente la roue avant vers le cap de la visée (le
      palonnier reste prioritaire). Visuel : amortisseurs qui s'enfoncent, roues qui tournent, roue
      avant braquée. `window.osf.startOnGround(x, z, cap)` pose l'avion à l'arrêt (en attendant le
      départ d'une piste de G3.4). Banc : trois cas au sol (tableau du banc de vérification) ; tests
      `tests/gearContact.test.js`. Vérifié dans Chrome à Genève (piste 05/23) : roulage, rotation à
      125 kt, décollage vers 150 kt ; le relief non aplani de la piste (±1 m, G3.5) secoue l'avion.
- [x] **G3.3** Contact et crash : points de structure (nez, saumons, tuyères, ventre), crash si contact
      de structure, si vitesse verticale > 3 m/s ou si le train est rentré ; écran de reprise.
      Fait : `STRUCTURE_POINTS` (14 points relevés dans le modèle 3D : pointe et menton du radôme,
      emports central et sous voilure, tuyères et crosse, missiles de saumon, dérive et verrière),
      `js/flight/GroundStrike.js` (premier point sous le sol et sa vitesse d'enfoncement ; le sol n'est
      lu que près des points à sa portée). Roues au sol : tuyères au sol vers 16° d'assiette, saumons
      vers 17° d'inclinaison. `GearContact.touchdownSink` : vitesse verticale d'une roue au moment où
      elle touche, crash au-delà de 3 m/s (`TOUCHDOWN_SINK_LIMIT`, 10 ft/s des chasseurs basés à terre).
      Train rentré ou en mouvement, les roues ne portent pas : la cellule touche (la queue d'abord, à
      l'incidence d'approche). `SimulatedFlight` s'arrête au crash (`crash` : partie, vitesse
      d'enfoncement, vitesse, train) jusqu'à la reprise ; l'ancien seuil de 1 m sous le centre de
      gravité est retiré. Écran de reprise `js/ui/CrashScreen.js` (style du menu) : cause en clair
      (atterrissage dur, train rentré, queue, saumon, ventre, nez, ou « Flew into the ground » au-delà
      de 6 m/s d'enfoncement), reprise en vol 1 500 m au-dessus (Entrée, A) ou au sol là où le vol
      avait commencé (Espace, B ; seulement après un départ au sol). Commande du train verrouillée
      sortie tant que les roues portent l'avion. Tests `tests/crash.test.js` ; vérifié dans Chrome à
      Genève (atterrissage dur, piqué dans le sol, deux reprises).
- [x] **G3.4** Données d'aéroports : `runways.csv` d'OurAirports (domaine public) découpé par tuile par
      le proxy, chargé autour de l'avion ; recherche d'aéroport dans le menu (décollage depuis une piste).
      Fait : `scripts/airports.js` (le serveur télécharge une fois `airports.csv` et `runways.csv` dans
      `cache/ourairports/`, les analyse et garde en mémoire les pistes ouvertes d'au moins 300 m dont
      les deux seuils sont localisés, aux aéroports pour avions : ≈ 18 000 pistes, presque tous les
      aéroports moyens et grands ; cap de chaque seuil recalculé vers l'autre, élévations et seuils
      décalés en mètres), routes `/api/airports?q=` (code OACI, IATA ou local, mots du nom, de la ville
      et des mots-clés, sans accents ; grands aéroports d'abord) et `/api/runways/{z}/{x}/{y}` (pistes
      dont le milieu est dans la tuile). `js/airports/Airports.js` : `RunwayCatalog` charge les tuiles
      z7 (≈ 310 km) sous l'avion et autour, vérifiées une fois par seconde (493 pistes autour de
      Genève) ; `searchAirports`. Menu, onglet World, section Airports : recherche, puis un bouton par
      seuil (« 04 · 3.9 km »). Départ : terrain rechargé autour d'un point 40 m après le début de la
      piste, avion tenu immobile (`SimulatedFlight.hold`) jusqu'à ce que le sol y soit chargé, puis
      posé sur ses roues dans l'axe (`placeOnGround`), point de reprise après un crash. Tests
      `tests/airports.test.js`. Vérifié dans Chrome : LSGG piste 04, cap 45,6° (46° publié), posé en
      3,9 s. Le serveur de l'utilisateur doit être relancé pour avoir les nouvelles routes.
- [x] **G3.5** Aplanir le terrain sous les pistes : distance signée au rectangle de piste dans le
      vertex shader du terrain, altitude interpolée entre les deux seuils, raccord smoothstep sur
      150–300 m ; **même fonction** pour l'altitude CPU (G0.4) et la physique au sol.
      Fait autrement que prévu : pas dans le vertex shader mais dans le worker d'altitude de
      three-tile, en enveloppant la fonction unique de la position sur le globe qui donne toutes les
      altitudes d'une tuile (`heights.ts`, `flattened`) : la grille, les profils de raccord, la
      surface du parent (morphing), les normales par pixel et l'altitude lue sur le CPU (physique,
      `groundHeight`) sont aplanies ensemble, et les tuiles voisines restent sans couture (seules
      les pistes à moins d'une tuile sont testées). Bande aplanie : la piste élargie à 150 m de part
      et d'autre de l'axe (75 m sous 1 200 m de long) et prolongée de 60 m à chaque bout, sur la droite
      entre les altitudes publiées des deux seuils ; raccord au relief par smoothstep sur 150 m
      autour. `TerrariumShaderLoader.setRunways` (worker informé, tuiles chargées ensuite),
      `GeoTerrainManager.setRunways`, alimenté par le catalogue des pistes ; les pistes d'un lieu sont
      chargées avant son terrain (démarrage, « Fly there », départ d'une piste, attente ≤ 3 s), et
      celles qui arrivent en vol sont à plus d'une tuile z7 (≥ ≈ 200 km), chargées avant que leur
      terrain fin ne le soit. Vérifié dans Chrome à Genève (04/22) : l'axe suit la droite publiée à
      1 cm près sur 3,9 km, plat à 100 m de l'axe ; décollage sans à-coup (inclinaison 0,0°,
      amortisseurs à ±0,01 m, contre ±4° et des écarts de 1 m auparavant). Le relief Terrarium est
      5 à 8 m sous l'altitude publiée autour de LSGG : léger remblai, ≈ 3 % de pente. Reste : tuiles
      chargées avant que leurs pistes soient connues (aucun cas courant) non rechargées.
- [x] **G3.6** Pistes et marquages procéduraux (OACI Annexe 14) calculés dans le shader en coordonnées
      piste : barres de seuil selon la largeur, numéros, point de visée, zone de toucher, axe.
      Fait : `js/terrain/RunwayMarkings.js`, peint dans la couleur du terrain avant l'éclairage (un
      nœud partagé par toutes les tuiles, sur l'imagerie satellite seulement) : ombres, courbure et
      perspective aérienne du sol. Les 8 pistes revêtues les plus proches de la caméra (à moins de
      30 km, choisies à chaque kilomètre parcouru) passent en uniformes (extrémités en mètres monde,
      donc exactes malgré l'échelle de Mercator, largeur, revêtement, désignations, seuils décalés) ;
      seuls les fragments sur une piste calculent ses marquages. Revêtement asphalte ou béton mêlé à
      25 % d'imagerie ; barres de seuil (2 à 8 par côté selon la largeur, à 3 m des bords, 27 m de
      l'axe au plus), numéro à 12 m (glyphes à segments de 3 × 9 m, zéro initial gardé : « 04 »),
      lettre L/C/R, point de visée (300 ou 400 m selon la longueur), paires de zone de toucher tous
      les 150 m (3-3-2-2-1-1 barres, autant que la longueur le permet, aucune sur le point de visée),
      axe en tirets de 30 m (intervalles 20 m), bandes latérales ; chaque moitié est marquée depuis
      son seuil. Antialiasés sur l'empreinte du pixel en travers de la piste (dérivées écran
      projetées : les vues rasantes étirent les pixels le long de la piste, pas en travers), estompés
      de 1,5 à 5 m par pixel. Pistes non revêtues (herbe, terre…) laissées à l'imagerie ; zone avant
      un seuil décalé revêtue sans flèches. Coût GPU (A/B sur la même vue, 0 ou 2 pistes passées au
      shader, GPU saturé) : 2,41–2,46 contre 2,44–2,48 ms aligné au seuil, 2,80–2,82 contre
      2,77–2,80 ms en survol : non mesurable. Vérifié dans Chrome (LSGG), puis par l'utilisateur à CDG.
      Ajout à sa demande : autour des pistes (1,5 km autour de leurs extrémités) les tuiles descendent
      jusqu'au zoom 18 de l'imagerie (≈ 0,6 m par pixel), le reste du terrain s'arrête au 15 hors mode
      hi-res : `TileMap.maxLevelOf(x, y, z)` dans three-tile (niveau maximal par tuile, lu par
      l'évaluation du LOD), zones tirées des pistes du catalogue (`GeoTerrainManager.setRunways`). À
      CDG 09L, aligné : 22 tuiles en 18, 13 en 17, 19 en 16 ; à 9 km, plus rien au-delà de 15. Coût en
      A/B sur la même vue (GPU saturé) : 3,96–4,11 ms et 528 draw calls contre 3,53–3,57 ms et 489 :
      ≈ +0,45 ms près du sol sur un aéroport, rien ailleurs.
- [x] **G3.7** Balisage instancié dans la passe de halo : seuil vert, extrémité rouge, axe et bords
      blancs (codes de fin de piste), rampe d'approche, PAPI (4 unités, 2°30′ à 3°30′, couleur selon
      l'angle de l'œil).
      Fait : `js/airports/RunwayLights.js` (halos instanciés, un draw call, attributs d'instance :
      WebGPU n'accepte que 8 tampons de sommets, d'où l'angle PAPI rangé avec l'axe et le plan sans
      normale) et `js/airports/runwayLightLayout.js` (disposition, testée sous Node : feux de bord
      tous les 60 m, jaunes sur les 600 derniers mètres dès 1 800 m ; axe tous les 30 m dès 2 000 m,
      rouge et blanc alternés sur les 900 derniers mètres, rouge sur les 300 derniers ; seuil vert vers
      l'approche, rouge de fin vers la piste, feux de fin propres quand le seuil est décalé ; rampe
      d'approche de 900 m avec barre transversale à 300 m dès 2 000 m ; PAPI à gauche, 300 m après le
      seuil). Couleur et intensité selon le côté d'où l'on voit le feu, plus forte dans l'axe de la
      piste ; PAPI blanc au-dessus de son angle, rouge en dessous (transition sur 3′). Pistes éclairées
      seulement (`lighted` d'OurAirports), les 8 plus proches à moins de 40 km ; allumés quand le soleil
      descend sous 6° (pleins à 0°) ou par visibilité inférieure à 5 km ; abaissés par la courbure
      comme le terrain. Halos d'au moins 4 pixels qui s'atténuent avec leur taille (et non leur aire :
      en 1/taille², les pistes disparaissaient à 5 km). Test d'occultation avec une tolérance qui
      croît avec la distance (0,5 m + 0,4 %) : lue au centre du halo, que le jitter du TAA déplace
      d'un demi-pixel sur le sol juste devant un feu posé à 0,4 m, la profondeur cachait les feux
      lointains une image sur deux (PAPI ternes ou absents). Vérifié dans Chrome de nuit à LSGG
      (approche à 3° : PAPI 2 blancs 2 rouges, 4 blancs au-dessus, 4 rouges en dessous) et à CDG,
      éteints de jour. Coût (865 feux, A/B, GPU saturé) : 2,76–2,88 contre 2,75–2,79 ms, dans le
      bruit. Les lumières de ville (Black Marble) font de grandes taches floues au sol près des
      aéroports, de nuit : défaut existant, hors de ce lot.
- [x] **G3.8** Guidage d'approche sur le HUD : pente de 3°, écarts d'alignement et de pente calculés
      depuis le seuil, PAPI virtuel ; pilote automatique de cap et d'altitude.
      Fait : `js/flight/ApproachGuide.js` (testé sous Node) choisit le seuil vers lequel l'avion vole
      (route à moins de 45° de l'axe, à moins de 35° de l'axe vu de la piste, jusqu'à 25 km avant le
      seuil et 1,5 km au-dessus de la piste) et donne la distance au seuil, la hauteur au-dessus de
      lui, l'écart d'alignement vu de l'extrémité opposée (comme l'antenne d'un localizer, pleine
      échelle 2,5°), l'écart à un plan de 3° visant 300 m après le seuil (pleine échelle 0,7°) et un
      PAPI virtuel. HUD (mode Simulation, train commandé sorti ou à moins de 600 m au-dessus du
      seuil) : « LSGG 04 4.6 km 3.0° » et le PAPI au-dessus du centre, échelle de pente à droite,
      d'alignement dessous, à deux points de part et d'autre. Pilote automatique (`C`) : tient le cap
      et l'altitude du moment en posant la visée de l'instructeur sur le cap et sur la pente qui
      rattrape l'écart d'altitude en 20 s (±8° au plus) plus l'incidence ; tout mouvement du manche
      ou de la visée, ou le contact du sol, le déconnecte ; affiché « AP 046° 1500 m » sur le HUD.
      Tests `tests/approachGuide.test.js`, `tests/autopilot.test.js` (virage de 30° et montée de
      300 m : cap à 0,0°, altitude à 15 m). Vérifié dans Chrome en approche sur LSGG 04 (sur le plan,
      à droite et bas, à gauche et haut).

## Lot G4 — Radar de nuit : relief devant l'avion

- [ ] **G4.1** Mosaïque d'altitude autour de l'avion (≈ ±80 km, 1024² float) assemblée depuis les
      cartes décodées sur le CPU, recentrée quand l'avion se déplace ; masque d'eau et zones bâties
      (lumières de ville déjà chargées) pour la réflectivité.
- [ ] **G4.2** Compute shader « radar » : un thread par azimut (±60–70°, 256–512 rayons), boucle sur les
      cases de distance (512–1 024) ; ombres par balayage de l'angle d'horizon ; rétrodiffusion à gamma
      constant (σ0 = γ·sin ψ : ville −5 dB, forêt −10 à −15 dB, herbe −20 dB) ; eau et pistes noires ;
      speckle fixé au monde ; flou de faisceau croissant avec la distance (≈ 3,5° en faisceau réel) ;
      écriture dans une texture polaire. Repli WebGL2 en fragment shader (une colonne par azimut).
- [ ] **G4.3** Affichage PPI dans un écran multifonction en incrustation (style visu tête moyenne) :
      ligne de balayage, rémanence (ping-pong avec décroissance), échelles de distance, gain.
- [ ] **G4.4** Affinage Doppler (DBS) hors d'un cône de ±10° autour du vecteur vitesse ; zoom SAR sur
      un carré fixe.
- [ ] **G4.5** Mode texture « TAWS » (couleur selon la hauteur du relief par rapport à l'avion, seuils
      EGPWS) au même niveau que les modes SAR et Élévation, pour la vue 3D de nuit.
- [ ] **G4.6** Suivi de terrain : coupe de profil (E-scope) sur 10 km devant l'avion avec le gabarit
      « tremplin », hauteur de consigne 200–2 000 ft, ordres de cabrer / piquer au HUD, puis pilote
      automatique de suivi de terrain branché sur les commandes de vol.

## Lot G5 — Entités, cibles et missiles

- [ ] **G5.1** Modèle de vol simplifié pour l'IA (masse ponctuelle commandée en roulis, g et poussée,
      limites dépendant de la pression dynamique, même atmosphère) ; évitement du relief par sondes à
      5–10 s ; IA à 10–20 Hz décalée entre agents.
- [ ] **G5.2** Cibles minimales : drones-cibles non manœuvrants, chasseur ennemi IA (missiles IR et
      radar, leurres, évasion), site sol-air fixe (radar + lanceurs, zone de 20–40 km), cibles au sol
      statiques (bâtiment, char, navire).
- [ ] **G5.3** Détection air-air simplifiée du radar (portée selon la surface équivalente radar, cône
      ±70°), liste de pistes, désignation de cible ; alerte radar et alerte départ missile chez le
      joueur.
- [ ] **G5.4** Missile à 3 degrés de liberté : poussée par phases (MICA : accélération puis entretien ;
      Meteor : accélérateur ≈ 3 s puis statoréacteur à débit réglé), traînée `Cd0(M) + k·Cl²`, facteur
      de charge max selon la pression dynamique (MICA 50 g sous 7 km, 30 g vers 12 km), masse
      variable, intégration au pas fixe.
- [ ] **G5.5** Guidage : navigation proportionnelle vraie (N = 4), PN augmentée en terminal, trajectoire
      en cloche pour le Meteor, mi-course par liaison de données puis accrochage de l'autodirecteur
      (LOAL) ; autodirecteur avec cône d'accrochage, limite de cardan, vitesse de poursuite ; leurres
      (probabilité de leurrage, plus faible pour un autodirecteur imageur).
- [ ] **G5.6** Fusée de proximité sur le segment parcouru pendant le pas (pas la seule position
      finale), rayon 10–20 m, probabilité de destruction selon la distance de passage, collision avec
      le relief.
- [ ] **G5.7** Lancement : les maillages MICA et Meteor du glTF deviennent des entités ; départ sur rail
      (bouts d'aile) ou éjection avec chute de ≈ 0,4 s puis allumage (fuselage).
- [ ] **G5.8** Effets : flamme du moteur fusée dans la passe de halo, traînée en ruban (points tous les
      20–50 m, élargissement, dérive au vent, 10–30 s), traînée courte et légère pour les propergols à
      fumée réduite (Meteor, MICA NG), explosion (boule de feu, fumée, débris, flash pris par
      l'exposition). Évaluer `three.quarks/webgpu` (MIT) contre une implémentation maison.
- [ ] **G5.9** HUD et son : boîte de cible, enveloppe de tir (Rmax, NEZ, Rmin), temps avant impact par
      missile, grognement d'acquisition IR et tonalité de verrouillage, alarme départ missile.
- [ ] **G5.10** Air-sol : AASM (guidage GPS/INS, plané puis piqué terminal), GBU-12 (laser, PN vers la
      tache), Exocet (rase-mer) contre les cibles de G5.2.

## Lot G6 — Drones de combat

- [ ] **G6.1** Drone générique en aile volante (modèle CC-BY, sans forme ni nom de marque), 2 à 4
      drones ; caractéristiques d'un ailier « loyal wingman » (Mach 0,85–0,9, 7–9 g, 500–1 000 kg
      d'emport), même modèle de vol que l'IA de G5.1.
- [ ] **G6.2** Formation : positions dans le repère du leader (finger-four, échelon, ligne de front),
      anticipation `slot + v_leader·τ`, correcteurs PD (écart latéral/vertical → roulis et g, écart
      longitudinal → vitesse), séparation de Reynolds entre drones.
- [ ] **G6.3** Machine à états par drone : rejoindre → transit → en station (hippodrome) → engagement →
      dégagement → retour ; score utilitaire pour le choix des cibles et la réaction aux menaces.
- [ ] **G6.4** Types et missions :
      - **Escorte** : couvre le leader, engage les chasseurs qui le menacent (missiles air-air).
      - **SEAD** : détecte et frappe les sites sol-air.
      - **Reconnaissance** : vole en avant et révèle les cibles sur le HUD et le radar.
      - **Brouillage** : réduit la portée de détection des radars ennemis dans un secteur.
      - **Leurre** : attire les tirs ennemis.
- [ ] **G6.5** Commandes du joueur (menu radial ou touches 1–4, inspiré du menu radio de DCS) :
      couvre-moi, attaque ma cible, attaque les défenses, éclaire en avant, rejoins la formation,
      retour à la base ; affectation d'une mission par drone dans le menu avant le vol.
- [ ] **G6.6** Scénario de mission minimal sur le vrai relief : zone d'objectif, un site sol-air, deux
      chasseurs ennemis, cibles au sol ; décollage depuis une base et retour (G3).

---

## Décisions

| Date | Sujet | Décision | Raison |
|---|---|---|---|
| 2026-11-26 | Touche du train | `G` sort et rentre le train (convention des simulateurs), bouton X de la manette ; le pilote automatique des plans de vol passe de `G` à `U` | Choix de l'utilisateur |
| 2026-11-25 | Ordre avec le rendu | G0, G1 et G2 d'abord, puis alterner lots de vol et lots de rendu | Les fondations du vol conditionnent tout le reste et les jets donnent un effet visible vite |
| 2026-11-25 | Niveau de réalisme | Simulation « carefree » : physique calée sur les chiffres réels, commandes de vol électriques qui protègent l'avion | Fidèle au vrai Rafale et facile à piloter |
| 2026-11-25 | Vol libre actuel | Conservé comme mode Exploration | Voyage rapide, vues de référence ; le benchmark garde de toute façon sa trajectoire imposée |
| 2026-11-25 | Périphériques | Souris + clavier (« mouse aim » par défaut) et manette (Gamepad API, mapping standard) ; pas de HOTAS pour l'instant | Choix de l'utilisateur ; la couche d'entrée unique de G0.3 laisse la porte ouverte |
| 2026-11-25 | Rotation de la cellule | Imposée par les commandes de vol (suivi de la trajectoire + corrections d'incidence, de roulis et de dérapage, sous limites d'accélération angulaire) plutôt que par des tables de moments | Aucune donnée de moments du Rafale n'est publique ; les commandes de vol électriques masquent de toute façon la dynamique naturelle ; réponses calées sur les chiffres d'essai |
| 2026-11-25 | Poussée | Chute de poussée de Mattingly (turbofan à faible taux de dilution, PC) + perte en air raréfié | Donne d'elle-même les vitesses max publiées à 11 km et au sol (même température totale d'entrée) et un plafond de 17 km |
| 2026-11-25 | Lumière de PC | Réglage « Afterburner light », activé par le preset Ultra seulement | Elle coûte 0,1 à 0,2 ms même éteinte (évaluée par chaque fragment éclairé) ; l'ajouter à l'allumage de la PC recompilerait tous les matériaux |
| 2026-11-25 | Rendu de la flamme | Volume intégré le long de la ligne de vue (12 à 24 échantillons) et disques de Mach intégrés en forme fermée | 4 fois moins cher qu'un échantillonnage fin des diamants, sans bandes ni bruit |
| 2026-11-25 | Contact avec le sol | Crash (redémarrage 1 500 m au-dessus) en attendant le train et la physique au sol de G3 | Évite de voler sous le relief sans préjuger de G3 |

### Encore ouvert

| Sujet | Options | Recommandation |
|---|---|---|
| Combat | Scénarios fictifs sur le vrai relief | Ennemis génériques, sans pays ni insignes réels |
| Licence du modèle Rafale | Licence Royalty Free de CGTrader (confirmée le 2026-11-25). Ses conditions (§ 21A.1, 21A.3, 21A.6) interdisent de redistribuer le fichier tel que téléchargé et demandent d'empêcher l'utilisateur final d'y accéder, sans exception pour l'open source ; or `Rafale.gltf` et `Rafale_texture.png` sont versionnés dans un dépôt GitHub public | Retirer le modèle du dépôt (téléchargé par chaque utilisateur et converti par un script), ou le remplacer par un modèle CC-BY/CC0 ; la réécriture de l'historique déjà poussé est une décision à part |

## Données de référence

Statuts : **[off]** Dassault/Safran/MBDA/Thales, **[FT]** essai en vol Flight International,
**[sec]** source secondaire (Wikipédia, presse), **[est]** estimation ou calcul, **[faible]** forum.

### Rafale — cellule et performances

- Envergure 10,90 m, longueur 15,30 m, hauteur 5,30 m [off] ; surface alaire 45,7 m² [sec].
  https://www.dassault-aviation.com/en/defense/rafale/specifications-and-performance-data/
- Masse à vide « classe 10 t » [off] (C ≈ 9 500 kg, B ≈ 9 770, M ≈ 10 196 [sec]) ; typique 15 t [sec] ;
  MTOW 24,5 t [off] ; carburant interne 4,7 t, externe jusqu'à 6,7 t, charge externe 9,5 t [off].
- Mach 1,8 / 750 kt [off], Mach 1,1 au sol [sec] ; plafond 50 000 ft [off], 55 000 ft [FT].
- Facteur de charge −3,2 / +9 g [off, FT] ; FCS à demande de g, +9 g et 29° en air-air, +5,5 g et 20°
  en charges lourdes [FT] ; limiteur d'incidence ≈ 28° (module DCS) [faible].
  https://www.flightglobal.com/flight-test-dassault-rafale-rampant-rafale/90047.article
- Roulis stabilisé 270°/s à 350 et 450 kt [FT] ; virage instantané ≈ 30°/s à Mach 0,5, soutenu
  ≈ 23,9°/s à Mach 0,6 au niveau de la mer, 50 % de carburant [faible].
- Accélération 200 → 500 kt à 5 000 ft, PC, 1,8 t de carburant : ≈ 30 kt/s [FT, douteux] : il
  faudrait un rapport poussée/poids ≈ 1,6 en vol, hors de portée de 2 × 75 kN pour ≈ 12,7 t ; le
  modèle met 16 s (≈ 19 kt/s), toléré par le banc.
- Approche < 120 kt [off], 125 kt à 16° d'incidence pour 15 t [FT] ; rotation à 125 kt ≈ 9 s après le
  lâcher des freins (16,1 t, PC) [FT] ; roulage à l'atterrissage 450 m sans parachute [off] ; train
  sorti ≤ 230 kt [FT] ; pas de décrochage franc, < 50 kt tenus en essais [FT].
- Gouvernes : 2 canards, 4 becs, 4 élevons, 1 gouverne de direction, pas d'aérofrein dédié [FT] ;
  débattements non publiés (valeurs de G1.5 estimées).
- Calage [est] : CLmax ≈ 1,65–1,7 vers 29° (9 g à 170 m/s pour 15 t) ; pente de portance effective
  ≈ 4,5 /rad à l'approche ; CD0 ≈ 0,02 subsonique, ≈ 0,04 vers Mach 1,1.

### Moteur M88-2

- 50 kN à sec, 75 kN avec PC [off] ; débit d'air 65 kg/s, dilution 0,3, rapport de pression 24,5,
  TET 1 850 K ; consommation 22,1 g/(kN·s) à sec, 47,1 avec PC ; diamètre 0,696 m, masse 897 kg [sec].
  https://en.wikipedia.org/wiki/Snecma_M88
- Tuyère convergente à section variable, à volets [off] ; ralenti → PC plein en 4 s à toute altitude [FT].
- M88-4E : même poussée ; T-REX (F5) ≈ 88 kN avec PC [sec].
- Jet [est] : NPR ≈ 3,5 → Mj ≈ 1,47 ; espacement des diamants `L ≈ 1,306·D·√(Mj² − 1)` (Prandtl,
  π/2,405) ou K ≈ 1,15–1,3 (Pack) → 0,8–1,0 m ; premier disque de Mach à `x ≈ 0,67·D·√(P0/Pa)`.
  https://doi.org/10.12762/2014.AL07-06
- Couleur : bleu-violet par chimiluminescence (CH, C₂), faible, visible au crépuscule et de nuit ;
  orange-jaune par les suies, plus lumineux.
  https://migflug.com/afterburner/afterburner-flame-colour-blue-orange-russian-american-myth/
- Modèle du jet (`js/flight/exhaust.js`) [est] : rapport de pression de tuyère au banc 1,3 au ralenti
  → 3,5 au plein sec, multiplié par la compression dynamique `(1 + 0,2M²)^3,5` ; γ = 1,4. Tuyère
  convergente, donc jet sous-détendu au-delà d'un rapport de 1,89 : Mj = 1,47 au banc, 1,9 à Mach 0,9.
  Disque de Mach à `0,67·D·√(P0/Pa)` (Crist, Sherman et Glass, AIAA J. 4(1), 1966). Diamètre de
  sortie 0,62 m au ralenti (tuyère ouverte pour réduire la poussée de ralenti, estimé), 0,55 au plein
  sec, 0,68 en PC. Intensité lumineuse des deux flammes au plein : ≈ 160 000 cd (≈ 20 000 cd/m² sur
  ≈ 8 m² vus de côté, estimé).

### Train et sol

- Tricycle Safran Landing Systems ; principal 790×275-15 (une roue par jambe), avant 2 × 360×135-6
  orientables ; **toutes les roues se replient vers l'avant** [sec] ; freins carbone sur les trois
  atterrisseurs ; roue avant ±75–78° [sec] ; vitesse verticale admissible 3 m/s (6,5 m/s pour le M).
  https://janes.migavia.com/fra/dassault/rafale.html
- Voie et empattement non publiés : à mesurer sur le glTF (roues principales à x = ±1,49 m, z ≈ −2,07 m ;
  roue avant à z ≈ 2,72 m, repère du modèle).
- Durée de rentrée et séquence des trappes non publiées.
- Référence JSBSim F-16 (≈ 7,9 t à vide) : principal 547 kN/m, 109 kN·s/m ; avant 252 kN/m,
  62 kN·s/m ; μ 0,8 / 0,5, roulement 0,02.
  https://raw.githubusercontent.com/JSBSim-Team/jsbsim/master/aircraft/f16/f16.xml

### Aéroports et pistes

- OurAirports `runways.csv` : seuils (lat, lon, élévation, cap vrai), longueur, largeur, revêtement,
  balisage, seuils décalés ; ≈ 48 000 lignes ; **domaine public**.
  https://github.com/davidmegginson/ourairports-data
- OSM `aeroway=*` : ODbL ; Overpass public limité (≈ 10 000 requêtes/jour). X-Plane `apt.dat` : GPL,
  à éviter.
- Terrarium : SRTM 30 m hors États-Unis, erreur ≈ 9–16 m au seuil de 90 % : l'aplanissement des pistes
  est indispensable.
- Annexe 14 : barres de seuil 4/6/8/12/16 pour 18/23/30/45/60 m de large ; point de visée à
  150/250/300/400 m selon la distance disponible ; marques de zone de toucher tous les 150 m ; axe en
  traits de 30 m et intervalles de 20 m. PAPI 2°30′, 2°50′, 3°10′, 3°30′.

### Radar RBE2-AA

- Bande X, AESA (≈ 838 modules), antenne ≈ 600 mm [sec] ; azimut ±70° [sec] ; portée air-air > 200 km
  (Dassault, cité) ; modes air-sol : cartographie à faisceau réel, DBS, SAR, GMTI, mer, télémétrie ;
  cartes 3D temps réel pour le suivi de terrain [off].
  https://www.dassault-aviation.com/en/defense/rafale/detect-and-pursue/
- Suivi de terrain : base de données terrain + radar, consigne 200–2 000 ft, 400–600 kt, 3 lois
  (souple, moyen, dur), profil sur 10 km [sec]. https://rafalefan.e-monsite.com/pages/dossier-rafale-avionique/rbe2.html
- Résolution [est] : distance ≈ 15 m (10 MHz) ; transverse en faisceau réel ≈ R·3,5° (1,2 km à 20 km).
- TAWS (EGPWS) : rouge > 2 000 ft au-dessus, jaune de −500 à +2 000 ft, vert −500 à −2 000 ft,
  noir en dessous. https://lso.fe.uni-lj.si/literatura/Razno/Avionika/radar/EGPWS.pdf

### Armes

| Arme | Masse / longueur | Propulsion | Vitesse | Portée | Guidage |
|---|---|---|---|---|---|
| MICA IR/EM | 112 kg ; 3,1 m | poudre | Mach 4 | 60–80 km, min 500 m | inertiel + liaison, IR imageur ou radar actif, LOBL/LOAL ; 50 g |
| MICA NG | 112 kg ; 3,1 m | double impulsion, fumée réduite | > Mach 4 | +40 % (MBDA) | AESA ou IR matriciel |
| Meteor | 190 kg ; 3,7 m | accélérateur puis statoréacteur réglable (relais vers Mach 1,8) | > Mach 4 | 120–200 km, NEZ ≥ 60 km | radar actif + liaison bidirectionnelle |
| AASM Hammer 250 | ≈ 340 kg ; 3,1 m | accélérateur fusée | — | > 70 km en altitude, > 15 km bas | INS/GPS (+ IR ou laser) |
| Exocet AM39 | 670–870 kg | accélérateur + croisière | Mach 0,93 | 50–70 km | inertiel puis radar actif, rase-mer |
| GBU-12 / 24 | ≈ 230 / 1 050 kg | planante | — | ≈ 15 / > 17 km | laser semi-actif |

Sources : https://en.wikipedia.org/wiki/MICA_(missile), https://www.mbda-systems.com/media/19279/download,
https://en.wikipedia.org/wiki/Armement_Air-Sol_Modulaire. Lancement : MICA de fuselage éjectés
(jusqu'à 4 g), MICA de voilure sur rail (jusqu'à 9 g), Meteor éjectés.
Guidage : Zarchan, *Tactical and Strategic Missile Guidance* (AIAA) ; PN `n_c = N'·Vc·λ̇`, N' = 3–5 ;
en 3D `a = N·Vc·(ω × LOS)` avec `ω = (r × v_rel)/|r|²`. Code ouvert MIT :
https://github.com/AlexF0643/missile-intercept-tracker, https://github.com/PSamuele/3D_Missile_Intercept_Simulator.

### Drones de combat

- nEUROn : 9,5 m, 12,5 m d'envergure, 7 t, Adour 40 kN, ≈ 980 km/h, 2 × 250 kg en soute [sec].
- Drone de combat du Rafale F5 : lancé en 2024, service visé vers 2033, furtif, soute interne, M88,
  SEAD contrôlée depuis un Rafale [off].
  https://www.dassault-aviation.com/en/group/press/press-kits/unmanned-combat-aerial-vehicle-program-kicks-off-as-part-of-the-rafale-f5-standard/
- Ailiers fidèles : YFQ-42A, YFQ-44A Fury (≈ Mach 0,95, 9 g), MQ-28 Ghost Bat (11,7 m, 5,4 t,
  > 3 700 km), XQ-58 Valkyrie (Mach 0,86, 2 × 272 kg), Kızılelma (8,5 t, 1 500 kg d'emport) [sec].
- Rôles : escorte / CAP, SEAD/DEAD, brouillage, ISR, leurre, frappe, « camion à munitions », piquet
  radar.
- Modèles 3D : aile volante générique CC-BY
  https://sketchfab.com/3d-models/drone-uav-wing-desert-camo-8bc447e8df0f48fe8b83d4122eb2d460 ;
  missiles CC-BY sur Sketchfab ; modèle nEUROn de Sketchfab en CC-BY-NC, à éviter.

### Bibliothèques et code utiles

| Projet | Usage | Licence |
|---|---|---|
| `@aeronautic/afterburner` (Romainlg29) | jet volumétrique TSL / WebGPU | MIT |
| three.quarks (`three.quarks/webgpu`) | particules, traînées, explosions | MIT |
| Yuka | steering, machines à états, perception | MIT (à confirmer) |
| JSBSim (WASM : @0x62/jsbsim-wasm) | modèle de vol complet, option future | LGPL-2.1 |
| Mirage 2000 / Eurofighter JSBSim | coefficients de référence | GPL : ne pas reprendre |
| F-16 Stevens & Lewis (F16Model.jl…) | tables aérodynamiques de référence | MIT (Julia) |

## Mesures

Preset High, écran intégré 120 Hz, mêmes protocoles que `docs/rendering-roadmap.md`.

| Date | État | Vues : coût GPU (ms) 1 / 2 / 3 / 4 / 5 / 6 | Vol plan 1 : FPS · p5 · p1 · images lentes | Notes |
|---|---|---|---|---|
| 2026-11-24 | Référence (clôture du lot 3 : `lot3-cap2`, `lot3`) | 3,44 / 3,43 / 3,49 / 3,40 / 3,80 / 3,48 | 119,2 · 105,3 · 64,1 · 1 | |
| 2026-11-25 | G0 (`benchmarks/render/g0`) | 3,45 / 3,44 / 3,51 / 3,40 / 3,81 / 3,54 | 119,5 · 103,1 · 65,4 · 0 | Draw calls identiques ; écarts dans le bruit (± 0,4 ms) |
| 2026-11-25 | G1 (`benchmarks/render/g1`, puis `g1-cap2`) | 3,44 / 3,43 / 3,50 / 3,87 / 3,94 / 3,68, puis 3,48 / 3,86 / 3,94 / 3,60 / 4,39 / 3,55 | 119,4 · 105,3 · 64,9 · 1 | Draw calls identiques ; les écarts changent de vue d'une série à l'autre (machine chaude après une longue série de mesures) : bruit thermique, le rendu n'a pas changé. À remesurer machine froide en début de G2 |
| 2026-11-25 | G1, remesuré (`g1-cold`) et en alternance avec G0 servi par un worktree (`ab-g0-*`, `ab-g1-*`) | 3,44 / 3,85 / 3,50 / 3,54 / 4,32 / 3,70 ; en alternance G0 3,44 / 3,43 / 3,50 / 3,40 / 3,79 / 3,48 et G1 3,44 / 3,44 / 3,50 / 3,86 / 3,79 / 3,48 | | Les sauts de +0,4 ms touchent aussi G0 d'une série à l'autre : bruit (paliers d'horloge du GPU), G1 ne coûte rien |
| 2026-11-25 | G2, preset High (`ab2-3002-*` ; vol : `g2-flight`) | 3,44 / 3,44 / 3,50 / 3,41 / 3,79 / 3,48 (deux séries) | 119,3 · 105,3 · 61,0 · 0 | Identique à G0 ; une série isolée (`g2-exhaust`) avait donné 5,14 ms sur la vue 5 : bruit. Vol : PC visible tout le trajet (trajectoire imposée au-delà de 300 m/s), p1 à −6 % de G1 |
| 2026-11-25 | G2, brume de chaleur active (`haze-true-*`) et coupée (`haze-false-*`), en alternance ; vol : `g2-haze-flight` | Active : 3,55 / 3,52–3,70 / 3,59–3,85 / 3,68–3,99 / 3,89–4,09 / 3,59–3,71 ; coupée : 3,44 / 3,43–3,44 / 3,50 / 3,40–3,86 / 3,79–4,32 / 3,48 | 119,2 · 105,3 · 60,2 · 1 | ≈ +0,1 ms sur chaque vue (passe de décalages et lectures décalées dans la passe d'atmosphère) ; vol p1 à −7 % de G1 |
| 2026-11-25 | G2, lumière de PC présente et éteinte (`ab3-3002-*`) | 3,53 / 3,61–4,02 / 3,67–3,73 / 3,50–3,96 / 3,94–4,27 / 3,58–4,07 | | +0,1 à +0,2 ms sur chaque vue, d'où le réglage réservé à Ultra |

Vérifications de G2 dans Chrome (`?dev=1`, caméra placée autour de l'avion par un crochet
temporaire) : à sec, tuyères fermées et pas de flamme ; en PC pleine, flamme de 8 m, diamants
nets, gaine violette de nuit, masquée par la cellule vue de l'avant ; coût de la flamme dans le pire
cas (vue arrière à 11 m) +0,14 à +0,21 ms ; son : graphe audio créé au premier clic, fréquence de la
soufflante 2,7 kHz au ralenti → 3,8 kHz au plein, voie de PC ouverte en PC, coupé au menu ; aucune
erreur console (hors verrouillage du pointeur refusé à l'automatisation).

Vérifications de G0 dans Chrome (`?view=1`, manette simulée en disposition standard) : avance au
clavier 1 120 m en 2,0 s simulées (560 m/s, la vitesse réglée) ; demi-gâchette 280 m/s ; manche à fond
1 s : cap −1,21 rad (1,2 rad/s attendu) ; Y bascule en vue cockpit, Menu ouvre les réglages ; altitude
du sol connue sur 169 points à ±3 km (720 à 2 238 m), 979 m sous l'avion contre 969 m en z12 ; aucune
erreur console.

### Banc de vérification de G1 (`npm run flight:bench`, 2026-11-25)

Masse : base + emports + moitié du carburant interne (13,25 t) sauf mention.

| Cas | Modèle | Cible | Source |
|---|---|---|---|
| Virage instantané, niveau de la mer, Mach 0,5 | 29,5°/s (9 g) | 30 ± 3 | estimation |
| Virage soutenu, niveau de la mer, Mach 0,6 | 23,5°/s (8,6 g) | 23,9 ± 2 | estimation |
| Vitesse max à 11 000 m | Mach 1,82 | 1,8 ± 0,08 | officiel |
| Vitesse max au niveau de la mer | 714 kt | 750 ± 50 | officiel |
| Plafond pratique (100 ft/min) | 17 000 m | 16 000 ± 1 300 | officiel 15 240, essai 16 760 |
| Approche, 16° d'incidence, 15 t | 127 kt | 125 ± 8 | essai |
| Accélération 200 → 500 kt, 5 000 ft | 16,0 s | 10 ± 8 | essai, douteux |
| Traction pleine à Mach 0,6 : temps jusqu'à 8,5 g / pic | 0,70 s / 9,09 g | 0,7 ± 0,5 / 9 ± 0,3 | limite officielle |
| Roulis plein à 430 kt : 360° | 1,51 s | 1,45 ± 0,25 | essai 270°/s |
| Poussée pleine : facteur de charge mini | −3,37 g | −3,2 ± 0,3 | limite officielle |
| Traction pleine lente : incidence max (q > 1 500 Pa) | 29,6° | 29 ± 1 | limite d'essai |
| Manche au neutre 30 s / inclinaison 45° 20 s : écart d'altitude | +7 m / +13 m | 0 ± 30 / ± 40 | tenue de trajectoire |
| Lâcher des freins → 125 kt, PC, 16,1 t (ajouté avec G3.2) | 9,55 s | 9 ± 1,5 | essai |
| Course au décollage, PC, rotation à 125 kt (décollage à 160 kt) | 394 m | 400 ± 100 | officiel |
| Roulage à l'atterrissage (approche 2,5° à 125 kt, freins et aérofrein) | 446 m | 450 ± 80 | officiel, sans parachute |

Instructeur de visée revu le 2026-11-25 après les essais de l'utilisateur (l'avion se mettait sur le
dos puis oscillait en pendule) : il roulait sur le dos dès qu'on visait plus de 15° sous le nez, son
roulis cible de ±180° changeait de signe au moindre écart latéral, et il mélangeait entre 8° et 20°
de la visée deux cibles opposées (sur le dos pour tirer, ailes à plat). Désormais : visée presque
sous le plancher (à 40° près) et moins de 40° sous les ailes, il pousse sans rouler ; sinon il roule
pour mettre la visée au-dessus de la verrière et tire, sans jamais pousser loin de la visée ; sur le
dos, il ne revient à l'endroit qu'une fois le nez à moins de 3° de la visée ; le sens d'un roulis de
±180° est gardé ; l'inclinaison latérale près de la visée suit l'écart angulaire (écart de cap ×
cos de l'assiette visée). Tests `tests/mouseAim.test.js`. Mesures (balayage de la visée en 0,3 s,
puis visée à moins de 3°) :

| Visée | Avant | Après |
|---|---|---|
| 20° dessous | 6,1 s, inclinaison 96° | 2,5 s, 0° |
| 30° dessous | 8,8 s, 172°, 4 inversions de roulis | 3,4 s, 0° |
| 60° dessous | 13,9 s, 180°, 8 inversions | 3,5 s, 180° (demi-tonneau), 1 inversion |
| 20° droite, 20° dessous | 7,6 s, 131°, 5 inversions | 2,0 s, 133°, 2 inversions |
| 40° gauche, 30° dessous | 9,2 s, 129°, 7 inversions | 2,7 s, 127°, 3 inversions |
| 30° droite, 60° dessus | 3,7 s, 54°, 12 inversions | 3,3 s, 30°, 3 inversions |
| Plein arrière | 14,7 s, 105° | 9,6 s, 134° (un dépassement de 17° en fin de virage sur la tranche) |

Encore lent : rejoindre une visée à 45° ou 90° sur le côté prend 6,8 et 8,4 s (inclinaison
proportionnelle à l'écart près de la visée, `SIDE_BANK_GAIN`), à régler selon le ressenti.

Premiers essais de l'instructeur (Node, 220 m/s à 5 000 m) : visée à 90° à droite rejointe à 11° en 3 s puis
5° à 7 s ; 30° à gauche à 2° en 7 s ; 20° au-dessus à 0,8° en 3 s ; 5° en dessous à 0,5° en 3 s (en
poussant) ; plein arrière : demi-boucle puis retour sur le dos à l'endroit, à 4° en 13 s (lent à basse
vitesse en haut de la boucle, à affiner en vol). En dessous de ≈ 65 kt, les gouvernes manquent
d'efficacité et l'incidence dépasse sa limite (jusqu'à 36°) : comportement voulu (alarme réelle à
100 kt).

Vérifications de G1 dans Chrome : départ en Simulation à 6 000 m, Mach 0,73, 1 g ; `W` s'arrête au
plein sec (cran), un nouvel appui allume la PC (105 kN à 6 000 m) ; traction clavier 6,2 g, manette
7,5 g ; caméra liée à la cellule en vol dos ; canards braqués en aérofrein ; `F` aller-retour ;
piqué dans le relief : crash et redémarrage ; aucune erreur console.

## Banc de pilotage

Demandé par l'utilisateur le 2026-11-27 : un banc que l'agent exerce lui-même dans l'application.

- `js/flight/PilotBot.js` : pilote scripté qui vole comme un joueur à la manette, par les entrées du
  mode Simulation (`applyControls` : manche, palonnier, manette des gaz, aérofrein et freins ; poignée
  du train par `toggleGear`), donc à travers les commandes de vol électriques, la physique au sol et
  les crashs. Tour de piste à gauche depuis une piste : alignement freins serrés, roulage plein sec sur
  l'axe (roue avant), rotation à 130 kt vers 12°, montée à 8° et train rentré à 60 m, branche vent
  traversier à 450 m et 220 kt, vent arrière à 3 km de l'axe (train sorti par le travers du seuil,
  180 kt), étape de base à 5 km, finale sur l'axe et le plan de 3° à 140 kt, arrondi sous 15 m,
  réduction sous 6 m, roulage freiné jusqu'à l'arrêt. Virages à 45° (25° en finale) commencés à leur
  rayon de leur ligne ; lois : pente par le manche (gain réglé sur la vitesse), inclinaison pour le
  cap, vitesse par la manette des gaz (avec amortissement), cap et écart latéral sur une ligne
  parallèle à la piste. Commandes à 60 Hz de temps simulé, appelé à chaque pas de simulation.
- Rapport : phases et instants, course au décollage, vitesse de décollage, facteurs de charge, écart
  quadratique d'altitude en vent arrière, écarts quadratiques d'axe et de plan en finale stabilisée
  (3 km à 500 m), toucher (vitesse verticale de la première roue, distance après le seuil, écart
  latéral, vitesse, assiette), distance de freinage, crash.
- Sous Node : `tests/pilotBot.test.js` vole le tour sur une piste plate synthétique (≈ 0,1 s).
- Dans l'application : `npm run flight:scenario -- --out <dossier> [--airport LSGG] [--runway 0]
  [--end 0] [--time-scale 3] [--set clé=valeur]` (`scripts/flight-scenario.js`, Chrome) : départ
  d'une vraie piste, tour de piste accéléré (`window.osf.setTimeScale`, le terrain se charge en temps
  réel), une capture par phase et `scenario.json` (rapport, erreurs de la page). `window.osf` :
  `startCircuit()`, `pilot()`, `stopPilot()`, `setTimeScale(n)`.
- Premier passage, LSGG 04 (3 900 × 50 m), ×3, ≈ 2 min réelles : décollage en 638 m à 162 kt (plein
  sec, sans PC), vent arrière à 11,8 m d'altitude près, finale à 0,4 m de l'axe et 7,6 m du plan,
  toucher à 1,69 m/s à 233 m du seuil, 135 kt, 12,2° d'assiette, arrêt en 716 m, aucun crash ni
  erreur. Sur piste plate sous Node : 599 m, 1,82 m/s à 191 m, 695 m. Corrigé au passage : le guidage
  d'approche s'affichait au roulage (train sorti sur la piste).

## Journal des sessions

| Date | Fait | Reste / prochaine étape |
|---|---|---|
| 2026-11-27 | `feat/takeoff-landing` (G3 et banc de pilotage) fusionnée dans `main` en avance rapide | Pousser `main` ; lot de rendu 6 ou G4, au choix de l'utilisateur |
| 2026-11-27 | Banc de pilotage : pilote scripté (tour de piste complet par les entrées du joueur), test Node sur piste plate, `npm run flight:scenario` dans Chrome sur une vraie piste avec rapport et captures ; premier passage à LSGG 04 réussi | Scénarios supplémentaires (nuit, autres pistes, vent quand il existera) ; ressenti en vol par l'utilisateur ; fusion de la branche |
| 2026-11-27 | G3.8 : guidage d'approche sur le HUD (seuil visé, écarts d'alignement et de pente, PAPI virtuel), pilote automatique de cap et d'altitude (`C`) ; tests ; vérifié dans Chrome (LSGG 04). Lot G3 terminé | Ressenti en vol par l'utilisateur (décollage, approche, atterrissage) ; fusion de `feat/takeoff-landing` à sa demande ; lot de rendu 6 ou G4 ensuite |
| 2026-11-27 | G3.7 : balisage lumineux des pistes éclairées (bords, axe codé, seuils verts, fins rouges, rampe d'approche, PAPI selon l'angle de l'œil), allumé au crépuscule ou par mauvaise visibilité ; occultation tolérante au jitter du TAA ; coût dans le bruit ; vérifié dans Chrome (LSGG, CDG) | G3.8 (guidage d'approche sur le HUD, pilote automatique de cap et d'altitude) |
| 2026-11-26 | G3.6 : pistes revêtues et marquages OACI peints dans la couleur du terrain (seuils, numéros, point de visée, zone de toucher, axe, bandes latérales), antialiasés sur l'empreinte en travers ; coût non mesurable ; vérifié dans Chrome (LSGG), et par l'utilisateur à CDG ; à sa demande, tuiles jusqu'au zoom 18 autour des pistes (+0,45 ms près du sol sur un aéroport) | G3.7 (balisage lumineux, PAPI) |
| 2026-11-26 | G3.5 : terrain aplani sous les pistes dans le worker d'altitude (relief, normales, morphing et altitude CPU ensemble, sans couture), pistes chargées avant le terrain d'un lieu ; vérifié dans Chrome à Genève (axe à 1 cm du profil publié, décollage sans à-coup) | G3.6 (pistes et marquages dessinés) |
| 2026-11-26 | G3.4 : données OurAirports servies par le proxy (recherche, pistes par tuile), catalogue des pistes autour de l'avion, recherche d'aéroport dans le menu et départ aligné sur un seuil ; tests ; vérifié dans Chrome (LSGG 04) | G3.5 (aplanir le terrain sous les pistes) |
| 2026-11-26 | G3.3 : points de structure du modèle, crash au contact de la cellule ou au-delà de 3 m/s au toucher, écran de reprise (en vol ou au point de départ au sol), commande du train verrouillée au sol ; tests ; vérifié dans Chrome | G3.4 (aéroports d'OurAirports, départ d'une piste) |
| 2026-11-26 | G3.2 : physique au sol (jambes ressort-amortisseur, pneus, freins, roue avant orientable, effet de sol), loi sol des commandes de vol, centre de gravité du modèle, visée souris au sol ; banc au sol (125 kt en 9,5 s, décollage 394 m, atterrissage 446 m) ; vérifié dans Chrome à Genève | G3.3 (contacts de structure et crash : queue au décollage, toucher trop dur, train rentré) ; ressenti au sol par l'utilisateur |
| 2026-11-26 | G3 commencé sur `feat/takeoff-landing` ; G3.1 : séquence du train (trappes, jambes repliées vers l'avant, roue principale couchée à plat), traînée, touche `G` / bouton X, HUD et avertissement au-delà de 230 kt ; pilote automatique déplacé sur `U` | G3.2 (physique au sol : jambes ressort-amortisseur, freins, roue avant orientable) ; ressenti visuel du train par l'utilisateur |
| 2026-11-25 | G2.4 : brume de chaleur (tampon de décalages, appliqué dans la passe d'atmosphère avant le TAAU), réglage « Heat haze » en High et Ultra ; ≈ +0,1 ms | Ressenti en vol ; lot 4 du rendu, puis G3 |
| 2026-11-25 | Visée souris : l'avion ne se met plus sur le dos pour une visée modérément basse et n'oscille plus en pendule (poussée sans roulis, retour à l'endroit nez sur la visée, sens de roulis gardé) ; tests | Ressenti en vol ; convergence latérale lente à régler si besoin ; G2.4 |
| 2026-11-25 | G2 commité (jets et lumière de PC, son, doc) ; vue orbite autour de l'avion (souris, stick droit, molette) | G2.4 (brume de chaleur) ; ressenti en vol |
| 2026-11-25 | Écarts de G1 levés (bruit, mesures en alternance avec un worktree de G0) ; G2 : modèle du jet, volets de tuyère, flamme volumique avec diamants de choc intégrés exactement, lumière de PC (preset Ultra), son moteur synthétisé ; vérifié dans Chrome de jour et de nuit | Commiter G2 ; G2.4 (brume de chaleur) ; ressenti en vol (visée, son, flamme) ; vue extérieure libre proposée |
| 2026-11-25 | G1 : modèle de vol 6 DDL avec commandes de vol électriques, moteurs M88-2 (Mattingly), banc de vérification (14 cas, `npm run flight:bench`), visée souris, manette des gaz à cran, aérofrein, gouvernes animées, HUD de vol, caméra liée à la cellule, modes Simulation / Exploration (`F`) ; échelle du HUD corrigée | G2 (jets selon la poussée) ; à affiner en vol : sensations de la visée souris et du roulis clavier |
| 2026-11-25 | G0 : horloge à pas fixe, état de l'avion, mode Exploration, entrées clavier/souris/manette, altitude du sol telle que dessinée, atmosphère standard, registre d'entités, tests Node ; vérifié dans Chrome, vues et vol identiques à la référence | G1 sur `feat/flight-model` : modèle 6 DDL, commandes de vol électriques, souris « mouse aim », banc de vérification |
| 2026-11-25 | Revue du code existant (vol, lumières, modèle, altitude du sol) ; recherches web sur le modèle de vol, les jets, le radar, les aéroports, les missiles et les drones ; rédaction de cette feuille de route ; décisions d'ordre, de réalisme, de mode Exploration et de périphériques | G0 sur `feat/flight-model` ; vérifier la licence du modèle Rafale |
