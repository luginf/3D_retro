# SKILLS.md — Guide d'utilisation et de personnalisation

## 1. Lancer

```bash
npm install   # une fois
npm run dev   # démarre, ouvre le navigateur
```

Clique sur l'écran pour verrouiller la souris et commencer.

## 2. Contrôles

| Touche | Action |
|---|---|
| `Z`/`W` `Q`/`A` `S` `D` | Se déplacer (clavier FR & EN) |
| Souris | Regarder |
| `Espace` | Sauter |
| `Maj` | Courir (ou boost en vol) |
| `F` | Activer/couper le **vol** |
| `Espace` / `Ctrl` ou `C` | Monter / descendre (en vol) |
| **Clic droit** | Attaquer (mode Combat) |
| **Molette** / `1` `2` | Changer d'arme : pistolet ↔ épée (mode Combat) |
| `R` | Recharger le pistolet (mode Combat) |
| `Échap` | **Pause / reprise** (bascule, sans cliquer) |

## 3. Le menu (bouton `▤ MENU`, bas à droite)

Tout se règle en direct, sans toucher au code. Les choix sont **mémorisés**
(localStorage).

**Interrupteurs ON/OFF :**
- **Wireframe** — arêtes des facettes
- **Dithering** — tramage Bayer (OFF = aplats nets, avec plus de niveaux et un
  contraste renforcé)
- **Couleurs** — bascule entre la palette de bleus (défaut) et un rendu **coloré**
  (terrain par altitude, arbres verts, roches, eau, ciel)
- **Scanlines** / **Vignette** — effets CRT
- **Arbres / rochers** — végétation et cailloux
- **Eau** — plan d'eau animé
- **Nuages** — nuages low-poly dérivants
- **Vent (son)** — ambiance sonore procédurale
- **Vol** — déplacement libre sans gravité (aussi touche `F`)
- **Combat** — des animaux apparaissent : certains te **chassent**, d'autres
  **errent** dans le paysage. Trois types : *normal*, *rapide* (rougeâtre),
  *costaud* (gris, encaisse plusieurs coups). Ils ne te blessent qu'au **contact
  réel** (donc en vol, ceux au sol ne t'atteignent pas). Tire au
  **clic droit** avec le **pistolet** (munitions, `R` pour recharger, recharge
  auto si vide, léger recul). HUD en haut : arme, munitions, score, PV. Sons
  procéduraux. *(L'épée est désactivée pour le moment — le code est conservé,
  remettre `swordEnabled = true` dans `combat.js` pour la réactiver.)*
- **Commandes tactiles** — pour smartphone/tablette : joystick virtuel (bas
  gauche) pour se déplacer, **glissement** sur l'écran pour viser, boutons saut /
  tir / monter-descendre, bouton pause. Activé automatiquement sur écran tactile,
  ou via le menu sur n'importe quel appareil.
- **Cycle jour/nuit** — animation automatique du soleil (et de la lune la nuit)
- **Torche** — lumière chaude qui éclaire les environs proches, forte la nuit
- **Infos FPS** — HUD en bas à gauche

**Pixels** — curseur de précision : à gauche = gros pixels (très rétro, tramage
grossier), à droite = net. Règle la résolution interne du rendu.

**Heure** — slider (désactive le cycle auto).

**Monde :**
- **Seed** + **Régénérer** — saisis un nombre pour un monde précis
- **Aléatoire** — nouveau seed au hasard
- **Éditer relief** — ouvre l'éditeur de heightmap (voir §4)

> Le seed est aussi dans l'URL (`?seed=1234`) : copie le lien pour partager un
> monde identique.

## 4. Personnaliser le relief (heightmap)

« Éditer relief » ouvre un éditeur :
- **Peindre** sur la grille : *Lever* (blanc = montagnes) / *Creuser* (noir = vallées),
  avec une *Taille* de pinceau réglable.
- **Bruit** — génère un relief aléatoire de départ. **Effacer** — repart à plat.
- **Image** — charge une image (photo, carte de hauteur…) comme relief ;
  les zones claires montent, les sombres descendent.
- **Amplitude** — hauteur des montagnes. **Échelle** — étendue de la carte.
- **Appliquer** — reconstruit le monde avec ton relief. (« Procédural » dans le
  menu principal revient au terrain par bruit.)

## 5. Régler le rendu dans le code

`src/dither.js`
- `paletteColor()` — les 5 teintes du mode monochrome (vert/ambre/violet…)
- `uSteps` — nombre de niveaux (4 avec tramage, 6 sans)
- `uContrast` — contraste global (monte-le si le rendu sans tramage paraît plat)
- `N` — taille de la matrice de Bayer (finesse du tramage)
- Couleurs du mode coloré : `terrainColorFor()` et les `tintRGB(...)` dans `world.js`

`src/config.js`
- `HEIGHT_AMP` — hauteur des montagnes (procédural)
- `SEGMENTS` — densité des facettes (**plus bas = plus anguleux**)
- `RENDER_DISTANCE` — distance de vue vs performances
- `WATER_LEVEL` — altitude de l'eau

`src/main.js`
- `RETRO_SCALE` — taille des pixels (0.5 = rétro, 1 = net)
- `scene.fog` — distance de l'horizon
- vitesse du cycle jour/nuit : le `* 0.003` dans la boucle (plus haut = plus rapide)
- intensité/portée de la torche : `this.torch` dans `environment.js`

## 6. Dépannage

- **Rien ne bouge** : clique d'abord pour verrouiller la souris.
- **Pas de son** : les navigateurs exigent un clic avant l'audio ; active « Vent »
  après être entré dans le monde.
- **Ça rame** : baisse `RENDER_DISTANCE`, `RETRO_SCALE`, ou `SEGMENTS` ; coupe
  Arbres/Nuages dans le menu.
- **Couleurs fades** : ce sont les luminances qui comptent ; règle la palette dans
  `dither.js`.

## 7. Déployer

```bash
npm run build     # produit dist/ (site statique)
npm run preview   # test local
```

`dist/` se déploie tel quel (Netlify, GitHub Pages, Vercel, serveur de fichiers).
`base: './'` permet de servir depuis un sous-dossier. Le Web Worker est bundlé
automatiquement.
