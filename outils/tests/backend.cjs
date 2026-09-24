/* Eprouve le parcours complet contre un faux Supabase en memoire (_faux_sb.js).
   Le vrai serveur n'est pas joignable depuis le bac a sable, et les regles d'acces
   sont eprouvees a part (db/rls_test.sh) : ce que ce test verifie, c'est le code
   des pages — noms de champs, ordre des gestionnaires, enchainement des promesses.

   L'etat vit dans window.__FAUX__ et doit survivre d'une page a l'autre : on le
   reinjecte a chaque navigation, comme le ferait un vrai serveur. */
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');
const http = require('http');
const D = require('path').join(__dirname, '..');
const RACINE = path.join(D, 'site');
/* On sert le site en http plutot qu'en file:// : sessionStorage, dont se sert le
   faux serveur pour garder son etat d'une page a l'autre, n'est pas fiable sur
   file://, et un serveur est de toute facon plus proche du reel. */
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css',
                '.svg': 'image/svg+xml', '.webp': 'image/webp', '.json': 'application/json' };
const serveur = http.createServer((q, r) => {
  const f = path.join(RACINE, decodeURIComponent(q.url.split('?')[0]).replace(/^\/+/, '') || 'index.html');
  fs.readFile(f, (e, d) => {
    if (e) { r.writeHead(404); r.end('non'); return; }
    r.writeHead(200, { 'Content-Type': TYPES[path.extname(f)] || 'application/octet-stream' });
    r.end(d);
  });
});
const FAUX = fs.readFileSync(path.join(D, '_faux_sb.js'), 'utf8');

(async () => {
  await new Promise(res => serveur.listen(0, '127.0.0.1', res));
  const B = 'http://127.0.0.1:' + serveur.address().port + '/';
  const b = await chromium.launch({ args: ['--ignore-certificate-errors'] });
  const ctx = await b.newContext({ viewport: { width: 1280, height: 950 }, locale: 'fr-FR' });
  const pg = await ctx.newPage();
  const erreurs = [];
  pg.on('pageerror', e => erreurs.push('[page] ' + e.message));
  pg.on('console', m => {
    if (m.type() === 'error' && !/jsdelivr|net::ERR|Failed to load resource/.test(m.text()))
      erreurs.push('[console] ' + m.text());
  });

  await pg.addInitScript(FAUX);
  /* les pages de Stripe ne sont pas joignables ici : on s'arrete a leur porte */
  await pg.route(/^https:\/\/(buy|billing)\.stripe\.com\//, r =>
    r.fulfill({ contentType: 'text/html', body: '<p>Stripe</p>' }));
  const aller = async (f) => { await pg.goto(B + f); await pg.waitForTimeout(400); };
  /* le faux serveur ecrit dans sessionStorage a chaque operation ; apres une
     modification faite depuis le test, il faut le lui dire */
  const garde = async () => { await pg.evaluate(() => window.__FAUX_ECRIT__()); };

  const ok = (nom, vu, attendu) => {
    const bon = JSON.stringify(vu) === JSON.stringify(attendu);
    console.log((bon ? '  ok     ' : '  ECHEC  ') + nom + (bon ? '' : ` -> ${JSON.stringify(vu)} au lieu de ${JSON.stringify(attendu)}`));
    if (!bon) erreurs.push('assertion : ' + nom);
  };

  // ---------- 1. creation du compte depuis l'accueil ----------
  // Amaury, 24/09/2026 : « Referencer ma salle » mene a la page Referencer votre
  // salle, et c'est son bouton qui ouvre la fenetre de creation.
  await aller('index.html');
  ok('l\'accueil mene a la page Referencer',
     await pg.getAttribute('#ouverture .btn-rouge', 'href'), 'clubs.html');
  await aller('clubs.html');
  await pg.click('.creer [data-compte]');
  await pg.waitForTimeout(200);
  ok('la fenetre s\'ouvre', await pg.isVisible('#voile'), true);
  await pg.fill('#k-nom', 'Team Ouragan Boxe');
  await pg.fill('#k-mail', 'contact@ouragan.fr');
  await pg.fill('#k-mdp', 'motdepasse1');
  await pg.click('#fen-envoi');
  /* Amaury, 24/09/2026 : « Referencer » mene droit a Ma fiche, pas au tableau de bord */
  await pg.waitForURL(/referencer\.html/, { timeout: 5000 });
  await pg.waitForTimeout(600);
  ok('on arrive sur Ma fiche', /referencer\.html/.test(pg.url()), true);
  ok('le club est cree', await pg.evaluate(() => window.__FAUX__.club.length), 1);
  ok('et le compte en est le gerant',
     await pg.evaluate(() => window.__FAUX__.club_membre.length), 1);
  await garde();
  await aller('index.html');
  await pg.waitForTimeout(600);
  ok('fiche pas encore envoyee : le bandeau mene a Ma fiche',
     await pg.getAttribute('.nav-compte .cpt-bouton', 'href'), 'referencer.html');
  await aller('referencer.html');
  await pg.waitForTimeout(400);
  ok('le nom est repris dans la fiche', await pg.inputValue('#c-nom'), 'Team Ouragan Boxe');
  await garde();

  // ---------- 2. la fiche s'enregistre ----------
  await pg.fill('#c-adresse', '24 rue des Chartreux');
  await pg.fill('#c-ville', 'Marseille');
  await pg.fill('#c-cp', '13004');
  await pg.fill('#c-mot', 'Une salle de boxe au cœur de Marseille.');
  await pg.fill('#c-contact', 'Amaury');
  await pg.fill('#c-tel', '06 12 34 56 78');
  await pg.fill('#c-mail', 'contact@ouragan.fr');
  await pg.check('input[name="disciplines"][value="Boxe anglaise"]');
  await pg.check('input[name="disciplines"][value="Kickboxing"]');
  /* le planning des cours : c'est lui que la fiche proposera a la reservation,
     et l'heure saisie doit etre celle qui part -- elle etait ignoree, tout
     partait en 09:00 - 21:00 */
  await pg.click('#cours-plus');
  await pg.click('#cours-plus');
  await pg.selectOption('.cours-ligne:nth-child(2) .c-jour', '3');
  await pg.fill('.cours-ligne:nth-child(2) .c-de', '19:00');
  await pg.selectOption('.cours-ligne:nth-child(2) .c-quoi', 'Kickboxing');
  await pg.fill('.cours-ligne:nth-child(2) .c-niveau', 'Tous niveaux');
  await pg.fill('[data-de="0"]', '17:00');
  await pg.click('#form-club button[type="submit"]');
  await pg.waitForTimeout(700);
  const c = await pg.evaluate(() => window.__FAUX__.club[0]);
  ok('la fiche part en verification', c.statut, 'en_attente');
  ok('l\'adresse est enregistree', c.adresse, '24 rue des Chartreux');
  ok('la ville est enregistree', c.ville, 'Marseille');
  ok('la presentation aussi', c.presentation, 'Une salle de boxe au cœur de Marseille.');
  ok('les disciplines aussi', c.disciplines, ['Boxe anglaise', 'Kickboxing']);
  ok('les horaires aussi', Object.keys(c.horaires).length, 6);
  ok('avec l\'heure saisie, pas une heure par defaut', c.horaires.lundi, ['17:00', '21:00']);
  ok('les deux cours sont enregistres', c.cours.length, 2);
  ok('chacun avec son identifiant', c.cours.every(x => /^[a-z0-9]{4,8}$/.test(x.id)), true);
  ok('et deux identifiants differents', c.cours[0].id !== c.cours[1].id, true);
  ok('le second porte ce qui a ete saisi',
     [c.cours[1].jour, c.cours[1].de, c.cours[1].a, c.cours[1].quoi, c.cours[1].niveau],
     [3, '19:00', '20:00', 'Kickboxing', 'Tous niveaux']);
  ok('l\'ecran de confirmation s\'affiche', await pg.isVisible('#merci'), true);
  await garde();

  // ---------- 3. l'espace club ----------
  await aller('espace-club.html');
  await pg.waitForTimeout(500);
  ok('le nom du club s\'affiche', await pg.textContent('#esp-nom'), 'Team Ouragan Boxe');
  ok('le statut est lisible', await pg.textContent('#esp-statut'), 'En vérification');
  /* Le tableau de bord parait meme a vide : quatre tuiles a zero, qui disent
     pourquoi. Un espace qui ne montre rien avant la premiere demande ne sert
     a rien -- c'est ce que reprochait Amaury le 23/09/2026. */
  ok('le tableau de bord est la', await pg.isVisible('#esp-chiffres-bloc'), true);
  ok('avec ses quatre tuiles', await pg.locator('#esp-kpi li').count(), 4);
  ok('aucune demande pour l\'instant',
     await pg.textContent('#esp-kpi li:nth-child(2) .esp-kpi-nb'), '0');
  ok('et une fiche pas encore en ligne le dit',
     /n’est pas encore en ligne/.test(
       await pg.textContent('#esp-kpi li:nth-child(1) .esp-kpi-mot')), true);
  ok('sans visite ni demande, il n\'y a pas d\'entonnoir a montrer',
     await pg.isVisible('#esp-entonnoir'), false);

  // ---------- 4. le back-office ----------
  // on fait du compte un administrateur, comme on le ferait a la main dans Supabase
  await pg.evaluate(() => {
    window.__FAUX__.equipe.push({ membre_id: window.__FAUX__.session.user.id });
  });
  await garde();
  await aller('admin.html');
  await pg.waitForTimeout(500);
  ok('une fiche attend', await pg.textContent('#ad-attente'), '1');
  ok('aucune en ligne', await pg.textContent('#ad-publies'), '0');
  ok('la fiche est listee', await pg.textContent('.fiche b'), 'Team Ouragan Boxe');

  // refus, puis publication
  pg.once('dialog', d => d.accept('Il manque les horaires réels.'));
  await pg.click('.fiche [data-act="refuse"]');
  await pg.waitForTimeout(500);
  const refuse = await pg.evaluate(() => window.__FAUX__.club[0]);
  ok('le refus est enregistre', refuse.statut, 'refuse');
  ok('avec son motif', refuse.motif_refus, 'Il manque les horaires réels.');
  await garde();

  await pg.evaluate(() => { window.__FAUX__.club[0].statut = 'en_attente'; });
  await garde();
  await aller('admin.html');
  await pg.waitForTimeout(500);
  await pg.click('.fiche [data-act="publie"]');
  await pg.waitForTimeout(500);
  const publie = await pg.evaluate(() => window.__FAUX__.club[0]);
  ok('la fiche est publiee', publie.statut, 'publie');
  ok('et recoit son adresse de page', publie.slug, 'team-ouragan-boxe-marseille');
  ok('le motif de refus est efface', publie.motif_refus, null);
  await garde();

  // ---------- 5. une demande de seance d'essai ----------
  /* Une demande n'arrive que chez un club Pro : la base le refuse autrement, et
     depuis le 23/09/2026 l'espace d'un gratuit montre le bloc verrouille a la
     place de la liste. Le jeu d'essai suit donc la realite. */
  await pg.evaluate(() => {
    window.__FAUX__.club[0].offre = 'pro';
    window.__FAUX__.demande.push({
      id: 'd1', club_id: window.__FAUX__.club[0].id, statut: 'recue',
      cree_le: new Date().toISOString(), nom: 'Léa Martin',
      mail: 'lea@example.fr', tel: '06 98 76 54 32', discipline: 'Boxe anglaise',
      message: 'Je débute, je cherche un cours le soir.'
    });
  });
  await garde();
  await aller('espace-club.html');
  await pg.waitForTimeout(500);
  ok('la fiche est en ligne', await pg.textContent('#esp-statut'), 'En ligne');
  ok('une demande est arrivee',
     await pg.textContent('#esp-kpi li:nth-child(2) .esp-kpi-nb'), '1');
  ok('et le rappel dit qu\'elle attend',
     await pg.textContent('#esp-rappel'), 'Une demande n’a pas encore été traitée.');
  ok('le nom du pratiquant s\'affiche', await pg.textContent('.demande b'), 'Léa Martin');
  ok('elle est a l\'etat recue', await pg.textContent('.dem-etat'), 'Reçue');

  await pg.click('.demande [data-suivi="confirmee"]');
  await pg.waitForTimeout(400);
  ok('la reservation se confirme',
     await pg.evaluate(() => window.__FAUX__.demande[0].statut), 'confirmee');
  ok('et l\'etat suit a l\'ecran', await pg.textContent('.dem-etat'), 'Confirmée');
  await pg.click('.demande [data-suivi="honoree"]');
  await pg.waitForTimeout(400);
  ok('la venue se note', await pg.textContent('.dem-etat'), 'Venue');

  // le suivi de prospect : note libre, date de rappel, etape suivante, export
  await pg.fill('.demande [data-champ="notes"]', 'A rappeler, hesite sur le creneau.');
  await pg.click('#esp-nom');                     // le champ perd le focus : ca enregistre
  await pg.waitForTimeout(400);
  ok('la note est enregistree',
     await pg.evaluate(() => window.__FAUX__.demande[0].notes),
     'A rappeler, hesite sur le creneau.');

  // une relance datee d'hier doit remonter comme due aujourd'hui
  const hier = await pg.evaluate(() => {
    const d = new Date(Date.now() - 864e5);
    return d.getFullYear() + '-' + ('0' + (d.getMonth() + 1)).slice(-2) +
           '-' + ('0' + d.getDate()).slice(-2);
  });
  await pg.fill('.demande [data-champ="relance"]', hier);
  await pg.waitForTimeout(500);
  ok('la relance est enregistree',
     await pg.evaluate(() => window.__FAUX__.demande[0].relance), hier);
  ok('et le rappel du jour s\'affiche', await pg.isVisible('#esp-rappel'), true);

  await pg.click('.demande [data-suivi="adherent"]');
  await pg.waitForTimeout(400);
  ok('l\'adhesion se note', await pg.textContent('.dem-etat'), 'Adhérente');
  ok('et le chiffre des adherents suit',
     await pg.textContent('#esp-kpi li:nth-child(4) .esp-kpi-nb'), '1');
  ok('un prospect adherent ne se relance plus', await pg.isVisible('#esp-rappel'), false);

  // la recherche filtre la liste sans toucher a la base
  await pg.fill('#esp-cherche', 'personne-de-ce-nom');
  await pg.waitForTimeout(200);
  ok('une recherche vide se dit', await pg.isVisible('#esp-rien'), true);
  await pg.fill('#esp-cherche', 'Léa');
  await pg.waitForTimeout(200);
  ok('et le nom cherche revient', await pg.locator('.demande').count(), 1);

  // l'export se fait dans le navigateur : on intercepte le telechargement
  const csv = await pg.evaluate(() => new Promise((res) => {
    const vrai = URL.createObjectURL;
    /* on laisse la vraie URL se creer -- sinon l'ancre tente de naviguer vers
       une adresse inventee -- et on lit le contenu au passage */
    URL.createObjectURL = (blob) => { blob.text().then(res); return vrai(blob); };
    document.getElementById('esp-csv').click();
    URL.createObjectURL = vrai;
  }));
  const lignes = csv.replace(/^\ufeff/, '').split('\r\n');
  ok('l\'export porte l\'en-tete attendu', lignes[0],
     'Nom;E-mail;Téléphone;Discipline;Créneau souhaité;Message;Étape;Notes;Relance;Reçue le');
  ok('et la ligne du prospect', /^Léa Martin;lea@example\.fr/.test(lignes[1]), true);
  ok('avec son etape et sa note', /Adhérente;A rappeler/.test(lignes[1]), true);
  await garde();

  // ---------- 6. l'etat de la fiche, pour un club qui ne recoit rien ----------
  ok('l\'etat de la fiche s\'affiche', await pg.isVisible('#esp-complet-bloc'), true);
  ok('il compte les postes remplis',
     /sur 7 sont remplis/.test(await pg.textContent('#esp-complet-mot')), true);
  const manques = await pg.evaluate(() =>
    Array.from(document.querySelectorAll('#esp-check .manque b')).map(b => b.textContent));
  ok('les photos manquent, et ca se voit', manques.indexOf('Photos') >= 0, true);
  ok('chaque manque porte son lien vers le formulaire',
     await pg.getAttribute('#esp-check .manque a', 'href'), 'referencer.html');
  ok('ce qui est rempli est marque comme tel',
     await pg.locator('#esp-check .ok').count() >= 4, true);

  // ---------- 6 bis. les visites de la fiche, comptees pour de vrai ----------
  /* on repasse en gratuit : c'est le palier ou « ce qui manque » a un sens */
  await pg.evaluate(() => { window.__FAUX__.club[0].offre = 'gratuit'; });
  await garde();

  /* Le chiffre que le gerant veut voir, et celui qui vend le Pro. Il est ecrit
     par `compte_vue()` en base : la page n'ajoute jamais elle-meme une ligne. */
  await aller('salle.html?s=team-ouragan-boxe-marseille');
  await pg.waitForTimeout(700);
  ok('la visite de la fiche est comptee',
     await pg.evaluate(() => window.__FAUX__.vue_fiche.length), 1);
  ok('une visite, une seule',
     await pg.evaluate(() => window.__FAUX__.vue_fiche[0].n), 1);
  /* rafraichir sa propre fiche ne doit pas gonfler le chiffre : le navigateur
     retient qu'il a deja compte ce club aujourd'hui */
  await aller('salle.html?s=team-ouragan-boxe-marseille');
  await pg.waitForTimeout(700);
  ok('la recharger ne la compte pas deux fois',
     await pg.evaluate(() => window.__FAUX__.vue_fiche[0].n), 1);
  await garde();

  await aller('espace-club.html');
  await pg.waitForTimeout(700);
  ok('la visite remonte dans le tableau de bord',
     await pg.textContent('#esp-kpi li:nth-child(1) .esp-kpi-nb'), '1');
  ok('la courbe a un jour par barre', await pg.locator('#esp-courbe .esp-b').count(), 30);
  await pg.click('.esp-periode [data-jours="7"]');
  await pg.waitForTimeout(200);
  ok('et se resserre sur sept jours', await pg.locator('#esp-courbe .esp-b').count(), 7);
  ok('la legende dit le total', /1 visite/.test(await pg.textContent('#esp-legende')), true);

  ok('l\'entonnoir parait des qu\'il y a de quoi le lire',
     await pg.isVisible('#esp-entonnoir'), true);
  const etapes = await pg.evaluate(() =>
    Array.from(document.querySelectorAll('#esp-etapes li .esp-et-nb')).map(b => b.textContent));
  ok('de la visite a l\'adhesion', etapes, ['1', '1', '1', '1', '1']);
  ok('avec le taux d\'une etape a l\'autre',
     /% de l’étape précédente/.test(await pg.textContent('#esp-etapes li:nth-child(2)')), true);

  /* Ce que le gratuit fait manquer, avec le vrai chiffre et pas un argumentaire.
     C'est le titre du bloc du Pro : les deux disaient deux fois la meme chose. */
  ok('le gratuit s\'entend dire ce qu\'il manque',
     await pg.textContent('#esp-verrou-titre'), 'Une personne a vu votre fiche ce mois-ci');
  ok('et ce qu\'elle n\'a pas trouve',
     /ni votre téléphone/.test(await pg.textContent('#esp-verrou-mot')), true);

  ok('la formule en cours est rappelee',
     await pg.textContent('#esp-formule-titre'), 'Fiche gratuite');
  ok('avec ce qu\'elle donne', await pg.locator('#esp-formule li.ok').count(), 2);
  ok('et ce qu\'elle ne donne pas encore',
     await pg.locator('#esp-formule li.ferme').count(), 4);
  ok('le prix est dit sans detour',
     /39 € par mois/.test(await pg.textContent('#esp-formule-note')), true);

  // ---------- 6 ter. le Pro : grise et ferme, pas cache ----------
  /* Amaury, 23/09/2026 : « ne pas barrer les espaces auxquels il n'a pas acces,
     mais les mettre en grise ». Un club gratuit doit donc voir les sections du
     Pro, fermees, et pouvoir les ouvrir. */
  ok('le club gratuit voit ce que le Pro ouvre',
     await pg.isVisible('#esp-verrou-bloc'), true);
  ok('section par section', await pg.locator('#esp-verrou li').count(), 6);
  ok('la reservation en fait partie',
     /réservation de séance d’essai/i.test(await pg.textContent('#esp-verrou')), true);
  ok('et le suivi des prospects aussi',
     /suivi de chaque prospect/i.test(await pg.textContent('#esp-verrou')), true);
  /* rien d'invente : ce sont les fonctions, pas de fausses lignes de prospects */
  ok('la liste des prospects reste fermee a un gratuit',
     await pg.isVisible('#esp-demandes-bloc'), false);
  /* les chiffres qu'il ne peut pas faire bouger sont grises, pas retires */
  ok('les tuiles fermees restent visibles', await pg.locator('#esp-kpi li').count(), 4);
  ok('trois d\'entre elles portent le cadenas',
     await pg.locator('#esp-kpi li.ferme').count(), 3);
  ok('celle des visites reste ouverte',
     await pg.locator('#esp-kpi li:nth-child(1).ferme').count(), 0);
  /* et la formule ne barre plus : elle ferme */
  ok('la formule montre les portes fermees',
     await pg.locator('#esp-formule li.ferme').count(), 4);

  // « Passer au Pro » mene a la page de paiement Stripe, jamais a une « demande envoyee »
  ok('le bouton est là, une seule fois', await pg.isVisible('#esp-pro'), true);
  const idClub = await pg.evaluate(() => window.__FAUX__.club[0].id);
  await pg.click('#esp-pro');
  await pg.waitForURL(/buy\.stripe\.com/, { timeout: 4000 }).catch(() => {});
  ok('Passer au Pro ouvre la page de paiement Stripe', /^https:\/\/buy\.stripe\.com\//.test(pg.url()), true);
  ok('avec l\'identifiant du club', new URL(pg.url()).searchParams.get('client_reference_id'), idClub);
  ok('et l\'e-mail du compte', new URL(pg.url()).searchParams.get('prefilled_email'), 'contact@ouragan.fr');
  await aller('espace-club.html');
  await pg.waitForTimeout(800);
  ok('aucune demande a la main n\'est enregistree',
     await pg.evaluate(() => window.__FAUX__.interet_pro.length), 0);
  ok('et aucun « C\'est note » ne s\'affiche', await pg.isVisible('#esp-pro-fait'), false);

  /* le back-office garde sa liste des clubs interesses (demandes d'avant) */
  await pg.evaluate(() => {
    window.__FAUX__.interet_pro.push({ club_id: window.__FAUX__.club[0].id,
      membre_id: window.__FAUX__.session.user.id, cree_le: new Date().toISOString() });
    window.__FAUX_ECRIT__();
  });

  // ---------- 6 quater. le back-office voit qui attend ----------
  await aller('admin.html');
  await pg.waitForTimeout(700);
  ok('le club qui a demande remonte en tete',
     await pg.isVisible('#ad-veut-bloc'), true);
  ok('avec son nom', await pg.textContent('#ad-veulent .fiche b'), 'Team Ouragan Boxe');
  ok('et la date de sa demande',
     /A demandé le Pro le /.test(await pg.textContent('#ad-veulent .fiche-veut')), true);
  await pg.click('#ad-veulent .fiche [data-offre="pro"]');
  await pg.waitForTimeout(800);
  ok('ouvrir le Pro répond a la demande',
     await pg.evaluate(() => !!window.__FAUX__.interet_pro[0].repondu_le), true);
  ok('et le club est passe au Pro',
     await pg.evaluate(() => window.__FAUX__.club[0].offre), 'pro');
  ok('la liste des demandes se vide', await pg.isVisible('#ad-veut-bloc'), false);
  await garde();

  // ---------- 6 quinquies. l'espace d'un Pro n'a plus de verrou ----------
  await aller('espace-club.html');
  await pg.waitForTimeout(800);
  ok('le bloc verrouille disparait', await pg.isVisible('#esp-verrou-bloc'), false);
  ok('la liste des prospects s\'ouvre', await pg.isVisible('#esp-demandes-bloc'), true);
  ok('plus aucune tuile fermee', await pg.locator('#esp-kpi li.ferme').count(), 0);
  ok('et la formule est celle du Pro',
     await pg.textContent('#esp-formule-titre'), 'Mon Club Combat Pro');

  // ---------- 6 sexies. Stripe : gerer, revenir ----------
  ok('un Pro peut gerer son abonnement', await pg.isVisible('#esp-gerer'), true);
  await pg.click('#esp-gerer');
  await pg.waitForURL(/billing\.stripe\.com/, { timeout: 4000 }).catch(() => {});
  ok('le bouton ouvre le portail client de Stripe', /^https:\/\/billing\.stripe\.com\//.test(pg.url()), true);
  ok('e-mail pre-rempli', new URL(pg.url()).searchParams.get('prefilled_email'), 'contact@ouragan.fr');

  await aller('espace-club.html?abonnement=ok');
  await pg.waitForTimeout(800);
  ok('au retour de Stripe, un Pro est accueilli',
     /Bienvenue dans Mon Club Combat Pro/.test(await pg.textContent('#esp-retour')), true);
  ok('et l\'adresse est nettoyee', await pg.evaluate(() => location.search), '');
  if (process.env.CAPTURES) {
    await pg.screenshot({ path: process.env.CAPTURES + '/esp-retour.png' });
    await pg.evaluate(() => document.getElementById('esp-formule-bloc').scrollIntoView());
    await pg.screenshot({ path: process.env.CAPTURES + '/esp-gerer.png' });
  }
  await garde();

  /* on remet le club en gratuit : la suite du test l'attend ainsi */
  await pg.evaluate(() => { window.__FAUX__.club[0].offre = 'gratuit'; window.__FAUX_ECRIT__(); });
  await aller('espace-club.html?abonnement=annule');
  await pg.waitForTimeout(800);
  ok('un paiement annule le dit sans alarmer',
     /rien n’a été débité/.test(await pg.textContent('#esp-retour')), true);
  await garde();

  // ---------- 7. le bandeau public, une fois connecte ----------
  /* Amaury, 23/09/2026 : « il faudrait qu'on ait qu'un clic et acceder a mon
     espace club. Et il n'y a pas tous ces trucs -- mon compte, back-office,
     modifier ma fiche -- quand on est dans l'espace B2C. » */
  await aller('index.html');
  await pg.waitForTimeout(600);
  ok('le bandeau porte le compte', await pg.isVisible('.nav-compte'), true);
  ok('c\'est un lien, pas un menu', await pg.locator('.nav-compte a.cpt-bouton').count(), 1);
  ok('il mene a l\'espace club en un clic',
     await pg.getAttribute('.nav-compte .cpt-bouton', 'href'), 'espace-club.html');
  ok('et le dit', await pg.textContent('.cpt-nom'), 'Mon espace club');
  ok('avec les initiales de la salle', await pg.textContent('.cpt-rond'), 'TO');
  ok('plus aucun panneau deroulant', await pg.locator('#cpt-menu').count(), 0);
  ok('« Referencer ma salle » n\'a plus lieu d\'etre',
     await pg.isVisible('.site-nav .btn-rouge'), false);

  // ---------- 7 bis. la pastille de nouvelles demandes ----------
  /* Un gerant qui passe sur le site doit voir qu'on l'attend sans ouvrir
     l'espace club. La pastille compte les demandes encore a l'etape « Recue »,
     donc elle se vide en travaillant : pas de colonne « lue » de plus. */
  await pg.evaluate(() => {
    window.__FAUX__.demande.push({
      id: 'd2', club_id: window.__FAUX__.club[0].id, statut: 'recue',
      cree_le: new Date().toISOString(), nom: 'Yanis Ferhat',
      mail: 'yanis@example.fr', discipline: 'Kickboxing'
    });
  });
  await garde();
  await aller('index.html');
  await pg.waitForTimeout(600);
  ok('la pastille parait sur le bandeau', await pg.isVisible('.cpt-rond .cpt-pastille'), true);
  ok('et porte le compte', await pg.textContent('.cpt-rond .cpt-pastille'), '1');
  ok('le lien le dit a voix haute',
     await pg.getAttribute('.nav-compte .cpt-bouton', 'aria-label'),
     'Mon espace club, 1 nouvelle demande');

  /* des qu'elle avance d'une etape, elle ne compte plus */
  await pg.evaluate(() => { window.__FAUX__.demande[1].statut = 'contactee'; });
  await garde();
  await aller('index.html');
  await pg.waitForTimeout(600);
  ok('une demande traitee ne compte plus',
     await pg.locator('.cpt-rond .cpt-pastille').count(), 0);

  // ---------- 7 ter. la coque de l'espace pro ----------
  /* Amaury, 23/09/2026 : « ca doit etre comme un logiciel, avec sur le cote :
     l'espace club, modifie ma fiche, mon compte, back-office (...) il peut
     naviguer entre les differents espaces comme ca. » */
  await aller('espace-club.html');
  await pg.waitForTimeout(800);
  ok('le bandeau public n\'entre pas dans l\'espace pro',
     await pg.locator('.site-nav').count(), 0);
  ok('le pied de page a liens de villes non plus',
     await pg.locator('.site-footer').count(), 0);
  ok('le rail est la', await pg.isVisible('#pro-rail'), true);
  ok('il mene aux espaces de travail',
     await pg.evaluate(() => Array.from(document.querySelectorAll('#pro-liens a, .pro-liens a'))
       .filter(a => a.offsetParent !== null).map(a => a.getAttribute('href'))),
     ['espace-club.html', 'referencer.html', 'acquisition.html', 'admin.html']);
  /* Amaury, 24/09/2026 : le compte en haut a droite, et plus de « Se deconnecter »
     au pied du rail (il y clignotait a chaque changement de page) */
  ok('la deconnexion a quitte le rail', await pg.locator('#pro-rail .pro-quitter').count(), 0);
  ok('le menu du compte est ferme', await pg.isVisible('#pro-cpt-menu'), false);
  ok('le rond porte des initiales', /^[A-Z]{1,2}$/.test(await pg.textContent('#pro-cpt-rond')), true);
  await pg.click('#pro-cpt-btn');
  ok('il s\'ouvre au clic', await pg.isVisible('#pro-cpt-menu'), true);
  ok('avec l\'adresse du compte', await pg.textContent('#pro-cpt-mail'), 'contact@ouragan.fr');
  ok('et la deconnexion', await pg.isVisible('#pro-cpt-menu .pro-quitter'), true);
  if (process.env.CAPTURES) {
    await pg.screenshot({ path: process.env.CAPTURES + '/cpt-desk.png', clip: { x: 0, y: 0, width: 1280, height: 520 } });
    await pg.setViewportSize({ width: 390, height: 844 });
    await pg.waitForTimeout(300);
    await pg.screenshot({ path: process.env.CAPTURES + '/cpt-mob.png' });
    await pg.setViewportSize({ width: 1280, height: 950 });
  }
  await pg.keyboard.press('Escape');
  ok('Echap le referme', await pg.isVisible('#pro-cpt-menu'), false);
  ok('la page ouverte se marque',
     await pg.getAttribute('#pro-rail [data-page="espace-club"]', 'aria-current'), 'page');
  ok('et les autres non',
     await pg.getAttribute('#pro-rail [data-page="referencer"]', 'aria-current'), null);
  ok('la tete nomme la salle', await pg.textContent('#pro-salle'), 'Team Ouragan Boxe');
  ok('et mene a la fiche en ligne',
     await pg.getAttribute('#pro-voir', 'href'), 'salle.html?s=team-ouragan-boxe-marseille');
  ok('le palier est rappele de page en page',
     await pg.textContent('#pro-palier-t'), 'Fiche gratuite');

  /* naviguer d'un espace a l'autre garde la coque et deplace la marque */
  await pg.click('#pro-cpt-btn');
  await pg.click('#pro-cpt-menu [data-page="mon-compte"]');
  await pg.waitForURL(/mon-compte\.html/, { timeout: 5000 });
  await pg.waitForTimeout(700);
  ok('on change d\'espace sans quitter la coque', await pg.isVisible('#pro-rail'), true);
  ok('et la marque suit',
     await pg.getAttribute('#pro-cpt-menu [data-page="mon-compte"]', 'aria-current'), 'page');
  ok('l\'espace club n\'est plus marque',
     await pg.getAttribute('#pro-rail [data-page="espace-club"]', 'aria-current'), null);

  /* la pastille des demandes suit le gerant dans tout l'espace pro */
  await pg.evaluate(() => {
    window.__FAUX__.demande.push({
      id: 'd3', club_id: window.__FAUX__.club[0].id, statut: 'recue',
      cree_le: new Date().toISOString(), nom: 'Nour Amrani', mail: 'nour@example.fr'
    });
  });
  await garde();
  await aller('referencer.html');
  await pg.waitForTimeout(900);
  ok('la pastille suit d\'un espace a l\'autre',
     await pg.textContent('#pro-pastille'), '1');

  /* le back-office n'apparait que pour l'equipe : on retire le compte de
     `equipe` pour le verifier, puis on le remet */
  await pg.evaluate(() => { window.__FAUX__.equipe = []; });
  await garde();
  await aller('espace-club.html');
  await pg.waitForTimeout(800);
  ok('un gerant ordinaire ne voit pas le back-office',
     await pg.isVisible('#pro-admin'), false);
  await pg.evaluate(() => {
    window.__FAUX__.equipe.push({ membre_id: window.__FAUX__.session.user.id });
    window.__FAUX__.demande = window.__FAUX__.demande.filter(d => d.id !== 'd3');
  });
  await garde();

  // ---------- 8. la page « Mon compte » ----------
  await aller('mon-compte.html');
  await pg.waitForTimeout(600);
  ok('l\'adresse de connexion s\'affiche', await pg.inputValue('#mc-mail'), 'contact@ouragan.fr');
  ok('la salle est rappelee', await pg.textContent('#mc-club'), 'Team Ouragan Boxe');
  ok('avec son etat', await pg.textContent('#mc-statut'), 'En ligne');
  const faits = await pg.evaluate(() =>
    Array.from(document.querySelectorAll('#mc-faits li')).map(l => l.textContent));
  ok('et de vraies donnees, pas une page vide', faits.length >= 4, true);
  ok('la ville en fait partie', faits.some(f => /Marseille/.test(f)), true);
  ok('le planning aussi', faits.some(f => /2 cours au planning/.test(f)), true);
  ok('le palier est dit', /Formule gratuite/.test(await pg.textContent('#mc-offre')), true);

  await pg.fill('#mc-nom', 'Amaury Descamps');
  await pg.fill('#mc-tel', '06 11 22 33 44');
  await pg.fill('#mc-fonction', 'Gérant');
  await pg.click('#mc-envoi');
  await pg.waitForTimeout(500);
  ok('le profil est enregistre', await pg.isVisible('#mc-fait'), true);
  const prof = await pg.evaluate(() => window.__FAUX__.profil[0]);
  ok('et il l\'est en base', [prof.nom, prof.tel, prof.fonction],
     ['Amaury Descamps', '06 11 22 33 44', 'Gérant']);

  // il survit a la navigation : c'est tout l'objet de la table
  await aller('mon-compte.html');
  await pg.waitForTimeout(600);
  ok('il est relu au retour sur la page', await pg.inputValue('#mc-nom'), 'Amaury Descamps');
  /* « Mon compte » est une page de l'espace pro : elle porte le rail, pas le
     bandeau public. C'est la tete de la coque qui nomme la salle. */
  ok('la coque pro nomme la salle', await pg.textContent('#pro-salle'), 'Team Ouragan Boxe');
  ok('et le bandeau public n\'y est plus', await pg.locator('.site-nav').count(), 0);

  // le mot de passe : deux fois le meme, huit caracteres au minimum
  await pg.fill('#mc-mdp', 'nouveau-mot');
  await pg.fill('#mc-mdp2', 'pas-le-meme');
  await pg.click('#mc-mdp-envoi');
  await pg.waitForTimeout(300);
  ok('deux mots de passe differents sont refuses',
     await pg.textContent('#mc-mdp-err'), 'Les deux mots de passe ne sont pas les mêmes.');
  await pg.fill('#mc-mdp2', 'nouveau-mot');
  await pg.click('#mc-mdp-envoi');
  await pg.waitForTimeout(500);
  ok('le mot de passe change', await pg.isVisible('#mc-mdp-fait'), true);
  ok('et c\'est le nouveau qui est garde',
     await pg.evaluate(() => window.__FAUX__.users['contact@ouragan.fr'].mdp), 'nouveau-mot');

  // la deconnexion ramene a l'accueil et ferme la session
  await pg.click('#mc-sortie');
  await pg.waitForURL(/index\.html/, { timeout: 5000 });
  await pg.waitForTimeout(400);
  ok('la deconnexion ramene a l\'accueil', /index\.html/.test(pg.url()), true);
  ok('la session est fermee', await pg.evaluate(() => window.__FAUX__.session), null);
  ok('et le bandeau redevient celui d\'un visiteur',
     await pg.isVisible('.nav-compte'), false);

  // ---------- 9. se reconnecter ----------

  await pg.evaluate(() => { window.__FAUX__.session = null; });
  await garde();
  await aller('espace-club.html');
  await pg.waitForTimeout(500);
  ok('sans session, la fenetre s\'ouvre', await pg.isVisible('#voile'), true);
  ok('en mode connexion', await pg.textContent('#fen-titre'), 'Connectez-vous');
  await pg.fill('#k-mail', 'contact@ouragan.fr');
  await pg.fill('#k-mdp', 'mauvais');
  await pg.click('#fen-envoi');
  await pg.waitForTimeout(400);
  ok('un mauvais mot de passe est explique',
     await pg.textContent('#fen-erreur'), 'Adresse e-mail ou mot de passe incorrect.');
  /* fiche envoyee : la connexion mene au tableau de bord */
  await pg.fill('#k-mdp', 'motdepasse1');
  await pg.click('#fen-envoi');
  await pg.waitForURL(/espace-club\.html/, { timeout: 5000 });
  ok('la connexion mene a l\'espace club', /espace-club\.html/.test(pg.url()), true);

  /* Amaury, 23/09/2026 : en cherchant le reglage de la confirmation il a eteint
     le fournisseur e-mail, et Supabase a repondu « Email signups are disabled »,
     en anglais, dans la fenetre. Ces messages-la se traduisent. */
  ok('un fournisseur e-mail eteint se dit en francais',
     await pg.evaluate(() => window.MCC.dire({ message: 'Email signups are disabled' })),
     'La création de compte par e-mail est fermée pour l’instant. Réessayez plus tard, ou passez par « Continuer avec Google ».');
  ok('des inscriptions fermees aussi',
     await pg.evaluate(() => window.MCC.dire({ message: 'Signups not allowed for this instance' })),
     'Les inscriptions sont fermées pour l’instant. Réessayez plus tard.');

  // ---------- 10. la page acquisition ----------
  await aller('acquisition.html');
  await pg.click('.acq-duree [data-remise="20"]');
  ok('six mois : le pack Start passe a 240 €',
     await pg.textContent('.acq-packs [data-base="300"]'), '240 €');
  ok('plus de prix a la seance ni de « 0 € »', await pg.evaluate(() =>
     /15 €|0 € pour|à confirmer/i.test(document.querySelector('main').textContent)), false);
  ok('plus de formulaire en bas de page', await pg.locator('#contact').count(), 0);
  ok('le panneau est ferme au depart', await pg.isVisible('#parler'), false);
  await pg.click('.ag-heros [data-parler]');
  await pg.waitForTimeout(350);
  ok('« En discuter » ouvre le panneau', await pg.isVisible('#parler'), true);
  await pg.keyboard.press('Escape');
  await pg.waitForTimeout(350);
  ok('Echap le referme', await pg.isVisible('#parler'), false);
  await pg.evaluate(() => { document.getElementById('a-pack').value = 'grow'; });
  await pg.evaluate(() => window.scrollTo(0, 2000));
  await pg.waitForTimeout(400);
  await pg.click('.ag-flottant');
  await pg.waitForTimeout(350);
  ok('le bouton flottant l\'ouvre aussi', await pg.isVisible('#parler'), true);
  await pg.click('#a-envoi');
  await pg.waitForTimeout(200);
  ok('un formulaire vide ne part pas',
     await pg.evaluate(() => window.__FAUX__.contact_acquisition.length), 0);
  await pg.fill('#a-club', 'Team Ouragan Boxe');
  await pg.fill('#a-ville', 'Marseille');
  await pg.fill('#a-nom', 'Amaury');
  await pg.fill('#a-mail', 'contact@ouragan.fr');
  await pg.click('#a-envoi');
  await pg.waitForTimeout(400);
  ok('la demande de rappel est deposee',
     await pg.evaluate(() => window.__FAUX__.contact_acquisition.map(x => [x.club, x.pack])),
     [['Team Ouragan Boxe', 'grow']]);
  ok('et la page remercie', await pg.isVisible('#acq-merci'), true);

  // ---------- 10 bis. payer un pack ----------
  await aller('acquisition.html');
  await pg.click('#offres .acq-duree [data-remise="15"]');
  await pg.click('.ag-packs [data-pack="boost"] .ag-choisir');
  await pg.waitForURL(/buy\.stripe\.com/, { timeout: 4000 }).catch(() => {});
  ok('choisir un pack ouvre sa page de paiement Stripe', /^https:\/\/buy\.stripe\.com\//.test(pg.url()), true);
  const lienBoost = await (async () => { await aller('acquisition.html');
    return pg.evaluate(() => window.MCC.stripe.packs.boost['3']); })();
  ok('celle du pack Boost a 3 mois', !!lienBoost, true);
  await pg.click('#offres .acq-duree [data-remise="15"]');
  await pg.click('.ag-packs [data-pack="boost"] .ag-choisir');
  await pg.waitForURL(/buy\.stripe\.com/, { timeout: 4000 }).catch(() => {});
  ok('le lien suit la duree choisie', pg.url(), lienBoost);
  ok('plus de caisse maison', await (async () => { await aller('acquisition.html');
    return pg.locator('#ag-caisse').count(); })(), 0);
  await aller('acquisition.html?paiement=ok');
  await pg.waitForTimeout(300);
  ok('au retour, le paiement est confirme',
     /Paiement reçu/.test(await pg.textContent('#ag-retour')), true);
  ok('sans agenda Calendly tant qu\'il n\'y a pas d\'adresse',
     await pg.isVisible('#ag-calendly'), false);

  console.log('');
  if (erreurs.length) {
    console.log('PROBLEMES:\n- ' + erreurs.join('\n- '));
    await b.close(); serveur.close(); process.exit(1);
  }
  console.log('tout passe');
  await b.close();
  serveur.close();
})();
