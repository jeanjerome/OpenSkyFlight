# Feuille de route — vol, systèmes et combat

Objectif : faire d'OpenSkyFlight un simulateur de vol de combat jouable dans un navigateur : vol physique
du Rafale piloté par commandes de vol électriques, réacteurs et jets crédibles, décollage et
atterrissage sur de vrais aéroports, radar de terrain de nuit, tirs de missiles et escorte par des
drones de combat.

Ce document complète `docs/rendering-roadmap.md` (rendu) et suit les mêmes conventions. Il est la
**source de vérité de l'avancement** des lots G0 à G6.

## État courant (mis à jour le 2026-11-25)

- **Statut** : plan validé le 2026-11-25 (voir **Décisions**). **G0 fait** sur la branche
  `feat/flight-model` (non fusionnée, non poussée), sauf le préchargement et les requêtes par lot de
  G0.4, reportés à G3 et G5 où ils servent. Prochaine étape : G1 (modèle de vol) sur la même
  branche, puis G2, avant d'alterner avec les lots de rendu (lot 4, nuages volumétriques).
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
  - Le modèle vient de CGTrader (modèle gratuit « Dassault Rafale B ») : licence à vérifier avant d'en
    redistribuer des dérivés (voir Décisions, « Encore ouvert »).

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

- [ ] **G1.1** Corps rigide à 6 degrés de liberté : forces de portance `CL(α, M)`, traînée
      `CD0(M) + k·CL²`, poussée `T(h, M, manette)`, gravité ; moments pilotés par les commandes de vol
      électriques (voir G1.2) plutôt que par des tables de moments ; Euler semi-implicite à 240 Hz,
      quaternion renormalisé.
- [ ] **G1.2** Commandes de vol électriques « carefree » : demande de facteur de charge en tangage
      (neutre = 1 g, auto-trim), limiteur d'incidence (≈ 29°) et de g (+9 / −3,2 en air-air, +5,5 en
      charges lourdes), demande de taux de roulis (270°/s, réduit selon la pression dynamique),
      dérapage maintenu à zéro, réponse courte période du 2ᵉ ordre (ω ≈ 4 rad/s, ζ ≈ 0,7).
      Récupération automatique (remise en montée à 5° et 350 kt) sur une touche.
- [ ] **G1.3** Moteurs M88-2 : 2 × 50 kN à sec, 2 × 75 kN avec post-combustion, poussée selon
      densité et Mach (`T = T_SL·σ^0,7·(1 + aM)`, `a` calé pour Mach 1,8 en altitude et 1,1 au sol),
      retard du 1ᵉʳ ordre (ralenti → PC plein ≈ 4 s), consommation (22 / 47 g/(kN·s)), masse variable.
- [ ] **G1.4** Contrôles : « mouse aim » par défaut (la souris désigne une direction, un instructeur
      PD la convertit en roulis et demande de g dans les limites de l'avion), clavier direct, manette
      de jeu ; manette des gaz à crans (ralenti, plein sec ≈ 80 %, cran à franchir, PC min → max) ;
      aérofrein (canards et élevons braqués ensemble) ; la vitesse fixe disparaît du mode Simulation.
- [ ] **G1.5** Animation des gouvernes depuis les sorties des commandes de vol : pivots calculés par
      pièce, canards (−25° / +20°), élevons ±25° (symétriques en tangage, différentiels en roulis),
      gouverne de direction ±30°, becs 0–20° selon l'incidence, vitesse d'actionneur 60–100°/s.
- [ ] **G1.6** HUD de vol : marqueur de vecteur vitesse, Mach, facteur de charge et g max, incidence,
      manette et PC, carburant ; caméra de poursuite qui suit le roulis réel.
- [ ] **G1.7** Banc de vérification : virage instantané ≈ 30°/s à Mach 0,5 et soutenu ≈ 24°/s à
      Mach 0,6 au niveau de la mer, accélération ≈ 30 kt/s (200 → 500 kt, 5 000 ft, PC), Mach 1,8 en
      altitude, approche 125 kt à 16° d'incidence pour 15 t, plafond ≈ 15 km.
- [ ] **G1.8** Benchmark et pilote automatique : trajectoires toujours imposées (cinématiques), avec
      manette et PC déduits de la vitesse pour l'animation des jets ; pilote automatique « vrai »
      (suivi de cap et d'altitude par les commandes de vol) reporté à G3.

## Lot G2 — Réacteurs et jets selon la poussée

- [ ] **G2.1** Régime moteur (de G1.3) branché sur `AircraftLights` : lueur de la turbine selon le
      régime, flamme nulle à sec, flamme de PC selon le niveau de PC (min → max).
- [ ] **G2.2** Flamme analytique améliorée (passe de halo existante) : 2–3 coques coniques
      imbriquées, diamants de choc `I ∝ cos²(πx/L)·e^(−x/ℓ)` avec un espacement
      `L ≈ 1,3·D·√(Mj² − 1)` (≈ 0,8–1 m), cellules raccourcies vers l'aval, 4 à 8 m de flamme ;
      couleur bleu-violet (chimiluminescence, visible de nuit) mêlée de blanc-orangé (suies).
      Coût visé 0,1–0,3 ms.
- [ ] **G2.3** Volets de tuyère animés : diamètre de sortie ≈ 0,55 m à sec → 0,68 m en PC.
- [ ] **G2.4** Brume de chaleur en espace écran : tampon de décalage dessiné par un cône derrière les
      tuyères (toujours actif, même à sec), appliqué avant le TAAU, atténué sur les bords ; preset
      High et plus.
- [ ] **G2.5** Lumière ponctuelle de PC qui éclaire le fuselage et le sol à basse altitude.
- [ ] **G2.6** Son moteur (WebAudio) selon le régime et la PC, canal `engineVolume` existant ;
      sifflement de la turbine, grondement de la PC, effet de proximité en vue extérieure.
- [ ] **G2.7** (option) Évaluer `@aeronautic/afterburner` (MIT, TSL, WebGPU) ou un portage de son
      ray marching en demi-résolution ; budget 1,5–3 ms en vue arrière, à mesurer contre G2.2.

## Lot G3 — Décollage et atterrissage

- [ ] **G3.1** Animation du train : pivots des jambes, contrefiches, roues et trappes calculés depuis la
      géométrie ; séquence trappes ouvertes → jambes repliées **vers l'avant** (toutes les roues) →
      trappes fermées, ≈ 6 s ; touche dédiée, avertissement au-delà de 230 kt train sorti.
- [ ] **G3.2** Physique au sol : 3 jambes ressort-amortisseur (principales ≈ 430 kN/m et 50 kN·s/m,
      avant ≈ 150 kN/m et 15 kN·s/m, course 0,3 m), cercle de frottement (μ 0,8 / 0,5), freins carbone
      (≈ 0,4 g), roue avant orientable (±75° au roulage, faible au-delà de 60 kt), résistance au
      roulement 0,02, effet de sol sous une envergure.
- [ ] **G3.3** Contact et crash : points de structure (nez, saumons, tuyères, ventre), crash si contact
      de structure, si vitesse verticale > 3 m/s ou si le train est rentré ; écran de reprise.
- [ ] **G3.4** Données d'aéroports : `runways.csv` d'OurAirports (domaine public) découpé par tuile par
      le proxy, chargé autour de l'avion ; recherche d'aéroport dans le menu (décollage depuis une piste).
- [ ] **G3.5** Aplanir le terrain sous les pistes : distance signée au rectangle de piste dans le
      vertex shader du terrain, altitude interpolée entre les deux seuils, raccord smoothstep sur
      150–300 m ; **même fonction** pour l'altitude CPU (G0.4) et la physique au sol.
- [ ] **G3.6** Pistes et marquages procéduraux (OACI Annexe 14) calculés dans le shader en coordonnées
      piste : barres de seuil selon la largeur, numéros, point de visée, zone de toucher, axe.
- [ ] **G3.7** Balisage instancié dans la passe de halo : seuil vert, extrémité rouge, axe et bords
      blancs (codes de fin de piste), rampe d'approche, PAPI (4 unités, 2°30′ à 3°30′, couleur selon
      l'angle de l'œil).
- [ ] **G3.8** Guidage d'approche sur le HUD : pente de 3°, écarts d'alignement et de pente calculés
      depuis le seuil, PAPI virtuel ; pilote automatique de cap et d'altitude.

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
| 2026-11-25 | Ordre avec le rendu | G0, G1 et G2 d'abord, puis alterner lots de vol et lots de rendu | Les fondations du vol conditionnent tout le reste et les jets donnent un effet visible vite |
| 2026-11-25 | Niveau de réalisme | Simulation « carefree » : physique calée sur les chiffres réels, commandes de vol électriques qui protègent l'avion | Fidèle au vrai Rafale et facile à piloter |
| 2026-11-25 | Vol libre actuel | Conservé comme mode Exploration | Voyage rapide, vues de référence ; le benchmark garde de toute façon sa trajectoire imposée |
| 2026-11-25 | Périphériques | Souris + clavier (« mouse aim » par défaut) et manette (Gamepad API, mapping standard) ; pas de HOTAS pour l'instant | Choix de l'utilisateur ; la couche d'entrée unique de G0.3 laisse la porte ouverte |

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
- Accélération 200 → 500 kt à 5 000 ft, PC, 1,8 t de carburant : ≈ 30 kt/s [FT].
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

Vérifications de G0 dans Chrome (`?view=1`, manette simulée en disposition standard) : avance au
clavier 1 120 m en 2,0 s simulées (560 m/s, la vitesse réglée) ; demi-gâchette 280 m/s ; manche à fond
1 s : cap −1,21 rad (1,2 rad/s attendu) ; Y bascule en vue cockpit, Menu ouvre les réglages ; altitude
du sol connue sur 169 points à ±3 km (720 à 2 238 m), 979 m sous l'avion contre 969 m en z12 ; aucune
erreur console.

## Journal des sessions

| Date | Fait | Reste / prochaine étape |
|---|---|---|
| 2026-11-25 | G0 : horloge à pas fixe, état de l'avion, mode Exploration, entrées clavier/souris/manette, altitude du sol telle que dessinée, atmosphère standard, registre d'entités, tests Node ; vérifié dans Chrome, vues et vol identiques à la référence | G1 sur `feat/flight-model` : modèle 6 DDL, commandes de vol électriques, souris « mouse aim », banc de vérification |
| 2026-11-25 | Revue du code existant (vol, lumières, modèle, altitude du sol) ; recherches web sur le modèle de vol, les jets, le radar, les aéroports, les missiles et les drones ; rédaction de cette feuille de route ; décisions d'ordre, de réalisme, de mode Exploration et de périphériques | G0 sur `feat/flight-model` ; vérifier la licence du modèle Rafale |
