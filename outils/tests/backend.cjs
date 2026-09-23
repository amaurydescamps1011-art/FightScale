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
  await aller('index.html');
  await pg.click('#ouverture [data-compte]');
  await pg.waitForTimeout(200);
  ok('la fenetre s\'ouvre', await pg.isVisible('#voile'), true);
  await pg.fill('#k-nom', 'Team Ouragan Boxe');
  await pg.fill('#k-mail', 'contact@ouragan.fr');
  await pg.fill('#k-mdp', 'motdepasse1');
  await pg.click('#fen-envoi');
  await pg.waitForURL(/referencer\.html/, { timeout: 5000 });
  await pg.waitForTimeout(600);
  ok('on arrive sur la fiche', /referencer\.html/.test(pg.url()), true);
  ok('le club est cree', await pg.evaluate(() => window.__FAUX__.club.length), 1);
  ok('et le compte en est le gerant',
     await pg.evaluate(() => window.__FAUX__.club_membre.length), 1);
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
  ok('aucune demande pour l\'instant', await pg.textContent('#esp-nb'), '0');

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
  await pg.evaluate(() => {
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
  ok('une demande est arrivee', await pg.textContent('#esp-nb'), '1');
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
  ok('et le chiffre des adherents suit', await pg.textContent('#esp-nb-adh'), '1');
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
  ok('l\'etat de la fiche s\'affiche', await pg.isVisible('#esp-complet'), true);
  ok('il compte les postes remplis',
     /sur 7 sont remplis/.test(await pg.textContent('#esp-complet-mot')), true);
  const manques = await pg.evaluate(() =>
    Array.from(document.querySelectorAll('#esp-check .manque b')).map(b => b.textContent));
  ok('les photos manquent, et ca se voit', manques.indexOf('Photos') >= 0, true);
  ok('chaque manque porte son lien vers le formulaire',
     await pg.getAttribute('#esp-check .manque a', 'href'), 'referencer.html');
  ok('ce qui est rempli est marque comme tel',
     await pg.locator('#esp-check .ok').count() >= 4, true);

  // ---------- 7. le compte dans le bandeau ----------
  await aller('index.html');
  await pg.waitForTimeout(500);
  ok('le bandeau porte le compte', await pg.isVisible('.nav-compte'), true);
  ok('avec le nom de la salle', await pg.textContent('.cpt-nom'), 'Team Ouragan Boxe');
  ok('et ses initiales', await pg.textContent('.cpt-rond'), 'TO');
  ok('« Referencer ma salle » n\'a plus lieu d\'etre',
     await pg.isVisible('.site-nav .btn-rouge'), false);
  ok('le menu est ferme au depart', await pg.isVisible('#cpt-menu'), false);
  await pg.click('#cpt-bouton');
  await pg.waitForTimeout(200);
  ok('il s\'ouvre au clic', await pg.isVisible('#cpt-menu'), true);
  ok('l\'adresse du compte y figure',
     /contact@ouragan\.fr/.test(await pg.textContent('.cpt-tete')), true);
  ok('il mene a l\'espace club, a la fiche et au compte',
     await pg.evaluate(() => Array.from(document.querySelectorAll('.cpt-liens a'))
       .map(a => a.getAttribute('href'))),
     ['espace-club.html', 'referencer.html', 'salle.html?s=team-ouragan-boxe-marseille',
      'mon-compte.html', 'admin.html']);
  await pg.keyboard.press('Escape');
  await pg.waitForTimeout(150);
  ok('et se referme avec Echap', await pg.isVisible('#cpt-menu'), false);

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
  ok('et le bandeau porte le nom de la salle', await pg.textContent('.cpt-nom'), 'Team Ouragan Boxe');

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

  /* Amaury, 23/09/2026 : en cherchant le reglage de la confirmation il a eteint
     le fournisseur e-mail, et Supabase a repondu « Email signups are disabled »,
     en anglais, dans la fenetre. Ces messages-la se traduisent. */
  ok('un fournisseur e-mail eteint se dit en francais',
     await pg.evaluate(() => window.MCC.dire({ message: 'Email signups are disabled' })),
     'La création de compte par e-mail est fermée pour l’instant. Réessayez plus tard, ou passez par « Continuer avec Google ».');
  ok('des inscriptions fermees aussi',
     await pg.evaluate(() => window.MCC.dire({ message: 'Signups not allowed for this instance' })),
     'Les inscriptions sont fermées pour l’instant. Réessayez plus tard.');

  console.log('');
  if (erreurs.length) {
    console.log('PROBLEMES:\n- ' + erreurs.join('\n- '));
    await b.close(); serveur.close(); process.exit(1);
  }
  console.log('tout passe');
  await b.close();
  serveur.close();
})();
