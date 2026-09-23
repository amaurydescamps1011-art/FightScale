/* Le parcours du pratiquant sur la fiche d'un vrai club : la fiche se charge
   depuis la base par son slug, ne montre rien d'invente, et la demande de
   seance d'essai part. Comme backend.cjs : serveur local + faux Supabase. */
const { chromium } = require('playwright');
const http = require('http'), fs = require('fs'), path = require('path');

const RACINE = __dirname + '/../site';
const T = {'.html':'text/html; charset=utf-8','.js':'text/javascript','.svg':'image/svg+xml',
           '.jpg':'image/jpeg','.png':'image/png','.webp':'image/webp'};
const faux = fs.readFileSync(__dirname + '/../_faux_sb.js', 'utf8');

const ETAT = {
  session: null, users: {}, equipe: [], club_membre: [],
  club: [{
    id: 'c1', statut: 'publie', slug: 'team-ouragan-boxe',
    nom: 'Team Ouragan Boxe', ville: 'Marseille',
    adresse: '24 rue des Chartreux', code_postal: '13004',
    disciplines: ['Boxe anglaise', 'Kickboxing'], photos: [],
    presentation: 'Une salle de quartier ouverte à tous.\n\nLe premier cours est gratuit.',
    tel: '06 12 34 56 78', mail: 'contact@teamouragan.fr', site: '', instagram: '', facebook: '',
    horaires: { lundi: ['18:00','21:00'], mardi: ['18:00','21:00'], mercredi: ['10:00','21:00'],
                jeudi: ['18:00','21:00'], vendredi: ['18:00','20:00'] },
    offre: 'pro'
  }, {
    /* le meme club, mais sur la fiche gratuite : la reservation en ligne est ce
       que le Pro achete, donc elle ne doit exister ni dans la page ni en base */
    id: 'c2', statut: 'publie', slug: 'boxing-club-lyon',
    nom: 'Boxing Club Lyon', ville: 'Lyon',
    adresse: '9 rue de la Part-Dieu', code_postal: '69003',
    disciplines: ['Boxe anglaise'], photos: [],
    presentation: 'Le club de boxe du quartier.',
    tel: '04 78 00 00 00', mail: 'contact@bclyon.fr', site: '', instagram: '', facebook: '',
    horaires: { lundi: ['18:00','21:00'] },
    offre: 'gratuit'
  }, {
    /* un club Pro qui a saisi son planning : c'est lui que la reservation doit
       proposer, et rien d'autre (Amaury, 23/09/2026) */
    id: 'c3', statut: 'publie', slug: 'academie-du-vieux-port',
    nom: 'Académie du Vieux-Port', ville: 'Marseille',
    adresse: '3 quai du Port', code_postal: '13002',
    disciplines: ['MMA', 'Grappling'], photos: [],
    presentation: 'Le MMA sur le port.',
    tel: '04 91 00 00 00', mail: 'contact@avp.fr', site: '', instagram: '', facebook: '',
    horaires: { mardi: ['18:00','21:00'], jeudi: ['18:00','21:00'] },
    cours: [
      { id: 'j4x2', jour: 3, de: '19:00', a: '20:30', quoi: 'Grappling', niveau: '' },
      { id: 'k3f9', jour: 1, de: '20:00', a: '21:30', quoi: 'MMA', niveau: 'Confirmés' },
      { id: 'm7p1', jour: 1, de: '18:30', a: '20:00', quoi: 'MMA', niveau: 'Débutants' }
    ],
    offre: 'pro'
  }],
  demande: [], fichiers: []
};

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

  console.log('\n1. la fiche vient de la base');
  await p.goto(base + 'salle.html?s=team-ouragan-boxe', { waitUntil: 'networkidle' });
  await p.waitForTimeout(700);
  const f = await p.evaluate(() => ({
    visible: !document.getElementById('fiche').hidden,
    introuvable: !document.getElementById('introuvable').hidden,
    nom: (document.getElementById('s-nom').textContent || '').trim(),
    titre: document.title,
    meta: (document.getElementById('s-meta').textContent || '').trim(),
    note: !!document.querySelector('#s-meta .note'),
    avis: !document.getElementById('avis').hidden,
    equip: !document.getElementById('equipements').hidden,
    horaires: !document.getElementById('horaires').hidden,
    titreHoraires: document.querySelector('#horaires .pan-titre').textContent,
    jours: [...document.querySelectorAll('#s-semaine .c .h')].map(e => e.textContent),
    faits: [...document.querySelectorAll('#s-faits dt')].map(e => e.textContent),
    presentation: document.querySelectorAll('#s-presentation p').length,
    reclamer: document.querySelector('.pan-club').hidden,
    essai: !document.getElementById('essai').hidden,
    coord: [...document.querySelectorAll('#s-coord .quoi')].map(e => e.textContent)
  }));
  dit(f.visible && !f.introuvable, 'la fiche s’affiche');
  dit(f.nom === 'Team Ouragan Boxe', 'avec le nom du club');
  dit(/Team Ouragan Boxe/.test(f.titre), 'et le titre de l’onglet : ' + f.titre);
  dit(!f.note, 'aucune note inventée');
  dit(!f.avis, 'aucun bloc d’avis');
  dit(!f.equip, 'aucun équipement inventé');
  dit(f.faits.join(',') === 'Disciplines,Amplitude', 'les faits se limitent au su : ' + f.faits.join(', '));
  dit(f.presentation === 2, 'la présentation garde ses deux paragraphes');
  dit(f.horaires && f.titreHoraires === 'Horaires d’ouverture', 'les horaires, pas un planning de cours');
  dit(f.jours.length === 5 && f.jours[0] === '18h00 – 21h00', '5 jours ouverts, ' + f.jours[0]);
  dit(/18h00 – 21h00/.test(f.meta) === false && /Marseille/.test(f.meta), 'l’adresse dans le chapeau');
  dit(f.reclamer, '« Réclamer ma fiche » disparaît : le club l’a déjà');
  dit(f.essai, 'le formulaire de séance d’essai est là');
  dit(f.coord.length === 2, 'les coordonnées données, et elles seules');

  console.log('\n2. le plan suit la ville');
  const plan = await p.evaluate(() => ({
    carte: !document.querySelector('.mini-carte').hidden,
    itineraire: !document.getElementById('s-itineraire').hidden,
    adresse: document.getElementById('s-adresse').textContent
  }));
  dit(plan.carte && plan.itineraire, 'le plan et l’itinéraire s’affichent');
  dit(/13004 Marseille/.test(plan.adresse), 'l’adresse complète : ' + plan.adresse.replace(/\s+/g, ' '));

  console.log('\n3. la demande de séance d’essai');
  const disc = await p.evaluate(() => [...document.querySelectorAll('#e-disc option')].map(o => o.textContent));
  dit(disc.length === 3 && disc[1] === 'Boxe anglaise', 'les disciplines du club sont proposées');

  await p.click('#e-envoi');
  await p.waitForTimeout(200);
  const vide = await p.evaluate(() => ({
    erreur: !document.getElementById('e-erreur').hidden,
    envoye: document.getElementById('essai-form').hidden
  }));
  dit(vide.erreur && !vide.envoye, 'sans nom ni e-mail, rien ne part');

  await p.fill('#e-nom', 'Karim B.');
  await p.fill('#e-mail', 'karim@exemple.fr');
  await p.fill('#e-tel', '06 22 33 44 55');
  await p.selectOption('#e-disc', 'Boxe anglaise');
  await p.fill('#e-quand', 'Mardi soir');
  await p.fill('#e-mot', 'Je débute.');
  await p.click('#e-envoi');
  await p.waitForTimeout(400);
  const envoi = await p.evaluate(() => ({
    merci: !document.getElementById('e-merci').hidden,
    form: document.getElementById('essai-form').hidden,
    base: JSON.parse(sessionStorage.getItem('faux')).demande
  }));
  dit(envoi.merci && envoi.form, 'le remerciement remplace le formulaire');
  dit(envoi.base.length === 1, 'une demande est arrivée dans la base');
  const d = envoi.base[0] || {};
  dit(d.statut === 'recue', 'à l’état « reçue », jamais confirmée d’office');
  dit(d.club_id === 'c1' && d.nom === 'Karim B.' && d.mail === 'karim@exemple.fr',
      'avec le bon club et les bonnes coordonnées');
  dit(d.discipline === 'Boxe anglaise' && d.creneau === 'Mardi soir', 'la discipline et le créneau');

  console.log('\n4. la salle de démonstration ne reçoit rien');
  await p.goto(base + 'salle.html?demo=1', { waitUntil: 'networkidle' });
  await p.waitForTimeout(500);
  const demo = await p.evaluate(() => ({
    essai: !document.getElementById('essai').hidden,
    note: !!document.querySelector('#s-meta .note'),
    reclamer: !document.querySelector('.pan-club').hidden,
    bandeau: !document.getElementById('bandeau-demo').hidden
  }));
  dit(!demo.essai, 'pas de formulaire de réservation');
  dit(demo.note && demo.reclamer && demo.bandeau, 'la fiche d’exemple n’a pas bougé');

  console.log('\n5. la fiche gratuite ne donne ni coordonnées ni réservation');
  await p.goto(base + 'salle.html?s=boxing-club-lyon', { waitUntil: 'networkidle' });
  await p.waitForTimeout(600);
  const grat = await p.evaluate(() => ({
    visible: !document.getElementById('fiche').hidden,
    essai: !document.getElementById('essai').hidden,
    ancre: !!document.querySelector('#s-actions a[href="#essai"]'),
    actions: document.querySelectorAll('#s-actions .btn').length,
    coordVu: !document.getElementById('pan-coord').hidden,
    fermeVu: !document.getElementById('pan-coord-ferme').hidden,
    /* le telephone ne doit apparaitre nulle part dans la page, meme pas dans
       un href : c'est ce qu'un curieux irait chercher */
    telDansPage: /0478|04 78|bclyon/.test(document.body.innerHTML),
  }));
  dit(grat.visible, 'la fiche gratuite s’affiche quand même');
  dit(!grat.essai && !grat.ancre, 'ni formulaire ni bouton de réservation');
  dit(grat.actions === 0, 'et aucun bouton d’action : ni appel, ni e-mail');
  dit(!grat.coordVu && grat.fermeVu, 'le bloc contact est remplacé par le bloc fermé');
  dit(!grat.telDansPage, 'le téléphone du club n’est nulle part dans la page');

  /* La page ne peut pas cacher ce que la base ne lui a pas donne : c'est la vue
     `annuaire` qui remplace les coordonnees d'un club gratuit par null. */
  const brut = await p.evaluate(() => window.MCC.client.from('annuaire')
    .select('*').eq('slug', 'boxing-club-lyon').limit(1)
    .then(r => r.data[0])
    .then(c => [c.tel, c.mail, c.instagram, c.facebook, c.site].join('|')));
  dit(brut === '||||' || /^(null|)\|/.test(brut),
      'et la base elle-même ne les rend pas (' + JSON.stringify(brut) + ')');

  /* et pas seulement dans la page : la politique d'acces refuse le depot */
  const force = await p.evaluate(() => window.MCC.deposeDemande('c2', {
    nom: 'Forceur', mail: 'f@exemple.fr' }).then(() => 'accepte', e => 'refuse'));
  dit(force === 'refuse', 'une demande envoyée à la main est refusée par la base');
  dit(await p.evaluate(() => JSON.parse(sessionStorage.getItem('faux')).demande.length) === 1,
      'la base n’a toujours qu’une demande');

  console.log('\n6. un slug inconnu');
  await p.goto(base + 'salle.html?s=nawak', { waitUntil: 'networkidle' });
  await p.waitForTimeout(600);
  dit(await p.evaluate(() => !document.getElementById('introuvable').hidden),
      'la page « cette salle n’existe pas »');

  console.log('\n7. la réservation tombe sur un cours');
  await p.goto(base + 'salle.html?s=academie-du-vieux-port', { waitUntil: 'networkidle' });
  await p.waitForTimeout(700);
  const pl = await p.evaluate(() => ({
    titre: document.querySelector('#horaires .pan-titre').textContent,
    mardi: [...document.querySelectorAll('#s-semaine li')][1].textContent.replace(/\s+/g, ' ').trim(),
    options: [...document.querySelectorAll('#e-cours option')].map(o => o.textContent),
    ids: [...document.querySelectorAll('#e-cours option')].map(o => o.value),
    champCours: !document.getElementById('e-champ-cours').hidden,
    champQuand: !document.getElementById('e-champ-quand').hidden,
    champDisc: !document.getElementById('e-champ-disc').hidden
  }));
  dit(pl.titre === 'Planning de la semaine', 'le pavé devient un planning de cours');
  dit(/18h30 – 20h00MMADébutants20h00 – 21h30MMAConfirmés/.test(pl.mardi),
      'le mardi porte ses deux cours, dans l’ordre : ' + pl.mardi);
  dit(pl.champCours && !pl.champQuand, 'le choix du cours remplace le texte libre');
  dit(!pl.champDisc, 'la discipline n’est plus redemandée : le cours la porte');
  dit(pl.options.length === 3, 'les trois cours sont proposés');
  /* l'ordre compte : le plus tot d'abord, et le mardi avant le jeudi. Une liste
     dans l'ordre de saisie donnerait jeudi, puis 20h00, puis 18h30. */
  dit(pl.ids.join(',') === 'm7p1,k3f9,j4x2', 'dans l’ordre du planning : ' + pl.ids.join(', '));
  dit(pl.options[0] === 'Mardi 18h30 – 20h00 · MMA (Débutants)',
      'le libellé dit le jour, l’heure et la discipline : ' + pl.options[0]);

  await p.fill('#e-nom', 'Inès R.');
  await p.fill('#e-mail', 'ines@exemple.fr');
  await p.selectOption('#e-cours', 'j4x2');
  await p.click('#e-envoi');
  await p.waitForTimeout(400);
  const dc = await p.evaluate(() =>
    JSON.parse(sessionStorage.getItem('faux')).demande.filter(x => x.club_id === 'c3')[0] || {});
  dit(dc.cours_id === 'j4x2', 'la demande désigne le cours choisi');
  dit(dc.creneau === 'Jeudi 19h00 – 20h30 · Grappling', 'et en garde le libellé lisible');
  dit(dc.discipline === 'Grappling', 'la discipline vient du cours');

  console.log('\n8. au téléphone');
  await p.setViewportSize({ width: 390, height: 844 });
  await p.goto(base + 'salle.html?s=team-ouragan-boxe', { waitUntil: 'networkidle' });
  await p.waitForTimeout(600);
  dit(await p.evaluate(() => document.documentElement.scrollWidth <= 390), 'aucun débordement');

  if (errs.length) { console.log('\nERREURS :\n- ' + errs.join('\n- ')); ko += errs.length; }
  console.log('\n' + (ko ? ko + ' PROBLEME(S), ' + ok + ' ok' : 'tout passe (' + ok + ')'));
  await nav.close(); srv.close();
  process.exit(ko ? 1 : 0);
})();
