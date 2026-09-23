/* Un club valide doit apparaitre partout ou un pratiquant le cherche, sans
   attendre une reconstruction du site : accueil, recherche, page de ville,
   page de discipline. Le rendu ecrit au build reste le repli. */
const { chromium } = require('playwright');
const http = require('http'), fs = require('fs'), path = require('path');

const RACINE = __dirname + '/../site';
const T = {'.html':'text/html; charset=utf-8','.js':'text/javascript','.svg':'image/svg+xml',
           '.jpg':'image/jpeg','.png':'image/png','.webp':'image/webp'};
const faux = fs.readFileSync(__dirname + '/../_faux_sb.js', 'utf8');

const CLUB = {
  id: 'c1', statut: 'publie', slug: 'team-ouragan-boxe', nom: 'Team Ouragan Boxe',
  ville: 'Marseille', adresse: '24 rue des Chartreux', code_postal: '13004',
  disciplines: ['Boxe anglaise', 'Kickboxing'], photos: [],
  presentation: 'Une salle de quartier ouverte à tous.',
  tel: '06 12 34 56 78', mail: 'contact@teamouragan.fr', site: '', instagram: '', facebook: '',
  horaires: { lundi: ['18:00','21:00'], mardi: ['18:00','21:00'] }, offre: 'pro'
};
const ETAT = { session:null, users:{}, equipe:[], club_membre:[], club:[CLUB], demande:[], fichiers:[] };

const srv = http.createServer((q, r) => {
  let f = decodeURIComponent(q.url.split('?')[0]); if (f === '/') f = '/index.html';
  fs.readFile(path.join(RACINE, f), (e, d) => {
    if (e) { r.statusCode = 404; r.end('404'); return; }
    r.setHeader('content-type', T[path.extname(f)] || 'application/octet-stream'); r.end(d);
  });
});

let ok = 0, ko = 0;
const dit = (b, quoi) => { console.log((b ? '  ok    ' : '  RATE  ') + quoi); b ? ok++ : ko++; };

(async () => {
  await new Promise(r => srv.listen(0, r));
  const base = 'http://127.0.0.1:' + srv.address().port + '/';
  const nav = await chromium.launch({ args: ['--ignore-certificate-errors'] });
  const ctx = await nav.newContext({ viewport: { width: 1280, height: 900 }, locale: 'fr-FR' });
  await ctx.addInitScript(faux);
  const p = await ctx.newPage();
  const errs = [];
  p.on('pageerror', e => errs.push(e.message));
  p.on('console', m => { if (m.type() === 'error'
    && !/jsdelivr|net::ERR|Failed to load resource/.test(m.text())) errs.push(m.text()); });

  await p.goto(base + 'index.html');
  await p.evaluate(e => sessionStorage.setItem('faux', JSON.stringify(e)), ETAT);

  console.log('\n1. l’accueil bascule tout seul');
  await p.goto(base + 'index.html', { waitUntil: 'networkidle' });
  await p.waitForTimeout(800);
  const acc = await p.evaluate(() => ({
    ouverture: !document.getElementById('ouverture').hidden,
    salles: !document.getElementById('salles').hidden,
    cartes: document.querySelectorAll('#liste-salles .salle').length,
    nom: document.querySelector('#liste-salles .salle-nom')?.textContent,
    note: !!document.querySelector('#liste-salles .note'),
    lien: document.querySelector('#liste-salles .salle-nom')?.getAttribute('href')
  }));
  dit(!acc.ouverture && acc.salles, '« Les salles référencées » remplace l’offre de lancement');
  dit(acc.cartes === 1 && acc.nom === 'Team Ouragan Boxe', 'le club est dans la rangée');
  dit(!acc.note, 'sans note inventée');
  dit(acc.lien === 'salle.html?s=team-ouragan-boxe', 'la carte mène à sa fiche');

  console.log('\n2. la page de la ville se complète');
  await p.goto(base + 'sports-de-combat-marseille.html', { waitUntil: 'networkidle' });
  await p.waitForTimeout(800);
  const ville = await p.evaluate(() => ({
    vide: !!document.querySelector('.vide'),
    n: document.querySelectorAll('.res').length,
    nom: document.querySelector('.res-nom a')?.textContent,
    intro: document.querySelector('.ann-intro')?.textContent || '',
    essai: document.querySelector('.res-essai')?.getAttribute('href')
  }));
  dit(!ville.vide && ville.n === 1, 'l’état « aucune salle » a laissé la place à la fiche');
  dit(ville.nom === 'Team Ouragan Boxe', 'le bon club : ' + ville.nom);
  dit(/référence 1 salle de sports de combat à Marseille/.test(ville.intro),
      'le chapeau dit le vrai compte');
  dit(ville.essai === 'salle.html?s=team-ouragan-boxe#essai', 'le bouton mène au formulaire d’essai');

  console.log('\n3. la page de la discipline aussi');
  await p.goto(base + 'boxe-anglaise.html', { waitUntil: 'networkidle' });
  await p.waitForTimeout(800);
  const disc = await p.evaluate(() => ({
    n: document.querySelectorAll('.res').length,
    intro: document.querySelector('.ann-intro')?.textContent || ''
  }));
  dit(disc.n === 1, 'le club de boxe anglaise y est');
  dit(/référence 1 salle/.test(disc.intro), 'le chapeau suit : ' + disc.intro.slice(0, 60));

  console.log('\n4. une discipline que le club n’enseigne pas reste vide');
  await p.goto(base + 'judo.html', { waitUntil: 'networkidle' });
  await p.waitForTimeout(800);
  dit(await p.evaluate(() => !!document.querySelector('.vide') &&
                             !document.querySelectorAll('.res').length),
      'la page judo dit toujours qu’il n’y a rien');

  console.log('\n5. la recherche trouve le club');
  await p.goto(base + 'recherche.html?ville=Marseille', { waitUntil: 'networkidle' });
  await p.waitForTimeout(900);
  const rech = await p.evaluate(() => ({
    compte: document.getElementById('compte')?.textContent || '',
    n: document.querySelectorAll('#liste .res').length,
    nom: document.querySelector('#liste .res-nom a')?.textContent,
    note: !!document.querySelector('#liste .note')
  }));
  dit(rech.n === 1 && rech.nom === 'Team Ouragan Boxe', 'un résultat, le bon');
  dit(/1 salle/.test(rech.compte), 'le compteur suit : ' + rech.compte);
  dit(!rech.note, 'toujours pas de note inventée');

  console.log('\n6. la même salle en fiche gratuite');
  await p.evaluate(e => sessionStorage.setItem('faux', JSON.stringify(e)),
    Object.assign({}, ETAT, { club: [Object.assign({}, CLUB, { offre: 'gratuit' })] }));
  await p.goto(base + 'sports-de-combat-marseille.html', { waitUntil: 'networkidle' });
  await p.waitForTimeout(800);
  const grat = await p.evaluate(() => ({
    n: document.querySelectorAll('.res').length,
    href: document.querySelector('.res-essai')?.getAttribute('href'),
    mot: document.querySelector('.res-essai')?.textContent
  }));
  dit(grat.n === 1, 'elle reste dans l’annuaire');
  dit(grat.href === 'salle.html?s=team-ouragan-boxe' && /Voir la salle/.test(grat.mot || ''),
      'le bouton renvoie à la fiche, pas à un formulaire de réservation');
  await p.evaluate(e => sessionStorage.setItem('faux', JSON.stringify(e)), ETAT);

  console.log('\n7. sans base, le site ne bouge pas');
  const ctx2 = await nav.newContext({ viewport: { width: 1280, height: 900 }, locale: 'fr-FR' });
  const p2 = await ctx2.newPage();
  const errs2 = [];
  p2.on('pageerror', e => errs2.push(e.message));
  await p2.goto(base + 'sports-de-combat-marseille.html', { waitUntil: 'networkidle' });
  await p2.waitForTimeout(600);
  dit(await p2.evaluate(() => !!document.querySelector('.vide')),
      'la page de ville garde son état vide');
  dit(!errs2.length, 'et ne jette aucune erreur' + (errs2.length ? ' : ' + errs2.join(' | ') : ''));

  if (errs.length) { console.log('\nERREURS :\n- ' + errs.join('\n- ')); ko += errs.length; }
  console.log('\n' + (ko ? ko + ' PROBLEME(S), ' + ok + ' ok' : 'tout passe (' + ok + ')'));
  await nav.close(); srv.close();
  process.exit(ko ? 1 : 0);
})();
