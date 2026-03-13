# OpenSkyFlight — Spécifications techniques détaillées

## Vue d'ensemble

**OpenSkyFlight** est un simulateur de vol 3D interactif fonctionnant dans le navigateur, construit avec Three.js v0.163 et des modules ES natifs. Aucune étape de build ni `npm install` n'est nécessaire. La seule dépendance runtime — Three.js — est chargée via CDN (import map). Un serveur Node.js de développement sert de proxy transparent avec cache disque pour les tuiles cartographiques.

L'application propose deux modes de terrain mutuellement exclusifs :
1. **Procédural** — Bruit Simplex (fBm) généré entièrement dans le navigateur via un Web Worker.
2. **Carte réelle** — Données d'élévation décodées depuis les tuiles Terrarium (AWS S3), avec superposition optionnelle de textures OpenStreetMap ou satellite ESRI.

---

## Architecture des fichiers

```
openskylight/
├── index.html                     Point d'entrée, CSS, layout HTML, import map Three.js
├── js/
│   ├── app.js                     Bootstrap de la scène, boucle de rendu, orchestration
│   ├── utils/
│   │   └── config.js              Objet CONFIG global, système réactif update/listener
│   ├── terrain/
│   │   ├── ChunkManager.js        Cycle de vie des chunks, LOD, dispatch procédural/réel
│   │   ├── TerrainChunk.js        Géométrie et matériau d'un chunk unique
│   │   ├── NoiseGenerator.js      Bruit Simplex 2D + fBm (copie référence thread principal)
│   │   └── terrainWorker.js       Web Worker : génération de maillage bruit + carte réelle
│   ├── geo/
│   │   ├── TileMath.js            Maths Slippy Map, anneaux LOD quadtree, calcul d'horizon
│   │   ├── ElevationProvider.js   Fetch tuiles Terrarium + décodage RGB → Float32Array
│   │   ├── TextureProvider.js     Fetch tuiles OSM/satellite → THREE.CanvasTexture
│   │   └── fetchSemaphore.js      Limiteur de concurrence côté navigateur pour fetch
│   ├── camera/
│   │   └── FPSController.js       Pointer Lock, caméra vol 6-DOF avec roulis
│   └── ui/
│       ├── HUD.js                 HUD Canvas 2D (compas, horizon, altimètre, vitesse)
│       └── ControlPanel.js        Panneau de contrôle latéral avec sliders/inputs
├── scripts/
│   ├── serve.js                   Serveur HTTP Node.js + proxy cache transparent pour tuiles
│   └── prefetch-tiles.js          CLI : pré-téléchargement en masse des tuiles dans cache/
├── cache/                         (git-ignoré) stockage local des tuiles
├── .gitignore
└── README.md
```

---

## Configuration centralisée (`js/utils/config.js`)

Toutes les valeurs de configuration sont centralisées dans un objet `CONFIG` unique avec un système de listeners réactif.

### Paramètres

| Clé | Défaut | Description |
|-----|--------|-------------|
| `chunkSize` | `256` | Taille en unités monde d'une tuile/chunk |
| `chunkResolution` | `64` | Grille de sommets par chunk (N×N) |
| `viewDistance` | `12` | Chunks visibles dans chaque direction depuis la caméra |
| `maxHeight` | `960` | Élévation maximale en unités monde (procédural) |
| `octaves` | `6` | Nombre d'octaves fBm |
| `lacunarity` | `2.0` | Multiplicateur de fréquence par octave |
| `persistence` | `0.5` | Multiplicateur d'amplitude par octave |
| `redistribution` | `1.8` | Exposant de redistribution des hauteurs (accentue les pics) |
| `seed` | `'landscape-3d'` | Graine texte pour la table de permutation du bruit |
| `cameraSpeed` | `800` | Unités monde par seconde |
| `mouseSensitivity` | `0.002` | Radians par pixel de mouvement souris |
| `maxPixelRatio` | `2` | Plafond du pixel ratio (performance) |
| `maxChunkRequestsPerFrame` | `4` | Max de nouvelles requêtes chunk par frame (procédural) |
| `wireframe` | `true` | Activation du rendu filaire |
| `waterLevel` | `0.18` | Fraction de `maxHeight` pour le plan d'eau |
| `terrainMode` | `'procedural'` | Mode actif : `'procedural'` ou `'realworld'` |
| `lat` | `45.8326` | Latitude (Mont Blanc par défaut) |
| `lon` | `6.8652` | Longitude |
| `zoom` | `15` | Niveau de zoom de base pour le mode carte réelle |
| `useOsmTexture` | `true` | Active le chargement et l'application des textures cartographiques |
| `textureSource` | `'satellite'` | Source de texture : `'osm'` ou `'satellite'` |
| `minZoom` | `3` | Zoom plancher LOD (tuiles les plus larges) |
| `maxTotalTiles` | `1000` | Budget max de tuiles simultanées |
| `lodRingRadius` | `8` | Rayon passé à `buildLodRings` |

### Système réactif

- `onChange(fn)` — Enregistre un listener `(key, value) => void`. Retourne une fonction de désinscription.
- `update(key, value)` — Met à jour `CONFIG[key]` et notifie tous les listeners uniquement si la valeur a changé.
- Implémenté via un `Set` de callbacks (itération directe, pas de bus d'événements).

---

## Point d'entrée de l'application (`js/app.js`)

### Séquence d'initialisation

1. Création du `THREE.WebGLRenderer` (antialiasé, pixel ratio plafonné à `maxPixelRatio`, couleur de fond `#0a0a1a`), ajouté au `#canvas-container`.
2. Création de la `THREE.Scene`.
3. Éclairage : `AmbientLight(0xffffff, 0.3)` + `DirectionalLight(0xffffff, 1.2)` en position `(1, 0.5, 0.8)` simulant un soleil rasant.
4. `PerspectiveCamera(70°, aspect, near=1, far=100000)` positionnée à `(0, 640, 0)`.
5. Plan d'eau : `PlaneGeometry(20000×20000, 80×80)`, `MeshBasicMaterial` bleu transparent (`opacity: 0.4`), positionné à `y = maxHeight × waterLevel`. Masqué en mode carte réelle.
6. Instanciation de `ChunkManager`, `FPSController`, `HUD`, `ControlPanel`.

### Boucle de rendu (`animate()`)

Chaque frame :
1. **Delta time** : `dt = min((now - prev) / 1000, 0.1)` — empêche les spirales de mort après un onglet en arrière-plan.
2. **Mise à jour caméra** : `fpsController.update(dt)`.
3. **Mise à jour terrain** : `chunkManager.update(camera.position)`.
4. **Frustum dynamique** : calcul de `farNeeded = effectiveViewDistance × chunkSize × 1.5`. Mise à jour de `camera.far` et `camera.near = far × 0.0001` uniquement si la différence dépasse 100 unités, puis `updateProjectionMatrix()`.
5. **Raycasting sol** : un `Raycaster` vers le bas à travers tous les meshes de chunk détermine l'élévation du sol (utilisée par l'altimètre du HUD).
6. **Plan d'eau** : suit la position XZ de la caméra.
7. **Rendu** : `renderer.render(scene, camera)`.
8. **HUD** : `hud.update(camera, groundElevation)`.
9. **Compteur FPS** : moyenne sur des fenêtres de 500 ms. Affiche FPS, nombre de triangles et de géométries dans `#stats`.

---

## Gestion du terrain (`js/terrain/ChunkManager.js`)

### État interne

| Propriété | Type | Rôle |
|-----------|------|------|
| `chunks` | `Map<string, TerrainChunk>` | Tous les chunks chargés par clé |
| `pending` | `Set<string>` | Clés des chunks en cours de génération |
| `workerReady` | `boolean` | `true` après réception de `{ type: 'ready' }` du worker |
| `_centerTile` | `{x, y}` | Coordonnées tuile de `CONFIG.lat/lon` au zoom de base |
| `_inFlightCount` | `number` | Requêtes fetch en attente de réponse |
| `_maxInFlight` | `6` | Limite de requêtes concurrentes |
| `_failedTiles` | `Map<string, timestamp>` | Tuiles échouées avec cooldown de 5 secondes |
| `_effectiveViewDistance` | `number` | Rayon de vue calculé (s'adapte à l'altitude) |
| `_currentNeededKeys` | `Set<string>` | Ensemble des clés nécessaires pour la frame LOD courante |

### Format des clés

- **Procédural** : `"cx,cz"` (ex. `"3,-2"`)
- **Carte réelle LOD** : `"zoom/tx/ty"` (ex. `"12/2126/1459"`)

### Mode procédural

1. `_spiralOrder(camCX, camCZ, dist)` génère les coordonnées de chunks en spirale, triées par distance à la caméra.
2. Pour chaque chunk manquant (jusqu'à `maxChunkRequestsPerFrame` par frame), envoie un message `generate` au worker.
3. Les chunks hors portée sont supprimés de la scène.

### Mode carte réelle — Système LOD adaptatif

#### Calcul du plan LOD (`_computeLodPlan`)

1. Calcul de l'altitude en mètres depuis `cameraPosition.y`.
2. `nearZoomForAltitude()` détermine le zoom maximal utile.
3. Position fractionnaire de la caméra en coordonnées tuile (se déplace avec la caméra, pas fixe au centre).
4. `buildLodRings()` construit l'arbre quadtree des tuiles nécessaires.

#### Mise à jour LOD (`_updateRealWorldLod`)

1. Assemble l'ensemble `neededKeys` depuis le plan LOD (plafonné à `maxTotalTiles`).
2. **Pruning** : supprime de la scène les chunks dont la clé n'est plus dans le plan.
3. **Fetch** : pour chaque tuile manquante (dans la limite `_maxInFlight`), lance `_fetchAndGenerateLod()`.
4. Met à jour `_effectiveViewDistance` d'après la couverture de l'anneau le plus éloigné.

#### Fetch et génération (`_fetchAndGenerateLod`)

1. Appelle `elevationProvider.fetchHeightmap(tx, ty, zoom)`.
2. Calcule `elevationScale = chunkSize / tileWorldSize(baseZoom)` — conversion mètres → unités monde.
3. Calcule `worldSize = 2^(baseZoom - zoom) × chunkSize` — une tuile à zoom inférieur couvre plus d'espace monde.
4. Transfère le buffer `Float32Array` au worker via `postMessage(..., [buffer])` (transfert zero-copy).

#### Réception des chunks (`_onChunkReady`)

- **Chemin LOD** (zoom défini) : vérifie que la clé est toujours nécessaire, crée le `TerrainChunk`, appelle `_projectOnSphere()` sur le buffer de positions, construit la géométrie, positionne le mesh à `(0,0,0)` (déjà en espace monde), applique la texture si activée.
- **Chemin procédural** : vérifie `_isInRange()`, crée le chunk, la position du mesh est définie dans `buildFromBuffers`.

### Projection sphérique (`_projectOnSphere`)

Projette les sommets plats sur la sphère terrestre pour simuler la courbure :

```
metersPerUnit = tileWorldSize(baseZoom) / chunkSize
R = EARTH_RADIUS / metersPerUnit    // rayon terrestre en unités monde
```

Pour chaque sommet :
- `(wx, wz)` = position monde absolue sur le plan
- `dist = √(wx² + wz²)` = distance au point central
- `θ = dist / R` = déplacement angulaire sur la sphère
- `φ = atan2(wz, wx)` = azimut sur le plan
- `r = R + wy` = rayon depuis le centre de la sphère (inclut l'élévation)
- Coordonnées sphériques : `x = r·sin(θ)·cos(φ)`, `y = r·cos(θ) - R`, `z = r·sin(θ)·sin(φ)`

Le centre de la sphère est à `(0, -R, 0)`, de sorte que la surface à l'origine est à `y=0`.

### Gestion des textures

- `_getTextureSource()` retourne `CONFIG.textureSource` (`'osm'` ou `'satellite'`).
- `_applyTextureLod(chunk, tx, ty, zoom)` — charge via `TextureProvider` et applique à la géométrie.
- `_toggleTextures(useTexture)` — vide le cache de textures, réapplique ou retire les textures sur tous les chunks existants.
- Un changement de `textureSource` ou `useOsmTexture` déclenche `_toggleTextures()`.

---

## Chunk de terrain (`js/terrain/TerrainChunk.js`)

Représente une tuile de terrain unique. Encapsule un `THREE.BufferGeometry` et un `THREE.Mesh`.

### Construction (`buildFromBuffers`)

- Crée une `BufferGeometry` avec attributs `position` (3), `color` (3), index, et optionnellement `uv` (2).
- Appelle `computeVertexNormals()` et `computeBoundingSphere()` (pour le frustum culling).
- Le mesh partage un matériau wireframe commun à tous les chunks.

### Gestion des textures (`setTexture`)

- **Texture définie** : crée paresseusement un `MeshPhongMaterial` (DoubleSide, wireframe hérité). Assigne la `map`, désactive `vertexColors`.
- **Texture null** : revert vers le matériau wireframe partagé.

### Nettoyage (`dispose`)

- Garde contre le double-dispose via un flag `disposed`.
- Dispose de la géométrie et du matériau texturé (le matériau partagé n'est pas disposé).

### Génération d'indices (`static generateIndices`)

- Génère un buffer d'indices standard pour une grille `res × res`.
- Deux triangles par quad : `(a, b, c)` et `(b, d, c)`.
- Choisit automatiquement `Uint16Array` ou `Uint32Array` selon le nombre de sommets.

---

## Génération de bruit (`js/terrain/NoiseGenerator.js`)

### Algorithme Simplex 2D

Adapté de l'implémentation de Stefan Gustavson :
- Facteurs de skewing : `F2 = 0.5×(√3-1)` et `G2 = (3-√3)/6`.
- 8 vecteurs gradient : les 4 diagonales et les 4 directions axiales 2D.
- Retourne une valeur dans `[-1, 1]` environ.

### Table de permutation (`buildPermTable`)

- Crée un tableau identité de 256 éléments, puis effectue un Fisher-Yates shuffle avec un hash polynomial : `s = (s << 5) - s + charCode` suivi d'un LCG `s = (s × 16807) & 0x7fffffff`.
- Produit `perm[512]` et `permMod8[512]` (doublés pour éviter les modulos).

### fBm (fractional Brownian motion)

- fBm standard avec accumulation d'octaves.
- Normalise le résultat dans `[0, 1]` via `(value / max + 1) × 0.5`.

### Palette de couleurs par altitude (`getColor`)

Interpolation linéaire entre 9 seuils :

| Altitude normalisée | Couleur |
|---------------------|---------|
| 0.00 | Eau profonde (bleu foncé) |
| 0.15 | Eau peu profonde (bleu) |
| 0.20 | Plage (sable) |
| 0.30 | Plaines (vert clair) |
| 0.50 | Prairies (vert moyen) |
| 0.65 | Collines (brun) |
| 0.80 | Montagnes (gris-brun) |
| 0.90 | Haute montagne (gris clair) |
| 1.00 | Neige (quasi blanc) |

---

## Web Worker (`js/terrain/terrainWorker.js`)

Exécute la génération de maillage hors du thread principal. Contient une copie inline du code Simplex (les Workers classiques ne supportent pas les imports ES modules sans `{ type: 'module' }`).

### Protocole de messages

#### Entrants

| `type` | Payload | Action |
|--------|---------|--------|
| `'init'` | `{ seed }` | Construit la table de permutation, envoie `{ type: 'ready' }` |
| `'generate'` | `{ cx, cz, res, chunkSize, maxHeight, octaves, lacunarity, persistence, redistribution }` | Génère un chunk procédural |
| `'generate-real'` | `{ cx, cz, heightmap, chunkSize, elevationScale, res, zoom }` | Génère un chunk carte réelle depuis un heightmap |

#### Sortants

| `type` | Payload |
|--------|---------|
| `'ready'` | (aucun) |
| `'chunk'` | `{ cx, cz, positions, colors, indices, uvs?, res, zoom? }` (ArrayBuffers transférés) |

### Génération procédurale

- Fréquence spatiale : `scale = 0.002`.
- Pour chaque sommet (`res × res`), échantillonne `fbm` aux coordonnées monde.
- Applique l'exposant `redistribution` : `h = h^redistribution`.
- Positions en espace local (origine au coin du chunk).
- Couleurs depuis `getColor(h)`. Pas d'UVs.

### Génération carte réelle

- `COLOR_MAX_ELEV = 4500 m` pour le mapping couleur : `h = elevation / 4500`.
- Heightmap toujours 256×256 pixels.
- Positions : `(x/(res-1) × chunkSize, max(0, elevation) × elevationScale, z/(res-1) × chunkSize)`.
- Génère aussi un tableau `uvs` pour le placage de texture : `(x/(res-1), z/(res-1))`.

---

## Mathématiques cartographiques (`js/geo/TileMath.js`)

Utilitaires purs pour la conversion de coordonnées Web Mercator, le calcul d'horizon et la construction LOD. Aucune dépendance.

### Fonctions de conversion

- **`latLonToTile(lat, lon, zoom)`** — Formule Slippy Map standard.
- **`tileToLatLon(x, y, zoom)`** — Inverse.
- **`tileWorldSize(zoom)`** — Mètres par tuile à l'équateur : `40075016.686 / 2^zoom`.

### Constantes

- **`EARTH_RADIUS`** : `6 371 000` mètres.

### Calcul d'horizon (`horizonTiles`)

Distance géométrique de l'horizon : `d = √(2Rh + h²)`, convertie en tuiles.

### Zoom adaptatif (`nearZoomForAltitude`)

Calcule le zoom maximal utile pour une altitude donnée avec un FOV de ~70° :
```
desiredTileMeters = max(altMeters × 0.2, 1)
z = floor(log₂(40075016.686 / desiredTileMeters))
```
Clampé entre `[minZoom, baseZoom]`.

### Construction LOD quadtree (`buildLodRings`)

Remplace l'ancien système d'anneaux concentriques par une subdivision quadtree récursive :

1. Calcule la distance d'horizon en mètres.
2. Détermine un `startZoom` où une petite grille couvre l'horizon.
3. Démarre avec une grille `startRadius × startRadius` de tuiles au `startZoom`.
4. Pour chaque tuile, visite récursivement ses 4 enfants au `zoom+1` si la caméra est à moins de `SUBDIVIDE_K × tileWorldSize(zoom)` mètres (avec `SUBDIVIDE_K = 6`).
5. Sinon, inclut la tuile dans la liste finale.
6. Utilise un `Set visited` pour empêcher les doublons.
7. Groupe le résultat par zoom, retourne `[{ zoom, tiles: [{tx, ty}] }]` du zoom le plus élevé (détaillé) au plus bas.

**Propriété clé** : les tuiles adjacentes à même distance ont toujours le même niveau de zoom — pas de coutures LOD visibles.

---

## Fournisseur d'élévation (`js/geo/ElevationProvider.js`)

Récupère les tuiles PNG Terrarium (AWS S3) et les décode en `Float32Array` de hauteurs en mètres.

### Encodage Terrarium

```
hauteur (m) = (R × 256 + G + B / 256) - 32768
```

### Processus de chargement

1. Vérification du cache mémoire `Map`.
2. Acquisition d'un slot sémaphore via `acquireFetch()`.
3. Double vérification du cache (protection contre les races).
4. Fetch via `tiles/terrarium/{zoom}/{tileX}/{tileY}.png` (routé par le proxy cache).
5. Création d'un `ImageBitmap` depuis le blob de réponse.
6. Dessin sur un `<canvas>` 256×256 avec `willReadFrequently: true`.
7. Lecture `getImageData` et application de la formule de décodage pixel par pixel.
8. Mise en cache et retour du `Float32Array`.

---

## Fournisseur de textures (`js/geo/TextureProvider.js`)

Récupère les images de tuiles cartographiques (OSM ou satellite ESRI) et les convertit en `THREE.CanvasTexture`.

### `fetchTexture(tileX, tileY, zoom, source='osm')`

1. Cache par clé `source/zoom/tileX/tileY`.
2. Acquisition sémaphore.
3. Fetch `tiles/{source}/{zoom}/{tileX}/{tileY}.png`.
4. `ImageBitmap` depuis le blob.
5. `THREE.CanvasTexture` avec `LinearFilter` min/mag et `ClampToEdgeWrapping`.

---

## Sémaphore de concurrence (`js/geo/fetchSemaphore.js`)

Limiteur côté navigateur empêchant `ERR_INSUFFICIENT_RESOURCES` lors de trop de `fetch()` simultanés.

- `MAX_CONCURRENT = 6`.
- `acquireFetch()` — si `active < 6`, incrémente et résout immédiatement. Sinon, met en file d'attente une Promise.
- `releaseFetch()` — si la file n'est pas vide, résout la prochaine promesse. Sinon, décrémente `active`.
- C'est un sémaphore compteur correct implémenté avec des Promises.
- Partagé entre `ElevationProvider` et `TextureProvider`.

---

## Contrôleur de caméra (`js/camera/FPSController.js`)

Contrôleur de caméra de type simulation de vol utilisant l'API Pointer Lock. Implémente un mouvement 6-DOF avec roulis cosmétique.

### État

| Variable | Description |
|----------|-------------|
| `yaw` | Angle de lacet horizontal (radians, rotation axe Y) |
| `pitch` | Angle de tangage vertical (radians, rotation axe X), clampé `(-π/2+0.01, π/2-0.01)` |
| `roll` | Angle de roulis (radians, rotation axe Z), piloté par le taux de lacet |
| `yawRate` | Taux de changement de lacet (décroît par frame), pour le calcul du roulis |
| `keys` | Dict `code → boolean` pour les touches enfoncées |
| `locked` | État Pointer Lock actif |

### Contrôles

- **Souris** (en Pointer Lock) : met à jour `yaw`, `pitch`, `yawRate`.
- **Clavier** : `W/↑` avancer, `S/↓` reculer, `A/←` dériver gauche, `D/→` dériver droite.
- **Clic** sur le canvas : demande le Pointer Lock.

### Mise à jour (`update(dt)`)

1. Calcul du vecteur avant : `(-sin(yaw)·cos(pitch), sin(pitch), -cos(yaw)·cos(pitch))`.
2. Calcul du vecteur droit (horizontal) : `(cos(yaw), 0, -sin(yaw))`.
3. Normalisation et application à `camera.position`.
4. **Roulis** : `targetRoll = clamp(yawRate × 25, -0.5, 0.5)`. Lerp : `roll += (targetRoll - roll) × 5 × dt`. Décroissance : `yawRate *= max(0, 1 - 8·dt)`.
5. Ordre de rotation : `YXZ` (standard vol/FPS : lacet, tangage, roulis).

---

## HUD — Affichage tête haute (`js/ui/HUD.js`)

Instruments de vol style aéronautique rendus sur un canvas 2D superposé, redessinés chaque frame.

### Caractéristiques visuelles

- Couleur : `#00ff88` (vert-turquoise) à alpha `0.7`.
- Support DPR : le canvas physique = taille logique × `devicePixelRatio`.

### Instruments

#### 1. Compas / Cap (`_drawCompass`)

- Bande horizontale en haut au centre (400 px), montrant 90° d'arc.
- Conversion : `headingDeg = (-yaw × 180/π) mod 360`.
- Graduations tous les 5° (majeures à 10°).
- Labels cardinaux en français : N, NE, E, SE, S, SO, O, NO.
- Triangle indicateur central + affichage `HDG 045°`.

#### 2. Horizon artificiel (`_drawHorizon`)

- Ligne d'horizon décalée verticalement par `pitchDeg × 8 px/°`.
- Échelle de tangage : lignes tiretées sous l'horizon, pleines au-dessus, tous les 10°.
- Symbole d'avion fixe (ailes + point central) toujours au centre de l'écran.

#### 3. Altimètre (`_drawAltimeter`)

- Bande verticale à droite du centre.
- En mode carte réelle : conversion en mètres via `elevationScale = chunkSize / tileWorldSize`.
- Échelle défilante avec graduations. Pas = 100 m (réel) ou 50 unités (procédural).
- Affichage **AGL** (Above Ground Level) = altitude - élévation sol (depuis le raycaster).

#### 4. Indicateur de vitesse (`_drawSpeed`)

- Bande verticale à gauche du centre.
- Affiche `CONFIG.cameraSpeed` (statique, pas de vélocité réelle calculée).
- Label : `SPD`.

---

## Panneau de contrôle (`js/ui/ControlPanel.js`)

Connecte le panneau HTML latéral droit au système `CONFIG`.

### Fonctionnalités

- **Sélecteur de mode** : alterne entre `procedural` et `realworld`, bascule la visibilité des contrôles associés, déclenche `onRegenerate`.
- **Recherche de lieu** : appelle l'API Nominatim (`nominatim.openstreetmap.org`) pour géocoder un nom de lieu. Remplit les champs lat/lon.
- **Sliders** : Resolution (16-128), Distance de vue (2-25), Hauteur max (100-2400), Octaves (1-8), Vitesse caméra (50-4000).
- **Checkbox wireframe** : bascule le rendu filaire.
- **Checkbox texture** : active/désactive l'affichage des textures.
- **Sélecteur source texture** : Satellite (ESRI) ou OpenStreetMap.
- **Champ seed** : graine pour la génération procédurale.
- **Boutons** : Régénérer (procédural), Charger le terrain (carte réelle).

### Collapse du panneau

Animation CSS via `transform: translateX(calc(100% + 12px))` avec `transition: 0.3s ease`. Bouton toggle `◀`/`▶`.

---

## Serveur de développement (`scripts/serve.js`)

Serveur HTTP Node.js servant à la fois de serveur de fichiers statiques et de proxy cache transparent pour les tuiles.

### Utilisation

```bash
node scripts/serve.js [--port 3000]
```

### Serveur statique

- Protection basique contre le traversal de répertoires (suppression de `..`).
- `/` → `index.html`.
- Types MIME pour `.html`, `.js`, `.css`, `.png`, `.jpg`, `.json`, `.svg`, `.ico`.

### Proxy de tuiles

- Pattern d'URL : `/tiles/{source}/{z}/{x}/{y}.png` (regex `TILE_RE`).
- **Cache hit** : lecture de `cache/{source}/{z}/{x}/{y}.{ext}`, réponse avec `X-Cache: HIT`.
- **Cache miss** : fetch upstream, sauvegarde en `cache/` (fire-and-forget), réponse avec `X-Cache: MISS`.

### Sources upstream

| Nom | URL | Format |
|-----|-----|--------|
| `terrarium` | `https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png` | PNG |
| `osm` | `https://tile.openstreetmap.org/{z}/{x}/{y}.png` | PNG |
| `satellite` | `https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}` | JPEG |

**Note** : l'URL ESRI utilise `{z}/{y}/{x}` (y avant x).

### Sémaphore sortant

Même pattern que `fetchSemaphore.js` — limite à 6 fetches upstream concurrents.

---

## Outil de pré-téléchargement (`scripts/prefetch-tiles.js`)

CLI pour le téléchargement en masse de tuiles dans le répertoire cache.

### Utilisation

```bash
node scripts/prefetch-tiles.js --lat 45.8326 --lon 6.8652 [--zoom 12] [--radius 12] [--delay 100]
```

### Fonctionnement

1. Convertit `lat/lon` en tuile centrale.
2. Génère une grille `(2×radius+1)²` de tuiles.
3. Pour chaque tuile × chaque source (`terrarium`, `osm`) : vérifie l'existence en cache, télécharge si absent.
4. Délai entre téléchargements pour respecter les limites de débit.
5. Affiche la progression en pourcentage.

---

## Flux de données

### Mode procédural

```
app.js (boucle de rendu)
  └─► ChunkManager.update(cameraPos)
        └─► _updateProcedural(camCX, camCZ)
              └─► _spiralOrder() → liste [cx,cz] triée
              └─► worker.postMessage({ type:'generate', ... })
                    │  (off-thread)
                    ▼
              terrainWorker.js
                    └─► fbm() par sommet → positions, colors, indices
                    └─► postMessage({ type:'chunk', ... }, [buffers])
                    │  (thread principal)
                    ▼
              _onChunkReady()
                    └─► TerrainChunk → buildFromBuffers() → scene.add()
```

### Mode carte réelle

```
app.js (boucle de rendu)
  └─► ChunkManager.update(cameraPos)
        └─► _updateRealWorldLod(cameraPos)
              └─► buildLodRings() → neededKeys
              └─► _fetchAndGenerateLod(zoom, tx, ty) [async, ≤6 en vol]
                    └─► ElevationProvider.fetchHeightmap()
                          └─► fetchSemaphore [≤6 concurrents]
                          └─► fetch("tiles/terrarium/z/x/y.png")
                                → serve.js (proxy cache) → AWS S3
                          └─► décodage Terrarium RGB → Float32Array
                    └─► worker.postMessage({ type:'generate-real', ... })
                          │  (off-thread)
                          ▼
                    terrainWorker.js
                          └─► échantillonnage heightmap → positions, colors, uvs
                          └─► postMessage({ type:'chunk', zoom, ... })
                          │  (thread principal)
                          ▼
                    _onChunkReady()
                          └─► _projectOnSphere(positions)
                          └─► TerrainChunk → buildFromBuffers() → scene.add()
                          └─► _applyTextureLod() [async, si activé]
                                └─► TextureProvider.fetchTexture()
                                └─► chunk.setTexture(texture)
```

---

## Décisions techniques clés

1. **Pas de bundler / pas de build** : l'import map ES dans `index.html` résout `"three"` vers un CDN. Tous les autres imports sont relatifs au projet.

2. **Web Worker pour la géométrie** : la génération de maillage (bruit, heightmap, indices) tourne hors du thread principal. Les `ArrayBuffer` sont transférés (zero-copy) via structured clone.

3. **Duplication du code worker** : `terrainWorker.js` inline le code Simplex plutôt que d'utiliser `{ type: 'module' }`, assurant la compatibilité navigateur.

4. **LOD quadtree** : `buildLodRings` utilise une subdivision quadtree récursive plutôt que des anneaux concentriques fixes. Les tuiles ne se subdivisent que lorsque la caméra est assez proche. La couverture s'étend jusqu'à l'horizon géométrique.

5. **Courbure terrestre sphérique** : les tuiles carte réelle sont projetées sur une sphère dans `_projectOnSphere()`. Le centre de la sphère est sous l'origine de la scène pour que la zone locale reste visuellement plate, tandis que les tuiles distantes se courbent correctement.

6. **Plans de frustum dynamiques** : `camera.far` et `camera.near` sont recalculés à chaque frame selon `effectiveViewDistance`, garantissant que les tuiles LOD distantes ne sont jamais clippées tout en gardant le depth buffer précis (`near = far × 0.0001`).

7. **Double sémaphore** : `fetchSemaphore.js` (navigateur) et `acquireOutbound` (serveur) plafonnent indépendamment l'activité réseau à 6 connexions concurrentes.

8. **Plan d'eau** : un simple `PlaneGeometry` qui suit la position XZ de la caméra à une altitude Y fixe. Visible uniquement en mode procédural.

9. **Architecture de cache de tuiles** : le serveur utilise un pattern proxy transparent. Le navigateur demande `/tiles/{source}/...` quel que soit l'état du cache. Le serveur résout depuis le disque ou l'upstream, sans changement côté navigateur. Le cache est organisé par nom de source.

10. **Sources de textures multiples** : satellite (ESRI World Imagery) et OpenStreetMap, sélectionnables dynamiquement. Le changement de source vide le cache de textures et réapplique les nouvelles textures sur tous les chunks existants.
