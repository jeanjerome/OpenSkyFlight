# Vue cockpit du Rafale — recherche et analyse

Document d'étude, sans implémentation. Il rassemble ce que l'on sait du poste de pilotage du Rafale
(sources publiques, avec leur degré de fiabilité), confronte ces données au modèle 3D du dépôt et au
code de la vue cockpit actuelle, puis propose une architecture et un découpage en tâches. Les
décisions à prendre par l'utilisateur sont regroupées à la fin.

## Fiabilité des sources

| Repère | Signification |
| --- | --- |
| **[OFF]** | Dassault Aviation, Thales, ou essai en vol publié (Flight International) |
| **[SEC]** | Presse spécialisée ou site d'amateurs documenté (rafalefan, omnirole-rafale) |
| **[SIM]** | Documentation de modules de simulation (AzurPoly, FR3D pour DCS) : rétro-conçue, non officielle |
| **[FOR]** | Forum ou blog sans source |
| **[EST]** | Estimation de ce document |
| **[MOD]** | Mesuré sur `assets/models/rafale/Rafale.gltf` |

Les deux faits structurants (champ du HUD, inclinaison du siège) et le principe d'interface ont été
relus directement sur les pages de Dassault et de Flight International.

## 1. Le concept : trois niveaux de lecture

Dassault décrit l'interface homme-machine en trois étages **[OFF]** :

1. **Court terme, tête haute** : pilotage et tir sur le HUD grand champ (VTH, *visualisation tête
   haute*), complété depuis le standard F4 par le viseur de casque Scorpion.
2. **Moyen et long terme** : la situation tactique d'ensemble sur la *visualisation tête moyenne*
   (VTM, en anglais HLD), collimatée à la même distance que le HUD pour que l'œil passe de l'une au
   monde extérieur sans accommoder.
3. **Gestion des systèmes** : deux écrans tactiles couleur latéraux (VTL), avec la commande HOTAS
   (manette des gaz et mini-manche, plus de 34 commandes à eux deux **[OFF]**).

Sources : <https://www.dassault-aviation.com/en/defense/rafale/synthesise-and-facilitate/>, dossier
de presse 2015 § IV-2
<https://www.dassault-aviation.com/wp-content/blogs.dir/1/files/2015/02/Rafale-file_UK.pdf>, essai
Flight International <https://www.flightglobal.com/flight-test-dassault-rafale-rampant-rafale/90047.article>.

Le cockpit se lit donc de haut en bas, de loin à près : HUD, VTM juste dessous, puis VTL de part et
d'autre et petits écrans plus bas. Il n'y a quasiment pas d'instruments mécaniques. C'est une bonne
nouvelle pour la simulation : presque tout ce que le pilote lit est un écran qu'on peut dessiner.

## 2. Ce que voit le pilote, élément par élément

### HUD (VTH)

- Thales (ex-Sextant) CTH 3022, holographique, collimaté **[SEC]**. Champ total **30° × 20°**
  (Flight International **[OFF]**), ou 30° × 22° selon rafalefan **[SEC]**. La symbologie se lit en
  entier depuis le point de l'œil, sans bouger la tête **[OFF]**.
- Un seul grand combineur holographique, à peu près trapézoïdal, sur un boîtier posé sur l'auvent
  (photos). Ses dimensions ne sont pas publiées. Vu de face, il renvoie des reflets verts ; vu depuis
  le siège, il a une légère teinte rosée **[SEC]** (<https://omnirole-rafale.com/avionique/ihm/>). Le
  standard F3-O4T lui aurait donné « une meilleure transparence » **[SEC]**.
- Symbologie monochrome verte **[SEC]**. Disposition selon AzurPoly **[SIM]**
  (<https://docs.azurpoly.com/rafale/hud/>) :
  - vecteur vitesse, avec un symbole différent train sorti ; maquette avion ;
  - échelle de tangage par pas de 5°, chiffrée tous les 10°, traits négatifs en tirets ;
  - vitesse indiquée numérique en haut à gauche, Mach dessous (affiché à partir de M 0,4) ;
  - altitude dans une échelle circulaire de 100 ft, hauteur radar « H » ;
  - incidence (α) à gauche, facteur de charge (G) à droite ;
  - bande de cap en haut : un trait pour le cap, un triangle pour la route ;
  - chevrons d'accélération « > < » de part et d'autre du vecteur vitesse, doublés en PC ;
  - cadre d'alarme en bas à droite ; alertes RECOVER, TOO SLOW, LANDING GEAR ;
  - mode approche (APP) : vitesse, altitude et cap descendent dans le bas du HUD, avec la fourchette
    d'incidence cible. À l'appontage, environ 16° d'incidence et 125 kt **[SEC]**.

### Visualisation tête moyenne (VTM)

- Écran couleur de **25,4 × 25,4 cm** (10 pouces), collimaté à l'infini, champ de **20° × 20°**
  **[SEC]** (<https://rafalefan.e-monsite.com/pages/dossier-rafale-avionique/genese.html>).
  Définition de 1000 × 1000 pixels **[FOR]**.
- Son bord supérieur est juste sous le HUD **[SEC]**, avec dessous un pavé de désignation tactile
  et deux molettes de luminosité **[SEC]**.
- Contenu **[SEC]** : situation tactique fusionnée (SITAC) sur carte défilante ou imagerie
  satellite ; « bulles » colorées des domaines de tir de l'arme choisie ; coupe verticale des
  altitudes relatives en incrustation ; fenêtres vidéo des capteurs (OSF, Damocles, TALIOS).

Comme elle est collimatée, la VTM se comporte en partie comme le HUD : son image paraît à l'infini,
derrière une optique fixe. Le pilote voit donc une fenêtre dans le tableau de bord et non un écran
plat : une petite rotation de la tête fait glisser l'image dans l'ouverture, une translation ne la
déplace pas. On peut l'imiter (§ 6.4).

### Écrans latéraux (VTL)

- Deux écrans couleur tactiles **[OFF]**, chacun avec une molette et un commutateur à doigt **[OFF]**.
  Il n'y a pas de couronne de touches comme sur les écrans du F-16.
- Leur taille diffère selon les sources : 5 pouces actifs à 500 × 500 px **[FOR]**, 15 × 15 cm
  **[SEC]**, 6 × 6 pouces (Aviation Week, cité **[SEC]**). Aviation Week donne aussi 160 pouces
  carrés de surface active en tout. Cela colle avec 100 (VTM) + 2 × 25 (VTL) + environ 10 (petits
  écrans). Retenu : **5 pouces actifs, environ 15 cm avec le cadre** **[EST]**, pour un F3-R.
- Le standard **F4** les remplace par de nouveaux écrans Thales (400 commandés en 2021) **[OFF]** de
  **15,88 cm (6,25 pouces)** de côté **[SEC]**. Ils sont mieux définis, tactiles multipoints (double
  tape, pincement) **[SEC]**, et s'accompagnent d'une tablette de genou.
- Pages **[SEC/SIM]** : HSI, armement (SMS), détecteur radar (RWR), radar air-air avec la L16, vidéo
  des capteurs et des nacelles, et les pages systèmes ENG, FUEL, HYDR, MISC et FAIL.
  - **ENG** **[SIM]** (<https://docs.azurpoly.com/rafale/vtl-engine/>), pour chacun des deux M88 :
    N1 %, N2 % (ambre à 103 %, rouge à 105 %), T49 en K (rouge au-delà de 1184 K, 1198 K en PC),
    tuyère A8 % (magenta quand la PC est allumée), débit en kg/min.
  - **FUEL** **[SIM]** (<https://docs.azurpoly.com/rafale/vtl-fuel/>) : réservoirs, pompes et
    vannes, totaux gauche et droite en kg, carburant restant au totalisateur.
- Code couleur de l'armement **[SEC]** : blanc disponible, vert choisi ou actif, orange dégradé,
  rouge indisponible.

### Petits écrans et panneaux

- **PDS** (*poste dialogue système*), double écran sous la VTL gauche **[SEC/SIM]** :
  - PDS1 : radio, navigation, IFF, choix du mode principal et des pages des VTL ;
  - PDS2 : modes du pilote automatique, IFF.
- À droite, deux petits écrans couleur **[SEC/SIM]** :
  - **IPS** (*instrumentation permanente de secours*) : horizon, vitesse, altitude et cap de secours ;
  - **IMC** : l'essentiel moteurs et carburant.
  Les instruments de secours sont électroniques, sur leur propre générateur de symboles **[SEC]**.
  omnirole appelle plutôt ce petit écran droit un indicateur de situation horizontale : à vérifier
  sur photo.
- **Panneau central bas** **[SEC]** : largage d'urgence, Master Arm, allumage, voyants
  (incidence, GCAS, oxygène, moteurs, APU), bouton RECOVERY (remise en ligne de vol automatique),
  alignement de la centrale inertielle, barre de catapultage (M seulement).
- **Alarmes** **[SIM]** (<https://docs.azurpoly.com/rafale/alarms/>) : les alarmes rouges (feu
  moteur, feu APU, panne hydraulique) et ambre s'encadrent sur les quatre grands écrans, rouge au
  centre, ambre en bas à droite. La page FAIL d'une VTL les détaille. Les voyants de panneau sont
  bleus, ambre et rouges, et une voix synthétique féminine annonce les alarmes critiques.
- **Train et crosse** : AzurPoly place la poignée de train (n° 15) et le bouton de crosse (n° 16) au
  tableau de bord **[SIM]**, omnirole les place à gauche **[SEC]**. Ils sont donc à gauche, vers la
  jonction du tableau et de la console gauche. À vérifier sur les photos de l'USAF (§ 5).

### Consoles, manche, manette

- **Console gauche** **[SEC/OFF]** : manette des gaz unique, démarrage, les deux « mini-manettes »
  (robinets basse pression), radio de secours, éclairage, audio, commandes de vol, oxygène,
  anti-g, rangement de cartes, commandes de secours sous capot.
- **Console droite** **[SEC/OFF]** : mini-manche latéral (débattement d'environ 10 mm **[SEC]**,
  accoudoir réglable **[SIM]**), verrière, température cabine, frein de parc, conjugaison de la
  roulette avant, crypto, laser/ROVER, nacelle de ravitaillement.
- Siège et palonnier se règlent électriquement **[OFF]**.

### Siège et verrière

- Siège éjectable **Martin-Baker Mk16F, incliné de 29°** **[OFF]**. Flight International écrit
  « à près de 30° » **[OFF]**. Le démonstrateur Rafale A était à 32° **[FOR]**. Coussins verts
  (photos, maquettistes).
- **Verrière** monobloc en bulle, Saint-Gobain Sully, traitée à l'or, ouverture latérale vers la
  **droite** **[SEC]** (Dassault confirme une ouverture de côté pour pouvoir sortir le siège en
  dix minutes **[OFF]**).
  - Un arceau de pare-brise séparé est visible sur les photos : le pare-brise n'est pas sans cadre.
    Un forum parle de « deux arceaux métalliques » dans le champ de vision **[FOR]**.
  - Le biplace B a une verrière unique pour les deux places **[FOR]**, ce que confirme le modèle.
- Vue vers l'avant et vers le bas : 16° par-dessus le nez, 27° sur les côtés (54° au maximum),
  360° à l'horizontale **[FOR]** (chiffres recopiés de site en site sans source). Les pilotes
  parlent d'un nez très plongeant et d'une bonne vue vers le bas, utiles à l'appontage.
- **Teinte intérieure** : pas de référence FS officielle. Les maquettistes s'accordent sur un noir
  ou gris très foncé un peu passé, avec consoles et cadres d'écran noirs **[FOR]**. Certains
  prennent un gris plus clair de type Dark Gull Grey **[FOR]**.

### Place avant du Rafale B

Identique pour l'essentiel à celle du monoplace **[SEC]**. Une caméra sur l'auvent avant alimente la
répétition HUD de la place arrière ; le manche arrière n'a pas de détente. Les éjections partent en
divergence, l'une à gauche, l'autre à droite.

### F4 et F5

- **F4** **[OFF/SEC]** : nouvelles VTL de 6,25 pouces, viseur de casque Scorpion, vidéo HD des
  capteurs (TALIOS) par fibre optique, tablette de genou.
  - <https://www.airforce-technology.com/news/thales-avionics-equipment-french-rafale-f4-standard/>
  - <https://omnirole-rafale.com/avionique/evolutif/>
  - <https://www.flightglobal.com/defence/now-fight-connected-why-f4-standard-rafale-is-a-game-changer-for-france/153755.article>
- **F5** : aucun changement matériel du cockpit n'est documenté à ce jour. Seuls des commentaires
  évoquent des affichages « contextuels » et un assistant à base d'IA **[FOR]**.

## 3. Géométrie : sources, estimations et mesures sur le modèle

### Ce que disent les sources

| Grandeur | Valeur | Fiabilité |
| --- | --- | --- |
| Inclinaison du siège | 29° | [OFF] |
| Champ total du HUD | 30° × 20° (ou 30° × 22°) | [OFF] / [SEC] |
| VTM | 25,4 cm de côté, 20° × 20°, collimatée | [SEC] |
| VTL (F3-R) | environ 5 pouces actifs, 15 cm avec cadre | [EST] sur [SEC]/[FOR] |
| VTL (F4) | 15,88 cm de côté | [SEC] |
| Vue par-dessus le nez | 16° | [FOR] |
| Distance de l'œil au combineur | 0,45–0,55 m (un combineur de 0,25–0,28 m de large donne alors environ 30°) | [EST] |
| Distance de l'œil à la VTM | 0,6–0,7 m (une ouverture de 25 cm pour 20° donne au plus 0,127 / tan 10° ≈ 0,72 m) | [EST] |
| Écart entre HUD et VTM | bord haut de la VTM 1 à 2° sous le bas du HUD, tous deux sur l'axe de l'œil | [EST] |

Aucune source primaire ne donne la position de l'œil de référence, la taille du combineur ni la
définition des écrans F4.

### Mesures sur le modèle du dépôt

Le modèle est un Rafale B en unités du modèle (x à gauche, y en haut, z vers l'avant), mis à
l'échelle par `AIRCRAFT_TARGET_LENGTH = 15` m : facteur 1,029. Son envergure devient 10,9 m, comme
le vrai avion (longueur réelle du B : 15,30 m). Les profils ci-dessous viennent des sommets du
glTF **[MOD]**, en unités du modèle.

| Élément | z (vers l'avant) | y (hauteur) | Demi-largeur |
| --- | --- | --- | --- |
| Assise du siège avant (`FrontSeat`) | 3,6–4,0 | dessus à 2,16 | 0,22 |
| Dossier et appui-tête | 3,0–3,4 | haut à 3,05 | 0,22 |
| Rebord de l'habitacle (`CockpitTub`) | 2,8 → 5,2 | 2,45 → 2,29 | 0,47 → 0,30 |
| Verrière (`GlassRear`), sommet intérieur | 3,2 / 3,6 | 3,20 / 3,15 | 0,41 / 0,40 |
| Pare-brise (`GlassFront`) | 3,92–5,22 | 2,98 à z 4,2 ; 2,45 à z 5,2 | 0,38 → 0,25 |
| Dos du fuselage devant le pare-brise | 5,3–5,8 | 2,38 → 2,32 | — |
| Centre de gravité (`AIRCRAFT_CG`) | −1,5 | 1,95 | 0 |

Ces mesures donnent une **position de l'œil proposée** **[EST]** :

- **Hauteur** : un pilote assis a l'œil à environ 0,79 m au-dessus de l'assise. Incliné de 29°, cela
  fait 0,69 m de haut. L'œil est donc vers y ≈ 2,85.
- **Position avant** : 0,10 à 0,15 devant l'appui-tête, soit z ≈ 3,5.
- **Garde au toit** : la verrière passe environ 0,30 au-dessus de l'œil. Avec un casque qui dépasse
  de 0,12 à 0,15, il reste 0,15 à 0,18 de garde, ce qui est vraisemblable.
- **Pare-brise** : il coupe la hauteur de l'œil vers z ≈ 4,38, 0,9 devant lui. Un combineur 0,5 en
  avant (z ≈ 4,0, haut vers y 2,88) tient sous le pare-brise.
- **Position dans l'avion** : l'œil est à 5,2 m devant et 0,93 m au-dessus du centre de gravité, en
  mètres. C'est utile pour les effets de rotation (§ 6.9).

**Vue par-dessus le nez** **[MOD]** : sans auvent intérieur, le dos du fuselage devant le pare-brise
coupe la vue vers 11–13° sous l'horizontale pour l'œil proposé (12,5° à y 2,88 et z 3,35 ; 13,4° à
y 2,88 et z 3,5). Atteindre les 16° annoncés demanderait un œil vers y ≈ 3,07, au-dessus de
l'appui-tête : c'est impossible dans ce modèle. Il faudra donc soit accepter environ 12° (le chiffre
de 16° n'est pas sourcé), soit abaisser légèrement le dos du fuselage devant la verrière. Dans la
vue cockpit, l'auvent et le boîtier du HUD limiteront de toute façon la vue dans l'axe avant le
fuselage.

**Vue sur le côté** **[MOD]** : le rebord de l'habitacle est environ 0,45 sous l'œil et 0,45 sur le
côté, d'où une vue vers le bas d'environ 45° par le travers, et les ailes delta au-delà. C'est plus
que les 27° **[FOR]**, mais ce chiffre ne dit pas s'il compte le rebord ou l'aile. À vérifier sur une
capture.

## 4. Références visuelles

Domaine public ou licence libre (Wikimedia Commons) :

- Cockpit de Rafale C avec pilote, USAF 2024, domaine public, 7360 × 4912 :
  <https://commons.wikimedia.org/wiki/File:USAFE_hosts_first-ever_basic_fighter_maneuver_exercise_at_Ramstein_(8471867).jpg>.
  Même série : 8466201, 8471868, 8471870.
- Siège Mk16F, photo de Julian Herzog, CC BY 4.0 :
  <https://commons.wikimedia.org/wiki/File:Martin-Baker_Mk.F16F_ejection_seat_PAS_2013.jpg>
- Réception du premier Rafale indonésien, domaine public en Indonésie, basse définition :
  <https://commons.wikimedia.org/wiki/File:First_Indonesian_Rafale_acceptance_ceremony_(2).jpg>
- Catégorie des éléments du Rafale (pas de catégorie « cockpit ») :
  <https://commons.wikimedia.org/wiki/Category:Dassault_Rafale_parts>

Sous droits, à consulter seulement pour les proportions :

- Écrans et HUD annotés : <https://omnirole-rafale.com/avionique/ihm/>
- Plans numérotés des panneaux (la meilleure carte d'ensemble) :
  <https://docs.azurpoly.com/rafale/general-description/>
- Visite du cockpit d'un Rafale B :
  <https://master194.com/2026/10/27/cockpit-rafale-b-walkaround-et-details-en-photos/>
- Manuels des modules DCS : FR3D Rafale 2.0
  (<https://forum.dcs.world/topic/393832-fr3d-rafale-20-released-the-omnirole-fighter-for-dcs-world/>)
  et Rafale Pack Evolution, en français
  (<https://www.scribd.com/document/680016231/DCS-PACK-EVOLUTION-Manuel-FR>)

## 5. Modèles 3D existants

- **Aucun cockpit de Rafale sous licence libre** n'a été trouvé.
  - Les modèles libres de Sketchfab (fauzan_3d et quick_loop en CC BY, bohmerang en CC BY-NC-SA)
    sont tous des extérieurs.
  - Les cockpits détaillés du commerce (TurboSquid usage éditorial seulement, 3dmodels.org, STL de
    CGTrader) sont sous licences incompatibles avec un dépôt public.
- **FGMEMBERS/RafaleB** (FlightGear, GPL-2.0, <https://github.com/FGMEMBERS/RafaleB>) a un cockpit
  virtuel sommaire, figé depuis 2019. La GPL contaminerait le projet, qui n'a pas de licence
  déclarée, et le niveau de détail ne vaut pas l'intégration.
- Rappel : le modèle extérieur actuel vient de CGTrader sous licence Royalty Free, dont les
  conditions posent déjà problème dans un dépôt public (voir « Décisions » de
  `docs/gameplay-roadmap.md`). Un cockpit fait maison n'aggrave pas ce point. Un cockpit acheté
  l'aggraverait.

**Conséquence** : le cockpit est à construire nous-mêmes, d'après les photos et les cotes ci-dessus.

## 6. Analyse du code et architecture proposée

### 6.1 État actuel de la vue cockpit

Dans `js/app.js` (phase caméra, `CONFIG.cameraMode === 'cockpit'`) :

- la caméra est placée **au centre de gravité** de l'avion (`aircraftState.position`), et non à
  l'œil ;
- l'avion entier est masqué (`aircraftManager.setVisible(false)`) ;
- l'orientation suit `aircraftState.quaternion` et le roulis, mais pas le basculement visuel du
  maillage (`_visualRoll` et `_visualPitch` d'`AircraftManager`) : vu de dehors et vu de dedans,
  l'avion n'est pas orienté pareil ;
- le HUD reste la surcouche 2D plein écran (`js/ui/HUD.js`, `HUDRenderer`), en vert `#00ff88` ;
- la souris et le stick droit pilotent : pas de regard libre (`controls.freeLook` ne vaut `true`
  qu'en vue orbite) ;
- le son est déjà assourdi par la verrière et le casque (`EngineSound`, `cockpit: true`).

### 6.2 Le modèle extérieur vu de dedans

Ce qu'il faut garder visible : nez, canards (bien visibles depuis le siège), ailes, entrées d'air,
arceaux de verrière, et la place arrière du B derrière la tête. Ce qu'il faut remplacer :

- **`GlassFront` et `GlassRear`** : matériau `Glass` **opaque et noir** (`baseColorFactor` 0,0,0,1,
  `alphaMode` OPAQUE). Vus de dedans, ils masquent tout. En vue cockpit, il faut un verre
  transparent : légère teinte dorée (traitement à l'or), reflet de Fresnel du ciel et de
  l'intérieur, rayures et poussière en option. Vu de dehors, garder le verre actuel, ou lui donner
  le même matériau transparent, puisque le cockpit sera là pour être vu à travers.
- **`CockpitTub`, `FrontSeat`, `RearSeat`** : quelques polygones peints avec la texture extérieure.
  Masquer la cuve et le siège avant en vue cockpit (remplacés par le cockpit détaillé). Garder le
  siège arrière ou le remplacer par une version simplifiée du même siège.
- **`CanopyFront` et `CanopyRear`** : leurs volumes englobants collent à ceux du verre. Ce sont
  probablement les arceaux, ou des coques peintes autour des vitres. À vérifier par une capture
  depuis l'œil avant de décider si on les garde.

Le maillage doit aussi rester visible pour **projeter son ombre** dans le cockpit : arceaux,
pare-brise et auvent sur les écrans et les genoux. `AircraftShadow` fait déjà porter l'ombre de
l'avion sur lui-même (carte de 2048², rayon 9 m, soit environ 9 mm par texel). C'est assez fin pour
les arceaux, mais il faudra vérifier l'acné et le biais à 30 cm de l'œil.

### 6.3 Caméra, plan proche et regard libre

- **Œil** : un point fixe dans le repère du maillage (§ 3, environ (0 ; 2,85 ; 3,5) en unités du
  modèle), transformé par la matrice du groupe de l'avion. Il suit ainsi exactement le basculement
  visuel et les mouvements du centre de gravité.
- **Plan proche** : `DEFAULT_NEAR = 1` m, avec un tampon de profondeur inversé
  (`reversedDepthBuffer: true`). Le cockpit commence à 10–15 cm de l'œil (manche, manette,
  genoux) : il faut environ 0,03–0,05 m en vue cockpit.
  - Avec une profondeur flottante inversée, la précision au loin ne souffre presque pas.
  - Il faut revoir tout ce qui lit la profondeur ou `cameraNear` : nuages (reconstruction de
    profondeur, brouillard proche), perspective aérienne, TRAA, halos des feux de piste (biais
    d'occultation croissant avec la distance), ombres du relief.
  - Solution de repli : une passe séparée pour le cockpit, avec sa propre caméra et sa propre
    profondeur, composée sur l'image. Elle est plus sûre pour la profondeur, mais double la gestion
    de l'éclairage, de l'exposition et de l'anticrénelage. Pas recommandée en premier.
- **Regard libre** : réutiliser `controls.freeLook` (souris en pointeur verrouillé, stick droit),
  déjà écrit pour la vue orbite.
  - Limites de tête : lacet ±150°, tangage de −45° à +80°, avec translation latérale de la tête
    quand on regarde derrière, comme dans les simulateurs « 6 DoF ».
  - Une touche de recentrage.
  - La molette agit sur le champ de vision (zoom), plutôt que sur la distance comme en orbite.
- **Conflit avec la visée souris** : en simulation, la souris pilote par la visée (`MouseAim`).
  Il faut choisir entre une souris qui tourne la tête (pilotage au clavier ou à la manette) et un
  regard libre seulement tant qu'une touche est tenue (voir les décisions).

### 6.4 HUD collimaté et VTM

- **HUD** : la symbologie est collimatée, donc projetée à l'infini. Le `HUDRenderer` actuel projette
  déjà les directions (vecteur vitesse, croix du nez, échelle de tangage) à travers la caméra. En vue
  cockpit, il suffit de :
  1. dessiner le combineur en 3D : une plaque de verre à peine teintée (rose pâle vu du siège), sur
     son boîtier ;
  2. **découper la surcouche 2D selon le contour du combineur projeté à l'écran** (`ctx.clip()` sur
     le quadrilatère projeté), pour qu'elle reste conforme au paysage quand la tête tourne et
     disparaisse hors du verre ;
  3. **adopter la disposition du Rafale** (§ 2) dans ce mode : vitesse et Mach en haut à gauche,
     altitude circulaire, cap en haut, α à gauche, G à droite, chevrons d'accélération, mode APP.
  - La netteté reste celle de l'écran. Il n'y a ni texture à mettre à jour, ni coût GPU.
  - Contrepartie : la surcouche passe devant tout, y compris une main ou un objet qui passerait
    devant le combineur. C'est sans conséquence dans un cockpit fixe.
- **VTM** : écran collimaté lui aussi. Deux rendus possibles :
  - un plan émissif simple dans le tableau de bord (comme les VTL) ;
  - une fenêtre collimatée : une texture lue selon la *direction* du regard à travers l'ouverture
    plutôt que selon la position sur le plan. C'est l'effet réel, une image fixe à l'infini, pour
    un coût minime dans le shader du plan.
  - Le contenu commence par une carte défilante orientée selon la route. `js/ui/Minimap.js`
    dessine déjà une carte de tuiles sur un canvas 2D, à environ 20 Hz, et peut lui servir de base.
    Viendront ensuite les pistes du `RunwayCatalog`, le plan de vol, puis, avec G4 et G5, l'image
    radar et les pistes tactiques.

### 6.5 Écrans dans la scène (VTL, PDS, IPS, IMC)

- Chaque écran est une `CanvasTexture`. On y dessine en 2D, avec le même style de code que le HUD,
  puis on l'affiche sur un plan émissif.
  - Définition : 512² pour les VTL F3-R, 256² pour les petits écrans, 1024² pour la VTM.
  - Mise à jour à 10–20 Hz, une texture par image en tournant, pour lisser le coût des envois
    (environ 1 Mo par 512²).
- **Luminance** : l'émission en cd/m² est pondérée par `atmosphericSky.emissiveExposure`, comme les
  feux de l'avion et les échappements, pour que les écrans restent lisibles le jour comme la nuit.
  Un réglage de luminosité joue le rôle des molettes.
- **Pages, à partir du modèle de vol existant** :
  - ENG : `Engines.core`, `reheat`, `fuelFlow`, `thrust`. Il faudra des grandeurs dérivées (N1,
    N2, T49, A8) depuis le régime et la PC, avec les seuils du § 2.
  - FUEL : `FlightModel.fuel`, totalisateur.
  - Configuration : train (`GearSequence`), aérofreins, freins, crosse.
  - HSI : cap, plan de vol, ILS d'`ApproachGuide`.
  - FAIL : crash et alertes existantes.
  - Les pages radar, RWR et armement attendront G4 et G5.
- **Interaction** : clic sur les écrans tactiles (rayon depuis le pointeur, ou touches de
  raccourci) pour changer de page. C'est un plus, pas un préalable.

### 6.6 Géométrie et matériaux du cockpit

- **Construction** : procédurale en three.js, ou modelée dans Blender puis exportée en glTF.
  - Le procédural (`ExtrudeGeometry` pour les panneaux et l'auvent, `LatheGeometry` pour les
    molettes, boîtes chanfreinées) se versionne et s'ajuste par constantes. Il convient aux
    panneaux plats, écrans et consoles, qui sont l'essentiel d'un cockpit à écrans.
  - Un modèle Blender rend mieux les formes organiques : siège Mk16F, manette, manche, coussins.
  - Proposition : le procédural pour la cuve, le tableau, l'auvent, les consoles et les écrans ;
    le siège, le manche et la manette en primitives simples d'abord. Leur remplacement par des
    maillages modelés resterait une option, à décider plus tard.
- **Matériaux** : peu nombreux, partagés pour limiter les compilations de nœuds.
  - gris très foncé mat, environ 0,04 d'albédo, rugosité 0,8 ;
  - noir des cadres d'écrans ;
  - vert des coussins ;
  - métal des leviers ;
  - verre des écrans : léger reflet de Fresnel sur l'émission.
- **Occlusion ambiante** précalculée dans les couleurs de sommets ou une petite texture. Le
  cockpit est un creux, et sans elle il paraîtra plat. GTAO a été écarté au lot 5 du rendu pour
  son coût.
- **Budget** : 20 000 à 50 000 triangles, moins de 10 matériaux, 5 ou 6 textures de canvas.
  Objectif : moins de 0,5 ms GPU en vue cockpit, et p1 du banc de vol dans les 10 % de la
  référence.

### 6.7 Éclairage et exposition

- Le jour, soleil et ombres de la verrière (§ 6.2), lumière du ciel par la verrière (l'intérieur
  ne voit que le ciel au-dessus, d'où une ambiante orientée vers le haut), lumière diffuse des
  nuages (`CloudAmbient`) en traversée.
- La nuit, éclairage d'ambiance du cockpit (projecteurs d'ambiance et panneaux rétroéclairés, en
  vert compatible avec les jumelles de vision nocturne). Les écrans deviennent la principale source
  de lumière et pourraient éclairer légèrement les mains et les cadres (une lumière ponctuelle
  faible par écran, ou un terme émissif ajouté).
- **Exposition automatique** (`AutoExposureNode`, mesure matricielle de tout l'écran) : un
  intérieur sombre qui occupe 40 % de l'image fera monter l'exposition et brûlera l'extérieur.
  - C'est exact pour une caméra, faux pour l'œil, qui s'adapte zone par zone.
  - Pistes : pondérer la mesure par un masque « extérieur », ou appliquer au cockpit un gain local
    (l'œil adapté à l'intérieur).
  - À trancher sur des captures de jour, avec l'utilisateur.

### 6.8 Mouvements et animation

- Le mini-manche suit les ordres du pilote (`FlightModel.controls.pitch` et `roll`), avec de petits
  débattements : un vrai mini-manche ne bouge que d'environ 10 mm, on l'exagère pour qu'il se voie.
- La manette suit `FlightModel.controls.lever` et marque le cran de PC.
- La poignée de train suit `GearSequence`, les voyants s'allument.
- Option : bras et mains du pilote. Ils sont coûteux à bien faire, et leur absence est courante
  en simulation.

### 6.9 Effets ressentis à la tête

- Tête lestée par le facteur de charge (elle s'enfonce sous g positif), vibrations au roulage et
  dans les tremblements de buffet, à-coups au toucher des roues (`GearContact`).
- L'œil étant à 5,2 m devant le centre de gravité, une rotation en tangage le déplace : à
  0,3 rad/s, environ 1,6 m/s vers le haut ou le bas. C'est déjà juste si l'œil est attaché au
  groupe de l'avion (§ 6.3).
- Voile gris puis noir sous fort g soutenu : un vignettage qui monte avec le facteur de charge et
  sa durée. Il touche au gameplay, donc il sera débrayable.

### 6.10 Validation

- Ajouter des vues de référence cockpit (jour, crépuscule, nuit, en approche sur une piste) à
  `render:capture`, pour mesurer le coût GPU en saturation et comparer les captures.
- `flight:scenario` avec `--set cameraMode=cockpit` pour un tour de piste vu du siège : le guidage
  du HUD doit rester lisible et conforme au paysage pendant toute l'approche.
- Planches comparatives avec les photos de l'USAF (même angle de vue) pour juger les proportions ;
  l'utilisateur choisit entre variantes.

## 7. Découpage proposé

Ordre conseillé : les étapes 1 et 2 rendent la vue utilisable tout de suite, la 3 est le gros du
travail visuel, la 4 donne le « vrai » Rafale, les suivantes l'affinent.

| # | Tâche | Contenu | Dépend de |
| --- | --- | --- | --- |
| C1 | Œil, plan proche, regard libre | Œil attaché au groupe de l'avion, plan proche 0,05 m en vue cockpit et revue des lectures de profondeur, regard libre avec limites et recentrage, zoom à la molette | — |
| C2 | L'avion vu de dedans | Verre transparent teinté, cuve et siège d'origine masqués, arceaux, canards et ailes visibles, ombres de la verrière | C1 |
| C3 | Habitacle | Cuve, auvent, tableau, consoles, siège, manche, manette, boîtier du HUD, cadres des écrans, procéduraux, matériaux partagés, occlusion précalculée | C2 |
| C4 | HUD du Rafale | Combineur 3D, surcouche découpée au contour projeté, disposition et symboles du Rafale, mode APP | C3 |
| C5 | Écrans | Textures de canvas émissives et luminosité ; VTL ENG, FUEL, configuration, HSI, FAIL ; IPS et IMC ; PDS | C3 |
| C6 | VTM | Carte défilante tirée de `Minimap`, pistes, plan de vol ; rendu collimaté | C5 |
| C7 | Éclairage | Ambiante du ciel, éclairage de nuit, écrans comme sources, exposition intérieur/extérieur | C3, C5 |
| C8 | Animation et effets | Manche, manette, poignée de train, voyants ; tête sous g, vibrations, voile gris | C3 |
| C9 | Clôture | Vues de référence, mesures, captures, comparaison aux photos | toutes |

Les pages radar, RWR et armement des VTL et de la VTM, ainsi que le viseur de casque, viendront avec
G4 et G5 de `docs/gameplay-roadmap.md`.

## 8. Décisions à prendre

| Question | Options | Recommandation |
| --- | --- | --- |
| Standard représenté | F3-R (VTL de 5 pouces, le mieux documenté) ; F4 (VTL de 6,25 pouces, viseur de casque Scorpion, tablette) | F4 : c'est le standard en service, et il ne change que la taille des VTL et ajoute le casque |
| Place représentée | Place avant du B (le modèle extérieur est un B) ; monoplace C dans une cellule de B | Place avant du B : identique pour l'essentiel, et cohérente avec la place arrière visible derrière |
| Souris en vue cockpit | Elle tourne la tête (pilotage clavier ou manette) ; elle pilote par la visée et la tête tourne seulement touche tenue | Tête par défaut, visée par réglage : le cockpit est fait pour regarder autour |
| Vue par-dessus le nez | Garder environ 12° (modèle tel quel) ; abaisser le dos du fuselage devant le pare-brise pour viser 16° | Garder 12° : le chiffre de 16° n'est pas sourcé |
| Construction | Tout procédural ; procédural + siège, manche et manette modelés dans Blender | Procédural d'abord, modelé en option |
| Exposition | Mesure de tout l'écran (comme une caméra) ; mesure de l'extérieur seulement et gain local pour l'intérieur | À juger sur captures |
| Voile gris sous g | Oui, débrayable ; non | Oui, débrayable, désactivé en Exploration |

## 9. Lacunes

- La position de l'œil, la distance au combineur et la taille du combineur ne sont pas publiées :
  les valeurs du § 3 sont des estimations à valider sur capture.
- La taille des VTL F3-R (5 ou 6 pouces) et les angles de vue (16° et 27°) reposent sur des sources
  faibles.
- La place exacte de la poignée de train et de la crosse, ainsi que le rôle exact des deux petits
  écrans de droite, sont à confirmer sur les photos de l'USAF en domaine public.
- La nature des maillages `CanopyFront` et `CanopyRear` (arceaux ou coques) est à vérifier par une
  capture depuis l'œil.
