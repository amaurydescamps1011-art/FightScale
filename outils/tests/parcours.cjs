/* Le parcours complet, sur le site tel qu'il sera deploye (site/), pas sur les
   morceaux. L'annuaire est vide depuis le 22/09/2026 : le parcours teste n'est
   donc plus celui d'un pratiquant qui trouve une salle, mais celui d'un gerant
   qui tombe sur une page vide et arrive au formulaire. Chaque page qui pourrait
   afficher des salles doit dire clairement qu'il n'y en a pas et tendre le lien
   « Referencer ma salle ». */
const { chromium } = require('playwright');
const path = require('path');
const S = path.join(__dirname, '..', 'site');
const url = f => 'file://' + path.join(S, f);

(async () => {
  const b = await chromium.launch({ args: ['--ignore-certificate-errors'] });
  const erreurs = [];
  const p = await b.newPage({ viewport: { width: 1440, height: 950 }, locale: 'fr-FR' });
  // le client Supabase vient de jsdelivr, injoignable ici ; les pages marchent sans lui
  p.on('console', m => { if (m.type() === 'error' && !/jsdelivr|net::ERR|Failed to load resource/.test(m.text())) erreurs.push('[console] ' + m.text()); });
  p.on('pageerror', e => erreurs.push('[page] ' + e.message));

  const pas = [];

  // --- 1. accueil : plus de cartes de salles, l'offre aux premiers clubs ---
  await p.goto(url('index.html'));
  await p.waitForTimeout(700);
  const acc = await p.evaluate(() => {
    var ouv = document.getElementById('ouverture');
    var sal = document.getElementById('salles');
    return {
      titre: document.title,
      cartes: document.querySelectorAll('.salle').length,
      // La page porte les deux sections ; tant que l'annuaire est vide c'est
      // l'offre aux premiers clubs qui doit s'afficher, et elle seule.
      ouvertureVisible: !!ouv && !ouv.hidden,
      sallesVisible: !!sal && !sal.hidden,
      cta: !!document.querySelector('#ouverture a[href="clubs.html"]'),
      chiffres: document.querySelectorAll('#ouverture .ouv-nb').length,
    };
  });
  pas.push(['accueil', JSON.stringify(acc)]);
  if (acc.cartes) erreurs.push('accueil : ' + acc.cartes + ' cartes de salles alors que l\'annuaire est vide');
  if (!acc.ouvertureVisible) erreurs.push('accueil : l\'offre aux premiers clubs ne s\'affiche pas');
  if (acc.sallesVisible) erreurs.push('accueil : la section des salles referencees s\'affiche alors qu\'aucune salle n\'est referencee');
  if (!acc.cta) erreurs.push('accueil : l\'offre aux premiers clubs ne mene pas a la page Referencer');
  if (acc.chiffres !== 2) erreurs.push('accueil : ' + acc.chiffres + ' chiffres, attendu 2');

  // --- 2. accueil -> fiche d'exemple, par la page de referencement ---
  await p.goto(url('clubs.html'));
  await p.waitForTimeout(400);
  await p.click('.hero-exemple a');
  await p.waitForLoadState('load');
  await p.waitForTimeout(1200);
  pas.push(['-> fiche exemple', (await p.textContent('#s-nom')).trim()]);
  if (!await p.isVisible('#bandeau-demo'))
    erreurs.push('la fiche d\'exemple ne s\'annonce pas comme un exemple');

  // --- 3. une vignette de ville mene a sa page d'annuaire ---
  await p.goto(url('index.html'));
  await p.waitForTimeout(600);
  await p.click('#villes .cv');
  await p.waitForLoadState('load');
  await p.waitForTimeout(700);

  // --- 4. fiche -> page d'annuaire de la ville (fil d'Ariane) ---
  const ann = await p.evaluate(() => ({
    fichier: location.pathname.split('/').pop(),
    h1: document.querySelector('h1').textContent.replace(/\s+/g, ' ').trim(),
    n: document.querySelectorAll('.res').length,
    dit: (document.querySelector('.vide') || {}).textContent || '',
    cta: !!document.querySelector('.vide-cta[href="clubs.html"]'),
  }));
  pas.push(['vignette -> ville', ann.fichier + ' | ' + ann.n + ' salle(s)']);
  if (!/^sports-de-combat-/.test(ann.fichier)) erreurs.push('vignette : ' + ann.fichier);
  if (ann.n) erreurs.push('annuaire ville : des salles apparaissent');
  if (!/pas encore de salle/i.test(ann.dit))
    erreurs.push('annuaire ville : la page ne dit pas qu\'aucune salle n\'est referencee');
  if (!ann.cta)
    erreurs.push('annuaire ville : « referencer ma salle » ne mene pas a la page Referencer');

  // --- 4b. la page de recherche, avec sa liste paginee et sa carte repliee ---
  await p.goto(url('recherche.html') + '?ville=Marseille');
  await p.waitForTimeout(1600);
  const rech = await p.evaluate(() => ({
    h1: document.querySelector('h1').textContent.replace(/\s+/g, ' ').trim(),
    n: document.querySelectorAll('.res').length,
    carteRepliee: document.getElementById('carte-zone').hidden,
    dit: (document.querySelector('.vide') || {}).textContent || '',
    cta: !!document.querySelector('.vide-cta[href="clubs.html"]'),
  }));
  pas.push(['recherche', rech.h1]);
  if (rech.n) erreurs.push('recherche : des resultats alors que l\'annuaire est vide');
  if (!rech.carteRepliee) erreurs.push('recherche : la carte n\'est pas repliee au chargement');
  if (!/pas encore de salle/i.test(rech.dit))
    erreurs.push('recherche : l\'etat vide ne dit pas qu\'aucune salle n\'est referencee');
  if (!rech.cta) erreurs.push('recherche : « referencer ma salle » ne mene pas a la page Referencer');

  // --- 5. recherche -> page de vente -> fenetre -> fiche ---
  // Amaury, 24/09/2026 : le bouton « Referencer ma salle » du bandeau mene a la
  // page Referencer votre salle (clubs.html) ; c'est la que la fenetre s'ouvre.
  if (await p.getAttribute('a.btn-rouge:has(.l-long)', 'href') !== 'clubs.html')
    erreurs.push('bandeau : « referencer ma salle » ne mene pas a la page Referencer');
  await p.goto(url('clubs.html'));
  await p.waitForLoadState('load');
  await p.waitForTimeout(500);
  const vente = await p.evaluate(() => ({
    formulaire: !!document.getElementById('form-club'),
    bouton: !!document.querySelector('.creer [data-compte]'),
    etapes: document.querySelectorAll('.etapes li').length,
  }));
  pas.push(['-> page de vente', JSON.stringify(vente)]);
  if (vente.formulaire) erreurs.push('vente : le formulaire est reste sur la page de vente');
  if (!vente.bouton) erreurs.push('vente : le bouton de creation de l\'espace club manque');
  if (vente.etapes !== 3) erreurs.push('vente : ' + vente.etapes + ' etapes, attendu 3');

  await p.click('.creer button[data-compte]');
  await p.waitForTimeout(350);
  if (!await p.isVisible('#voile')) erreurs.push('vente : la fenetre ne s\'ouvre pas');
  await p.click('#form-compte button[type=submit]');
  await p.waitForTimeout(250);
  if (!await p.isVisible('#voile'))
    erreurs.push('vente : la fenetre accepte des champs vides');

  await p.fill('#k-nom', 'Club Essai');
  await p.fill('#k-mail', 'contact@club-essai.fr');
  await p.fill('#k-mdp', 'motdepasse1');
  await p.click('#form-compte button[type=submit]');
  // sans serveur (ici), la fenetre ouvre directement la fiche en apercu ; avec
  // le serveur elle mene a l'espace club, verifie par backend.cjs
  await p.waitForURL(/referencer\.html/, { timeout: 5000 });
  await p.waitForTimeout(800);
  if (await p.inputValue('#c-nom') !== 'Club Essai')
    erreurs.push('fiche : le nom saisi a la creation du compte n\'est pas repris');
  const champs = await p.evaluate(() => {
    const q = s => !!document.querySelector(s);
    return { nom: q('#c-nom'), adresse: q('#c-adresse'), ville: q('#c-ville'), cp: q('#c-cp'),
             disciplines: q('[name="disciplines"]'), presentation: q('#c-mot'),
             photos: q('#c-photos'), horaires: q('[data-jour]'),
             tel: q('#c-tel'), mail: q('#c-mail'), site: q('#c-web'),
             insta: q('#c-insta'), fb: q('#c-fb'), apercu: q('#apercu') };
  });
  const manquants = Object.entries(champs).filter(([, v]) => !v).map(([k]) => k);
  pas.push(['-> referencement', manquants.length ? 'MANQUE ' + manquants : 'tous les champs presents']);
  if (manquants.length) erreurs.push('formulaire : champs manquants ' + manquants.join(', '));

  // --- 6. aucun lien mort, et les pages d'annuaire existent bien ---
  const fs = require('fs');
  const annuaire = fs.readdirSync(S).filter(f => /^(sports-de-combat-|mma|judo|karate|grappling|kickboxing|muay-thai|boxe-anglaise|jiu-jitsu-bresilien)\S*\.html$/.test(f));
  pas.push(['pages d\'annuaire', annuaire.length + ' fichiers']);
  // 8 disciplines + 16 villes : toutes les villes couvertes ont leur page, meme vide
  if (annuaire.length !== 24) erreurs.push('annuaire : ' + annuaire.length + ' pages, attendu 24');

  for (const f of ['index.html', 'recherche.html', 'clubs.html', 'mma.html',
                   'sports-de-combat-marseille.html']) {
    await p.goto(url(f));
    await p.waitForTimeout(f === 'recherche.html' ? 1500 : 500);
    const liens = await p.evaluate(() => [...document.querySelectorAll('a[href]')]
      .map(a => a.getAttribute('href')));
    const morts = liens.filter(h => h === '#' || h === '#salle');
    if (morts.length) erreurs.push(f + ' : liens morts ' + [...new Set(morts)].join(', '));
    // un lien vers un fichier du site doit pointer sur un fichier qui existe
    const absents = [...new Set(liens
      .filter(h => /^[a-z0-9\-]+\.html/.test(h))
      .map(h => h.split(/[?#]/)[0]))]
      .filter(h => !fs.existsSync(path.join(S, h)));
    if (absents.length) erreurs.push(f + ' : fichiers absents ' + absents.join(', '));
  }
  pas.push(['liens morts', 'aucun #salle restant']);

  for (const [a, c] of pas) console.log(a.padEnd(18), c);
  console.log(erreurs.length ? '\nPROBLEMES:\n- ' + erreurs.join('\n- ') : '\nOK, parcours complet');
  await b.close();
  process.exit(erreurs.length ? 1 : 0);
})();
