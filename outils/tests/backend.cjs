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
  await pg.click('#form-club button[type="submit"]');
  await pg.waitForTimeout(700);
  const c = await pg.evaluate(() => window.__FAUX__.club[0]);
  ok('la fiche part en verification', c.statut, 'en_attente');
  ok('l\'adresse est enregistree', c.adresse, '24 rue des Chartreux');
  ok('la ville est enregistree', c.ville, 'Marseille');
  ok('la presentation aussi', c.presentation, 'Une salle de boxe au cœur de Marseille.');
  ok('les disciplines aussi', c.disciplines, ['Boxe anglaise', 'Kickboxing']);
  ok('les horaires aussi', Object.keys(c.horaires).length, 6);
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
  await garde();

  // ---------- 6. se reconnecter ----------
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

  console.log('');
  if (erreurs.length) {
    console.log('PROBLEMES:\n- ' + erreurs.join('\n- '));
    await b.close(); serveur.close(); process.exit(1);
  }
  console.log('tout passe');
  await b.close();
  serveur.close();
})();
