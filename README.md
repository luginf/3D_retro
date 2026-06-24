# Vector World

Monde 3D rétro **low-poly à facettes plates** (style 3D vectorielle / démos 16 bits) :
montagnes procédurales, palette de bleus limitée, **tramage Bayer**, wireframe,
plan d'eau animé, arbres/rochers, **cycle jour/nuit**, nuages, soleil, ambiance
de vent, effets **CRT** (scanlines + vignette), menu pixel-art et **éditeur de
relief** (heightmap chargeable ou peinte).

Stack : **Three.js**, **Vite**, **simplex-noise**.

## Démarrer

```bash
npm install
npm run dev
```

Clique sur l'écran pour entrer dans le monde.

## Contrôles

| Touche | Action |
|---|---|
| ZQSD / WASD | Se déplacer |
| Souris | Regarder |
| Espace | Sauter |
| Maj | Courir |
| Échap | Libérer la souris |

## Menu (bas à droite)

Bouton `▤ MENU` discret. On/off pour : Wireframe, **Dithering**, Scanlines,
Vignette, Arbres/rochers, Eau, Nuages, Vent (son), Cycle jour/nuit, Infos FPS.
Slider d'heure. Section **Monde** : seed (Régénérer / Aléatoire) et
**Éditer relief** (éditeur de heightmap).

## Personnaliser le monde

- **Seed** : dans le menu, ou via l'URL `?seed=1234` (partageable, reproductible).
- **Heightmap** : « Éditer relief » ouvre un éditeur où l'on **peint** le terrain
  (blanc = montagne, noir = vallée), **charge une image** comme relief, et règle
  amplitude/échelle. « Procédural » revient au terrain par bruit.

## Architecture

Voir `CLAUDE.md` (détaillé). En bref : `main.js` orchestre ; `world.js` gère le
terrain par chunks (géométrie produite dans un **Web Worker**) + arbres/rochers
instanciés ; `dither.js` est la passe post-process qui crée tout le look ;
`environment.js` gère ciel/soleil/nuages/jour-nuit ; `player.js` la balade FPS ;
`menu.js`, `heightmap.js`, `audio.js` pour l'UI, l'éditeur et le son.

## Réglages clés

`src/config.js` — `CHUNK_SIZE`, `SEGMENTS` (anguleux), `HEIGHT_AMP`,
`WATER_LEVEL`, `RENDER_DISTANCE`.
`src/dither.js` — `paletteColor()` (les teintes), `steps` (nombre de niveaux), `N` (finesse).
`src/main.js` — `RETRO_SCALE` (taille des pixels), `scene.fog`.
