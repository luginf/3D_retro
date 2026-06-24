// Menu discret pixel-art (bas a droite) : active/desactive les options,
// regenere le monde par seed, ouvre l'editeur de heightmap.
const TOGGLES = [
  ['wireframe', 'Wireframe'],
  ['dither', 'Dithering'],
  ['colorMode', 'Couleurs'],
  ['scanlines', 'Scanlines'],
  ['vignette', 'Vignette'],
  ['trees', 'Arbres / rochers'],
  ['water', 'Eau'],
  ['clouds', 'Nuages'],
  ['audio', 'Vent (son)'],
  ['dayNightAuto', 'Cycle jour/nuit'],
  ['flying', 'Vol (touche F)'],
  ['hud', 'Infos FPS'],
];

export function buildMenu(api) {
  const root = document.createElement('div');
  root.id = 'menu';

  const btn = document.createElement('button');
  btn.id = 'menu-toggle';
  btn.textContent = '▤ MENU';
  root.appendChild(btn);

  const panel = document.createElement('div');
  panel.id = 'menu-panel';
  panel.style.display = 'none';
  root.appendChild(panel);

  // --- Options on/off ----------------------------------------------------
  for (const [key, label] of TOGGLES) {
    const row = document.createElement('div');
    row.className = 'menu-row';
    const span = document.createElement('span');
    span.textContent = label;
    const t = document.createElement('button');
    t.className = 'menu-tgl';
    const sync = () => {
      const on = api.get(key);
      t.textContent = on ? 'ON' : 'OFF';
      t.classList.toggle('on', on);
    };
    t.addEventListener('click', () => { api.set(key, !api.get(key)); sync(); });
    sync();
    row.appendChild(span);
    row.appendChild(t);
    panel.appendChild(row);
  }

  // --- Precision pixels (resolution interne / taille du tramage) ---------
  const pxRow = document.createElement('div');
  pxRow.className = 'menu-row';
  pxRow.innerHTML = '<span>Pixels</span>';
  const px = document.createElement('input');
  px.type = 'range';
  px.min = '20';
  px.max = '100';
  px.step = '5';
  px.title = 'Gauche = gros pixels (très rétro), droite = net';
  px.value = String(Math.round(api.get('pixelScale') * 100));
  px.addEventListener('input', () => api.set('pixelScale', +px.value / 100));
  pxRow.appendChild(px);
  panel.appendChild(pxRow);

  // --- Heure (slider) ----------------------------------------------------
  const timeRow = document.createElement('div');
  timeRow.className = 'menu-row';
  timeRow.innerHTML = '<span>Heure</span>';
  const time = document.createElement('input');
  time.type = 'range';
  time.min = '0';
  time.max = '1000';
  time.value = String(Math.round(api.get('timeOfDay') * 1000));
  time.addEventListener('input', () => {
    api.set('dayNightAuto', false);
    api.set('timeOfDay', +time.value / 1000);
    refreshToggles();
  });
  timeRow.appendChild(time);
  panel.appendChild(timeRow);

  // --- Monde : seed ------------------------------------------------------
  const sep = document.createElement('div');
  sep.className = 'menu-sep';
  sep.textContent = '— MONDE —';
  panel.appendChild(sep);

  const seedRow = document.createElement('div');
  seedRow.className = 'menu-row';
  seedRow.innerHTML = '<span>Seed</span>';
  const seed = document.createElement('input');
  seed.type = 'number';
  seed.className = 'menu-seed';
  seed.value = String(api.currentSeed());
  seedRow.appendChild(seed);
  panel.appendChild(seedRow);

  const btnRow = document.createElement('div');
  btnRow.className = 'menu-row menu-buttons';
  const gen = mkBtn('Régénérer', () => { api.regenerate(parseInt(seed.value, 10) || 0); });
  const rnd = mkBtn('Aléatoire', () => { seed.value = String(api.randomSeed()); });
  btnRow.appendChild(gen);
  btnRow.appendChild(rnd);
  panel.appendChild(btnRow);

  const hmRow = document.createElement('div');
  hmRow.className = 'menu-row menu-buttons';
  const edit = mkBtn('Éditer relief', () => api.openEditor());
  const proc = mkBtn('Procédural', () => { api.regenerate(parseInt(seed.value, 10) || 0); });
  hmRow.appendChild(edit);
  hmRow.appendChild(proc);
  panel.appendChild(hmRow);

  btn.addEventListener('click', () => {
    panel.style.display = panel.style.display === 'none' ? 'block' : 'none';
  });

  function refreshToggles() {
    for (const t of panel.querySelectorAll('.menu-tgl')) {
      const idx = [...panel.querySelectorAll('.menu-tgl')].indexOf(t);
      const on = api.get(TOGGLES[idx][0]);
      t.textContent = on ? 'ON' : 'OFF';
      t.classList.toggle('on', on);
    }
  }

  document.body.appendChild(root);
  return { refresh: refreshToggles };
}

function mkBtn(label, onClick) {
  const b = document.createElement('button');
  b.className = 'menu-btn';
  b.textContent = label;
  b.addEventListener('click', onClick);
  return b;
}
