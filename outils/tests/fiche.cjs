const { chromium } = require('playwright');
const path = require('path');
const D = __dirname;

// L'annuaire est vide depuis le 22/09/2026 : aucune salle n'est referencee sans
// l'accord du club. Ce qui se teste ici, ce n'est donc plus le passage d'un
// resultat a sa fiche, mais les deux seuls etats qui restent : la fiche
// d'exemple montree aux gerants, et la page « introuvable ».

(async () => {
  const b = await chromium.launch({ args: ['--ignore-certificate-errors'] });
  const erreurs = [];
  const p = await b.newPage({ viewport: { width: 1440, height: 1000 } });
  // le client Supabase vient de jsdelivr, injoignable ici ; les pages marchent sans lui
  p.on('console', m => { if (m.type() === 'error' && !/jsdelivr|net::ERR|Failed to load resource/.test(m.text())) erreurs.push('[console] ' + m.text()); });
  p.on('pageerror', e => erreurs.push('[page] ' + e.message));

  // --- 1. la recherche affiche son etat vide, et mene au formulaire ---
  await p.goto('file://' + path.join(D, 'recherche.html'));
  await p.waitForTimeout(1200);
  const compte = await p.textContent('#compte');
  const vide = await p.isVisible('.vide');
  // depuis le 22/09/2026 tous les boutons « Referencer ma salle » ouvrent la fenetre
  // de creation de l'espace club ; seul celui du bandeau mene a la page de vente
  const cta = await p.getAttribute('.vide-cta', 'data-compte');
  console.log('recherche   :', compte.trim(), '| etat vide =', vide, '| ouvre la fenetre:', cta !== null);
  if (!vide) erreurs.push('la recherche n\'affiche pas son etat vide');
  if (cta === null) erreurs.push('l\'etat vide n\'ouvre pas la creation de l\'espace club');
  else {
    await p.click('.vide-cta');
    await p.waitForTimeout(300);
    if (!await p.isVisible('#voile')) erreurs.push('l\'etat vide : la fenetre ne s\'ouvre pas');
    await p.click('#fermer-compte');
  }
  if (await p.locator('.res').count()) erreurs.push('des salles apparaissent alors que l\'annuaire est vide');

  // --- 2. la fiche d'exemple, atteinte depuis « referencer ma salle » ---
  await p.goto('file://' + path.join(D, 'clubs.html'));
  await p.waitForTimeout(400);
  await p.click('.hero-exemple a');
  await p.waitForLoadState('load');
  await p.waitForTimeout(1400);
  const h1 = await p.textContent('#s-nom');
  console.log('exemple     :', h1, '|', await p.title());
  if (!await p.isVisible('#bandeau-demo'))
    erreurs.push('la fiche d\'exemple n\'annonce pas qu\'elle est un exemple');

  const bilan = await p.evaluate(() => ({
    visuels:   document.querySelectorAll('#galerie .vis').length,
    // une photo qui ne charge pas laisse un cadre vide : naturalWidth le dit
    photosVues: [...document.querySelectorAll('#galerie img')]
                  .filter(i => i.naturalWidth > 0).length,
    disc:      document.querySelectorAll('#s-disc li').length,
    paras:     document.querySelectorAll('#s-presentation p').length,
    faits:     document.querySelectorAll('#s-faits div').length,
    jours:     document.querySelectorAll('#s-semaine li').length,
    cours:     document.querySelectorAll('#s-semaine .c').length,
    coord:     document.querySelectorAll('#s-coord a').length,
    autourVu:  !document.getElementById('autour').hidden,
    carteVide: (() => { const c = document.getElementById('mini');
                        return !c || c.width === 0 || c.height === 0; })(),
    debord:    document.documentElement.scrollWidth > window.innerWidth + 1,
  }));
  console.log('contenu     :', JSON.stringify(bilan));
  const attendu = await p.evaluate(() => ({
    disc: SALLE_DEMO[5].length,
    cours: SALLE_DEMO[11].planning.reduce((n, j) => n + j.cours.length, 0),
    coord: 2 + (SALLE_DEMO[11].site ? 1 : 0) + (SALLE_DEMO[11].insta ? 1 : 0)
             + (SALLE_DEMO[11].fb ? 1 : 0),
  }));
  for (const [k, v] of Object.entries({ visuels: 5, photosVues: 5, paras: 2, faits: 4, jours: 7,
                                        disc: attendu.disc, cours: attendu.cours,
                                        coord: attendu.coord }))
    if (bilan[k] !== v) erreurs.push(`${k} = ${bilan[k]}, attendu ${v}`);
  // sans annuaire, « autres salles autour » n'a rien a montrer : le bloc reste cache
  if (bilan.autourVu) erreurs.push('le bloc « salles autour » s\'affiche alors qu\'il est vide');
  if (bilan.carteVide) erreurs.push('la mini-carte est vide');
  if (bilan.debord)    erreurs.push('debordement horizontal en 1440');

  const pixels = await p.evaluate(() => {
    const c = document.getElementById('mini');
    const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data;
    const vus = new Set();
    for (let i = 0; i < d.length; i += 4 * 97) vus.add(d[i] + ',' + d[i+1] + ',' + d[i+2]);
    return vus.size;
  });
  console.log('mini-carte  :', pixels, 'couleurs distinctes');
  if (pixels < 6) erreurs.push('la mini-carte ne dessine presque rien (' + pixels + ' couleurs)');

  await p.screenshot({ path: path.join(D, 'fi-desk.png'), fullPage: true });

  // --- 3. une salle inconnue ---
  await p.goto('file://' + path.join(D, 'salle.html') + '?s=nimporte-quoi');
  await p.waitForTimeout(500);
  const intro = await p.isVisible('#introuvable');
  console.log('inconnue    : page « introuvable » affichee =', intro);
  if (!intro) erreurs.push('une salle inconnue n\'affiche pas la page introuvable');

  // --- 4. mobile ---
  const m = await b.newPage({ viewport: { width: 390, height: 844 } });
  m.on('pageerror', e => erreurs.push('[mobile] ' + e.message));
  await m.goto('file://' + path.join(D, 'salle.html') + '?demo=1');
  await m.waitForTimeout(1400);
  const debordM = await m.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
  console.log('mobile      : debordement =', debordM);
  if (debordM) erreurs.push('debordement horizontal en 390');
  await m.screenshot({ path: path.join(D, 'fi-mob.png'), fullPage: true });

  console.log(erreurs.length ? '\nPROBLEMES:\n- ' + erreurs.join('\n- ') : '\nOK, aucun probleme');
  await b.close();
  process.exit(erreurs.length ? 1 : 0);
})();
