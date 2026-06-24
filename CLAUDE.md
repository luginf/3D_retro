# CLAUDE.md

Notes pour travailler sur ce dépôt avec Claude Code.

## Le projet

**Vector World** — monde 3D rétro *low-poly à facettes plates* (style 3D
vectorielle), explorable en vue FPS. Montagnes procédurales, palette de bleus +
tramage Bayer, wireframe, eau animée, arbres/rochers, cycle jour/nuit, nuages,
soleil, ambiance de vent, effets CRT, menu pixel-art et éditeur de heightmap.

Stack : **Three.js** (rendu + post-processing), **Vite** (dev/build),
**simplex-noise** (bruit). JavaScript pur (ES modules), pas de TypeScript.

## Commandes

```bash
npm install
npm run dev      # serveur de dev (ouvre le navigateur)
npm run build    # build de production dans dist/
npm run preview  # sert le build
```

Pas de tests ni de linter. Validation : `npm run build` doit passer, puis
vérification visuelle avec `npm run dev` (le rendu WebGL ne se juge qu'à l'écran).

## Carte des fichiers (`src/`)

| Fichier | Rôle |
|---|---|
| `main.js` | Orchestrateur : scène, rendu, eau, réglages, boucle, câblage du menu/éditeur |
| `config.js` | Constantes partagées (taille chunk, amplitude, niveau d'eau…) |
| `noise.js` | RNG seedé (`mulberry32`) + `makeHeightFn(seed)` (fbm Simplex) |
| `terrain-geo.js` | `buildTerrainBuffers(getHeight, cx, cz)` — sans Three.js (utilisé aussi par le worker) |
| `worker.js` | Web Worker : génère la géométrie des chunks (mode procédural) |
| `world.js` | Classe `World` : chunks, arbres/rochers instanciés, modes procédural/custom |
| `player.js` | Classe `Player` : FPS, gravité, saut, suivi du sol |
| `dither.js` | `makeDitherPass()` — la passe post-process (palette + tramage + CRT + jour/nuit) |
| `environment.js` | Ciel, soleil, nuages, lumières, cycle jour/nuit |
| `audio.js` | `WindAudio` — vent procédural (WebAudio, sans fichier) |
| `heightmap.js` | Sampler de heightmap + éditeur (peinture / chargement d'image) |
| `menu.js` | Menu pixel-art (bas à droite) |
| `index.html` | Overlay, viseur, HUD, CSS (menu, éditeur, pixelisation) |

## Pipeline de rendu (l'esthétique)

1. Terrain en **flat shading** (facettes) + wireframe superposé (géométrie
   partagée, `polygonOffset` anti z-fighting). Arbres/rochers en `InstancedMesh`
   avec couleurs de sommet (luminances trunk/feuillage différentes).
2. `EffectComposer` : `RenderPass` → **dither pass** (`dither.js`).
3. La dither pass : luminance → seuil **Bayer 8×8** (désactivable, uniform
   `uDither`) → quantif sur **palette de 5 bleus** → teinte jour/nuit
   (`uBrightness`, `uTint`) → scanlines + vignette (`uScanline`, `uVignette`).

**Règle d'or : seules les *luminances* des matériaux comptent**, pas leurs
teintes — la palette de `dither.js` remappe tout. Pour changer l'aspect, on règle
le gris d'un matériau et/ou la palette.

## Génération du terrain

- Le monde est un **heightmap**. `world.getHeight(x, z)` est la source de vérité
  (joueur, eau, scatter). Deux modes :
  - **procédural** : `makeHeightFn(seed)` (déterministe) ; la *géométrie* des
    chunks est calculée dans le **worker** pour éviter les saccades.
  - **custom** : heightmap fournie par l'éditeur (image ou peinture) ;
    génération synchrone sur le thread principal.
- Chunks chargés/déchargés dans `RENDER_DISTANCE`. Les sommets de bord utilisent
  les coords monde → chunks voisins identiques aux jointures (pas de fissures).
- `world.gen` (compteur) ignore les réponses worker périmées après régénération.

## Conventions

- ES modules, classes simples. Commentaires en français, concis, sur le *pourquoi*.
- Three core via `'three'`, extras via `'three/addons/...'`.
- Réutiliser les `Vector3`/`Color`/`Matrix4` dans les boucles chaudes.
- Réglages dans `localStorage` (`vw-settings`), seed dans l'URL (`?seed=`).
- `dist/` jetable, non commité.

## Pièges connus

- Géométrie de chunk **partagée** fill+wire : ne la disposer qu'une fois
  (`group.children[0].geometry.dispose()`). Les géos d'arbres/rochers sont
  **globales** : ne jamais les disposer au déchargement.
- L'audio ne peut démarrer qu'après un **geste utilisateur** (le clic de lock) —
  ne pas l'activer dans l'application initiale des réglages.
- Le tramage et les scanlines utilisent `gl_FragCoord` → liés à `RETRO_SCALE`
  (résolution interne), pas à la taille de fenêtre.
- Eau, arbres et rochers sont **visuels** (pas de collision).
- Worker : `new Worker(new URL('./worker.js', import.meta.url), { type: 'module' })`
  (syntaxe nécessaire pour que Vite le bundle).

## Pour aller plus loin

`SKILLS.md` (guide d'utilisation/personnalisation).
